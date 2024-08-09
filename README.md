# Zip Upload

1. `pnpm install`
2. Set environment variables on .env file
    1. **REMOTE_DOCUMENT_DRIVE** - url of the drive to push to
    2. **FILE_PATH** - path to the file to be uploaded
    3. **FILE_NAME** - name of the file, defaults to the filename of the provided path without the extension
    4. **OPERATIONS_CHUNK_SIZE** - number of operations to send in each request, defaults to 50
    5. **OPERATIONS_CHUNK_TIMEOUT** - sleep time between each request in ms, defaults to 200
3. `pnpm start` to run script

## TODO

-   Allow providing a key to sign operations
-   Release executable script
