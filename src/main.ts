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
    try {
        document = (await driveServer.getDocument(driveName, docId)) as ArbitrumLtipGranteeDocument
    } catch (e) {
        // add folder
        drive = reducer(
            drive,
            actions.addFolder({
                id: folderId, // make it random
                name: "Grants"
            })
        )
        await driveServer.queueDriveOperations(driveName, drive.operations.global.slice(-1));

        const parsedGrants = cleanJSON(grants);

        for (let grant of parsedGrants) {
            docId = uuid();

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
            // await driveServer.addDriveOperations(driveName, drive.operations.global.slice(-1));
            const driveOperations = drive.operations.global.slice(-1);
            await driveServer.queueDriveOperations(driveName, driveOperations);

            // retrieve new created document
            document = (await driveServer.getDocument(
                driveName,
                docId
            )) as ArbitrumLtipGranteeDocument;

            let authorizedSignerAddresses = grant.authorizedSignerAddress;
            if (Array.isArray(grant.authorizedSignerAddress)) {
                authorizedSignerAddresses = grant.authorizedSignerAddress.join(', ');
            }

            const grantee: InitGranteeInput = {
                granteeName: grant.granteeName,
                startDate: grant.startDate,
                grantSize: grant.grantSize,
                authorizedSignerAddress: grant.authorizedSignerAddress[0],
                disbursementContractAddress: grant.disbursementContractAddress,
                fundingAddress: grant.fundingAddress,
                fundingType: ["EOA"],
                metricsDashboardLink: grant.metricsDashboardLink,
                grantSummary: grant.grantSummary,
                matchingGrantSize: grant.grantSize,
                numberOfPhases: 1,
                phaseDuration: 1
            }

            console.log(grantee)

            // create gramt
            document = arbReducer(
                document,
                arbActions.initGrantee(grantee)
            );

            // add editor addresses
            for (let editorAddress of grant.authorizedSignerAddress) {
                const signer: ActionSigner = {
                    app: {
                        name: 'Connect',
                        key: '',
                    },
                    user: {
                        address: grant.authorizedSignerAddress[0],
                        networkId: "1",
                        chainId: 1,
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
            // const result = await driveServer.addOperations(driveName, docId, document.operations.global.slice(-1));
            const result = await driveServer.queueOperations(driveName, docId, document.operations.global.slice(-1 * (1 + grant.authorizedSignerAddress.length)));
            console.log('Adding grant', result.document?.state?.global?.granteeName);
            // let resultDrive = await driveServer.getDrive(driveName);
            // console.log('Drive:', resultDrive)
        }

    }


    // create new operations with document model actions
    // document = arbReducer(
    //     document,
    //     arbActions.addEditor({
    //         editorAddress: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C"
    //     })
    // );

    // // queue new created operations for processing
    // const result = await driveServer.addOperations(driveName, docId, document.operations.global.slice(-2));
    // console.log(result.document?.state);

}

async function main() {
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
                listenerId: '1',
                system: true,
            },
        ], sharingType: "public", triggers: [], pullInterval: 100
    });

    let synced = false;

    driveServer.on("syncStatus", async (driveId, syncStatus) => {

        if (synced && syncStatus === "SUCCESS") {
            return process.exit(0);
        }

        if (driveId !== driveName || syncStatus !== "SUCCESS") {
            return;
        }

        await addFoldersAndDocuments(driveServer, driveName);
        synced = true;
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

        let fundingAddress = grant.fundingAddress;
        if (Array.isArray(grant.fundingAddress)) {
            fundingAddress = grant.fundingAddress[0].match(/0x[a-fA-F0-9]{40}/);
        }

        return {
            granteeName: grant.granteeName,
            startDate: grant.startDate,
            grantSize,
            authorizedSignerAddress: editorAddresses,
            disbursementContractAddress: grant.disbursementContractAddress.match(/0x[a-fA-F0-9]{40}/)[0] || '',
            fundingAddress: fundingAddress,
            metricsDashboardLink: grant.metricsDashboardLink,
            grantSummary: grant.grantSummary
        }
    })
    return parsedGrants;
}

main();
