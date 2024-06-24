# Integration script for adding Arbitrum grant documents to the Connect Drive

Export the data from your preffered source into a json file like the example in this repo: `arbitrumGrants.json`.

Connect script to the switchboard drive, either locally or remotely and run the script.

## Installation

Setup `.env` file with switchboard drive link. Below you can see an example link.

```bash
##Local drive
REMOTE_DOCUMENT_DRIVE="http://localhost:3000/d/arbitrum-testdrive1"
# OR
REMOTE_DOCUMENT_DRIVE="<renoteLinkToDrive>/d/<driveName>"
```

```bash
# Install dependencies
pnpm i

## Run script
pnpm dev
```

## See grants in connect

If you are running this script locally, you need to add the same `REMOTE_DOCUMENT_DRIVE` link to `.env` in the [Connect](https://github.com/powerhouse-inc/connect) repo. Then you'll be able to see the script results.

## Local Setup

Required repos:

- [Connect](https://github.com/powerhouse-inc/connect)
- [Switchboard](https://github.com/powerhouse-inc/switchboard)
- This integration template script
  
Clone above two repos locally and make sure both connect and switchboard have the same `package.json` versioning (doesn't matter what version, but they should match) for below dependencies:

```json
"document-drive"
"document-model"
"document-model-libs"
```

### Steps

1. Run the switchboard server locally - use the docker compose command in the switchboard repo.
2. Open switchboard explorer, usually at `http://localhost:3000/explorer` and create new drive with below query:

    ```graphql
        mutation addDrive(
        $global: DocumentDriveStateInput!
        $local: DocumentDriveLocalStateInput!
        ) {
        addDrive(global: $global, local: $local) {
            global {
                id
                name
            }
            local {
                sharingType
                availableOffline
            }
        }
        }

        # Variables
        { 
        "global": {
            "id": "arbitrum-testdrive1",
            "name": "Arbitrum Testdrive",
            "slug": "",
            "icon": "https://ipfs.io/ipfs/bafybeihrnutsfwwrfwere74cwilx2eusmaop6rq6ojcr5jl7vsta627eam/arbitrum-arb-logo.png"
        },
        "local": {"sharingType": "private", "availableOffline": false}
        }
    ```

3. Set `.evn` `REMOTE_DOCUMENT_DRIVE="http://localhost:3000/d/arbitrum-testdrive1"` → `arbitrum-testdrive1` being the drive name. Set this both in the connect and integration template repos.
4. Run connect repo with `npm run dev:web`
5. Run this integration script with `pnpm dev`
6. Check results in the connect app at `http://localhost:5173/`

To clenup the drive, you can use the below query:

1. Open switchboard explorer and run the below query:

    ```graphql
    mutation deleteDrive {
    deleteDrive(id: "arbitrum-testdrive1")
    }
    ```

2. Recreate the drive again from above step 2.
3. Run the integration script again
4. Clean storage on connect app.
