import { DocumentDriveServer } from "document-drive";
import {
    module as DocumentModelLib,
} from 'document-model/document-model';
import {
    utils as DocumentDriveUtils,
    reducer,
    DocumentDriveDocument
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { RealWorldAssetsDocument, actions as rwaActions, reducer as rwaReducer } from 'document-model-libs/real-world-assets';
import { DocumentModel } from "document-model/document";
import dotenv from "dotenv";
dotenv.config();


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
    let drive: DocumentDriveDocument;
    if (remoteDriveUrl) {
        drive = await driveServer.addRemoteDrive(remoteDriveUrl, { availableOffline: true, listeners: [], sharingType: "private", triggers: [] });
    } else {
        drive = await driveServer.addDrive({
            global: {
                name: "Powerhouse Testdrive",
                icon: null,
                slug: "powerhouse-testdrive",
                id: "powerhouse-testdrive"
            },
            local: {
                availableOffline: true,
                listeners: [],
                sharingType: "private",
                triggers: []
            }
        })
    }

    // create new document on drive
    drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
            drive.state.global,
            {
                id: '1.1',
                name: 'document 1',
                documentType: 'makerdao/rwa-portfolio'
            },
            ['global', 'local']
        )
    );

    // queue drive operation
    await driveServer.queueDriveOperation('powerhouse-testdrive', drive.operations.global[0]!);

    // retrieve new created document
    let document = (await driveServer.getDocument(
        'powerhouse-testdrive',
        '1.1'
    )) as RealWorldAssetsDocument;

    // create new operations with document model actions
    document = rwaReducer(
        document,
        rwaActions.createAccount({ id: "abc", reference: "test", label: "123" })
    );

    document = rwaReducer(
        document,
        rwaActions.createAccount({ id: "abc2", reference: "test2", label: "1234" })
    );

    // queue new created operations for processing
    const result = await driveServer.queueOperations('powerhouse-testdrive', '1.1', document.operations.global);
    console.log(result);

}

main();