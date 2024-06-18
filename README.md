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

If you are running this script locally, you need to add the same `REMOTE_DOCUMENT_DRIVE` link to `.env` in the connect repo. Then you'll be able to see the script results.

- [Connect](https://github.com/powerhouse-inc/connect)
- [Switchboard](https://github.com/powerhouse-inc/switchboard)