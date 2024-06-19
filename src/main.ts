import { DocumentDriveServer } from "document-drive";
import {
    module as DocumentModelLib,
} from 'document-model/document-model';
import {
    utils as DocumentDriveUtils,
    reducer,
    actions,
    DocumentDriveDocument
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { ArbitrumLtipGranteeDocument, actions as arbActions, reducer as arbReducer, InitGranteeInput } from 'document-model-libs/arbitrum-ltip-grantee';
import { ActionSigner, DocumentModel } from "document-model/document";
import { v4 as uuid } from "uuid";
import dotenv from "dotenv";
import grants from '../arbitrumGrants.json';
dotenv.config();

const deleteFoldersAndFiles = async (driveServer: DocumentDriveServer, driveId: string) => {
    const documents = await driveServer.getDocuments(driveId);
    return Promise.all(documents.map(e => driveServer.deleteDocument(driveId, e)))
}


const addFoldersAndDocuments = async (driveServer: DocumentDriveServer, driveName: string) => {
    let docId = uuid()
    let folderId = uuid();
    let drive = await driveServer.getDrive(driveName);
    let document: ArbitrumLtipGranteeDocument;

    const parsedGrants = cleanJSON(grants);
    // sort alphabetically the json by granteeName

    const sortedGrants = parsedGrants.sort((a: any, b: any) => {
        if (a.granteeName.toUpperCase() < b.granteeName.toUpperCase()) {
            return -1;
        }
        return 1;
    })

    // Define folder names and ranges
    const folderRanges = ["A-F", "G-L", "M-R", "S-Z"];
    const folders = folderRanges.map(range => ({
        id: uuid(),
        name: `Grants ${range}`
    }));

    // Create folders
    for (const folder of folders) {
        drive = reducer(
            drive,
            actions.addFolder({
                id: folder.id,
                name: folder.name
            })
        );
        await driveServer.queueDriveOperations(driveName, drive.operations.global.slice(-1));
    }



    for (let grant of sortedGrants) {
        docId = uuid();

        // Determine the correct folder based on the first letter of granteeName
        const firstLetter = grant.granteeName.toUpperCase().charAt(0);
        let folderId;
        if (firstLetter >= 'A' && firstLetter <= 'F') {
            folderId = folders[0].id;
        } else if (firstLetter >= 'G' && firstLetter <= 'L') {
            folderId = folders[1].id;
        } else if (firstLetter >= 'M' && firstLetter <= 'R') {
            folderId = folders[2].id;
        } else { // S-Z
            folderId = folders[3].id;
        }

        // create new document in folder with generated sync unit
        drive = reducer(
            drive,
            DocumentDriveUtils.generateAddNodeAction(
                drive.state.global,
                {
                    id: docId,
                    name: grant.granteeName || "Grantee",
                    documentType: 'arbitrum/ltip-grantee',
                    parentFolder: folderId, // get the random id from the folder
                },
                ['global', 'local']
            )
        );

        // queue last 1 drive operations
        const driveOperations = drive.operations.global.slice(-1);
        await driveServer.queueDriveOperations(driveName, driveOperations);

        // retrieve new created document
        document = (await driveServer.getDocument(
            driveName,
            docId
        )) as ArbitrumLtipGranteeDocument;

        let editorAddresses = grant.editorAddresses;
        if (Array.isArray(grant.editorAddresses)) {
            editorAddresses = grant.editorAddresses.join(', ');
        }

        const grantee: InitGranteeInput = {
            granteeName: grant.granteeName,
            startDate: grant.startDate,
            grantSize: grant.grantSize,
            authorizedSignerAddress: grant.authorizedSignerAddress,
            disbursementContractAddress: grant.disbursementContractAddress,
            fundingAddress: grant.fundingAddress,
            fundingType: ["EOA"],
            metricsDashboardLink: grant.metricsDashboardLink,
            grantSummary: grant.grantSummary,
            matchingGrantSize: grant.grantSize,
            numberOfPhases: 8,
            phaseDuration: 14
        }

        console.log(grantee)

        // create gramt
        document = arbReducer(
            document,
            arbActions.initGrantee(grantee)
        );

        // add editor addresses
        for (let editorAddress of grant.editorAddresses) {
            const signer: ActionSigner = {
                app: {
                    name: 'Connect',
                    key: '',
                },
                user: {
                    address: grant.authorizedSignerAddress,
                    networkId: "eip155",
                    chainId: 42161,
                },
                signature: '',
            };


            const newVar = arbActions.addEditor({ editorAddress })

            document = arbReducer(
                document,
                { ...newVar, context: { signer } }
            );
        }

        console.log('document', document.state.global)

        // queue new created operations for processing
        const result = await driveServer.queueOperations(driveName, docId, document.operations.global.slice(-1 * (1 + grant.authorizedSignerAddress.length)));
        console.log('Adding grant', result.document?.state?.global?.granteeName);
        await sleep(3000)
    }

}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function main() {
    console.time('script');
    // select document models
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    // init drive server with document models
    const driveServer = new DocumentDriveServer(documentModels);
    await driveServer.initialize();

    // if remote document drive is given init remote drive otherwise add local drive
    const remoteDriveUrl = process.env.REMOTE_DOCUMENT_DRIVE ?? undefined
    if (!remoteDriveUrl) {
        throw new Error("Remote Drive not configured");
    }

    const driveName = remoteDriveUrl.split("/")!.slice(-1)[0];

    if (!driveName) {
        throw new Error("Could not extract drivename from remote Drive URL");
    }

    let drive: DocumentDriveDocument;
    const listenerId = uuid();
    drive = await driveServer.addRemoteDrive(remoteDriveUrl!, {
        availableOffline: true, listeners: [
            {
                block: true,
                callInfo: {
                    data: remoteDriveUrl,
                    name: 'switchboard-push',
                    transmitterType: 'SwitchboardPush',
                },
                filter: {
                    branch: ['main'],
                    documentId: ['*'],
                    documentType: ['*'],
                    scope: ['global'],
                },
                label: 'Switchboard Sync',
                listenerId,
                system: true,
            },
        ], sharingType: "public", triggers: [], pullInterval: 100
    });

    let synced = false;

    driveServer.on("syncStatus", async (driveId, syncStatus) => {

        if (synced) {
            return;
        }

        if (driveId !== driveName || syncStatus !== "SUCCESS") {
            return;
        }

        synced = true;
        await addFoldersAndDocuments(driveServer, driveName);
        await driveServer.addDriveAction(drive.state.global.id, actions.removeListener({ listenerId }));
        console.timeEnd('script');
        process.exit(0);

    })

}

const cleanJSON = (json: any) => {
    const parsedGrants = grants.map((grant: any) => {
        let grantSize = grant.grantSize == 0 ? 1 : grant.grantSize;
        if (typeof grant.grantSize == 'string') {
            grantSize = parseFloat(grant.grantSize.match(/\d+/)[0] == 0 ? 1 : grant.grantSize.match(/\d+/)[0]);
        }
        const editorAddresses = grant.editorAddress.split(',')
            .map((address: string) => {
                const trimAddress = address.trim();
                const cleanAddress = trimAddress.match(/0x[a-fA-F0-9]{40}/);
                return cleanAddress ? cleanAddress[0] : '';
            })

        let fundingAddress = grant.fundingAddress.match(/0x[a-fA-F0-9]{40}/)
        if (!fundingAddress) {
            return null;
        }
        return {
            granteeName: grant.granteeName,
            startDate: grant.startDate,
            grantSize,
            authorizedSignerAddress: grant.authorisedSignerAdress,
            editorAddresses: editorAddresses,
            disbursementContractAddress: grant.disbursementContractAddress.match(/0x[a-fA-F0-9]{40}/)[0] || '',
            fundingAddress: fundingAddress[0],
            metricsDashboardLink: grant.metricsDashboardLink,
            grantSummary: grant.grantSummary
        }
    })

    return parsedGrants.filter((grant: any) => grant !== null);
}

main();
