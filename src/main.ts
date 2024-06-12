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
import { ArbLtipGranteeDocument, actions as arbActions, reducer as arbReducer } from 'document-model-libs/arb-ltip-grantee';
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
    if (!remoteDriveUrl) {
        throw new Error("Remote Drive not configured");
    }

    const driveName = remoteDriveUrl.split("/")!.slice(-1)[0];

    let drive: DocumentDriveDocument;
    drive = await driveServer.addRemoteDrive(remoteDriveUrl!, { availableOffline: true, listeners: [], sharingType: "public", triggers: [] });
    driveServer.on("syncStatus", async (driveId, syncStatus) => {
        if (driveId !== driveName || syncStatus !== "SUCCESS") {
            return;
        }

        drive = await driveServer.getDrive(driveName);
        console.log(drive.state.global);

        // add folder
        drive = reducer(
            drive,
            actions.addFolder({
                id: '2',
                name: "Folder"
            })
        )

        // create new document in folder with generated sync unit
        drive = reducer(
            drive,
            DocumentDriveUtils.generateAddNodeAction(
                drive.state.global,
                {
                    id: '2.1',
                    name: 'document 1',
                    documentType: 'ArbLtipGrantee',
                    parentFolder: "2"
                },
                ['global', 'local']
            )
        );

        // queue last 2 drive operations
        const driveResult = await driveServer.addDriveOperations(driveName, drive.operations.global.slice(-2));

        // retrieve new created document
        let document = (await driveServer.getDocument(
            driveName,
            '2.1'
        )) as ArbLtipGranteeDocument;

        document = arbReducer(
            document,
            arbActions.initGrantee({
                authorizedSignerAddress: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
                disbursementContractAddress: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
                fundingAddress: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
                fundingType: ["EOA"],
                granteeName: "Frank",
                grantSize: 1_000_000,
                grantSummary: "arbitrum import script for powerhouse",
                matchingGrantSize: 1_000_000,
                metricsDashboardLink: "https://arbgrants.com",
                startDate: "2024-06-12T12:00:00Z",
                numberOfPhases: 1,
                phaseDuration: 1
            })
        );

        // create new operations with document model actions
        // document = arbReducer(
        //     document,
        //     arbActions.addEditor({
        //         editorAddress: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C"
        //     })
        // );


        try {
            // queue new created operations for processing
            const result = await driveServer.addOperations(driveName, '2.1', document.operations.global.slice(-2));
            console.log(result);
        } catch (e) {
            console.error(e);
        }
    })


}

main();
