import Path from "path";
import fs from "fs/promises";
import { setTimeout } from "node:timers/promises";
import {
    generateUUID,
    ListenerRevision,
    OperationUpdate,
    PullResponderTransmitter,
    SwitchboardPushTransmitter,
} from "document-drive";
import { requestPublicDrive } from "document-drive/utils/graphql";
import { module as DocumentModelLib } from "document-model/document-model";
import {
    utils as DriveUtils,
    DocumentDriveState,
    reducer,
    DocumentDriveAction,
} from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { utils, Document, Operation } from "document-model/document";
import dotenv from "dotenv";

dotenv.config();

const OPERATIONS_CHUNK_SIZE = process.env.OPERATIONS_CHUNK_SIZE
    ? parseInt(process.env.OPERATIONS_CHUNK_SIZE)
    : 50;

const OPERATIONS_CHUNK_TIMEOUT = process.env.OPERATIONS_CHUNK_TIMEOUT
    ? parseInt(process.env.OPERATIONS_CHUNK_TIMEOUT)
    : 200;

const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
] as const;

async function loadZip(path: string) {
    const file = await fs.readFile(path);

    // first loads the zip with the base loader
    // as the document type is not known yet
    const baseDocument = utils.loadFromInput(file, (state: Document) => state, {
        checkHashes: true,
    });

    // gets document model for the document type
    const documentType = (await baseDocument).documentType;
    const documentModel = documentModels.find(
        (d) => d.documentModel.id === documentType,
    );
    if (!documentModel) {
        throw new Error(`Document model "${documentType}" is not supported`);
    }

    // loads the document using the correct operation reducer
    const document = await documentModel.utils.loadFromInput(file);
    return document;
}

async function pushDocument(
    driveId: string,
    documentId: string,
    document: Document,
    transmitter: SwitchboardPushTransmitter,
) {
    const results: ListenerRevision[] = [];

    const operations = document.operations.global;
    console.log(`Pushing ${operations.length} operations...`);

    console.time("Push time");
    for (let i = 0; i < operations.length; i += OPERATIONS_CHUNK_SIZE) {
        const chunk = operations.slice(i, i + OPERATIONS_CHUNK_SIZE);

        const operation = chunk.at(-1);
        if (!operation) {
            break;
        }

        console.time(`${i + chunk.length}/${operations.length}`);
        const chunkResults = await transmitter.transmit(
            [
                {
                    driveId,
                    documentId,
                    scope: "global",
                    branch: "main",
                    operations: chunk.map((operation) => ({
                        index: operation.index,
                        skip: operation.skip,
                        type: operation.type,
                        id: operation.id,
                        input: operation.input,
                        hash: operation.hash,
                        timestamp: operation.timestamp,
                        context: operation.context,
                    })) as OperationUpdate[],
                    // TODO add signature
                },
            ],
            { type: "local" },
        );
        const error = chunkResults.find((r) => r.status === "ERROR");
        if (error) {
            console.error("Error pushing operations!");
            throw new Error(error.error ?? JSON.stringify(error, null, 2));
        }
        console.timeEnd(`${i + chunk.length}/${operations.length}`);
        results.push(...chunkResults);
        await setTimeout(OPERATIONS_CHUNK_TIMEOUT);
    }
    console.timeEnd("Push time");
    return results.at(0);
}

async function main() {
    const path = process.env.FILE_PATH;
    if (!path) {
        throw new Error("Path not provided");
    }
    const resolvedPath = Path.resolve(path);
    try {
        await fs.stat(resolvedPath);
    } catch (e) {
        console.error(`File not found at ${resolvedPath}`);
        throw e;
    }

    const name = process.env.FILE_NAME || Path.parse(path).name;

    const url = process.env.REMOTE_DOCUMENT_DRIVE ?? undefined;
    if (!url) {
        throw new Error("Remote Drive not configured");
    }

    // fetches drive info
    const drive = await requestPublicDrive(url);

    // build document from zip
    console.log(`Loading document from ${resolvedPath}`);
    console.time("Loading time");
    const document = await loadZip(resolvedPath);
    console.timeEnd("Loading time");
    console.log(`Loaded ${document.operations.global.length} operations`);

    // small sleep to stabilize memory after document load
    await setTimeout(100);

    // adds listener just for the drive itself
    const listenerId = await PullResponderTransmitter.registerPullResponder(
        drive.id,
        url,
        {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["powerhouse/document-drive"],
            scope: ["global"],
        },
    );

    // pulls the drive operations so we know the current index
    console.log(`Pulling drive operations...`);
    const strands = await PullResponderTransmitter.pullStrands(
        drive.id,
        url,
        listenerId,
    );
    const driveStrand = strands.find(
        (s) => s.driveId === drive.id && s.documentId === "",
    );
    if (!driveStrand) {
        throw new Error("Couldn't get drive operations");
    }

    const driveDoc = driveStrand.operations.reduce(
        (doc, operation) =>
            reducer(doc, {
                ...operation,
                scope: "global",
            } as Operation<DocumentDriveAction>),
        DriveUtils.createDocument({
            state: {
                global: drive,
                local: {},
            },
        }),
    );

    // creates a transmitter to push operations to the drive
    const pushTransmitter = new SwitchboardPushTransmitter(
        {
            driveId: drive.id,
            listenerId: "",
            block: true,
            system: true,
            filter: {} as any,
            callInfo: {
                data: url,
                transmitterType: "SwitchboardPush",
                name: drive.name,
            },
        },
        {} as any,
    );

    // generates add file operation
    const id = generateUUID();
    const initialDocument: Document = {
        ...document.initialState,
        initialState: document.initialState,
        operations: {
            global: [],
            local: [],
        },
        clipboard: [],
    };
    const action = DriveUtils.generateAddNodeAction(
        { nodes: [] } as unknown as DocumentDriveState,
        {
            id,
            name,
            documentType: document.documentType,
            document: initialDocument,
        },
        ["global"],
    );

    let newDrive = reducer(driveDoc, action);
    console.log(`Adding file "${driveStrand.operations.length}"...`);
    const operation = newDrive.operations.global.at(-1);

    if (!operation) {
        throw new Error("Couldn't build ADD_FILE operation");
    }

    // pushes add file operation
    const results = await pushTransmitter.transmit(
        [
            {
                ...driveStrand,
                operations: [operation].map(
                    ({ scope, ...rest }) => rest,
                ) as OperationUpdate[],
            },
        ],
        {
            type: "local",
        },
    );

    const result = results.at(0);
    if (!result || result?.status !== "SUCCESS") {
        console.error(
            `${result ? `${result.status}: ` : ""}Couldn't push ADD_FILE operation!`,
        );
        throw result?.error;
    }
    console.log(`File "${name}" created on the drive`);

    // pushes document operations
    await pushDocument(drive.id, id, document, pushTransmitter);

    if (!result || result?.status !== "SUCCESS") {
        console.error(
            `${result ? `${result.status}: ` : ""} Couldn't push document operations!`,
        );
        throw result?.error;
    }
    console.log(`Operations were pushed!`);
}

main().catch(console.error);
