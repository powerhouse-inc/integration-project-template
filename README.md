# Zip Upload

1. `pnpm install`
2. Set environment variables on .env file
    1. **REMOTE_DOCUMENT_DRIVE** - url of the drive to push to
    2. **FILE_PATH** - path to the file to be uploaded
    3. **FILE_NAME** - name of the file, defaults to the filename of the provided path without the extension
3. `pnpm start` to run script


## TODO

- Allow providing a key to sign operations
- Push operations by chunks instead of all in a single request
- Release executable script
