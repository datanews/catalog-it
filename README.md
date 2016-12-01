# Catalog It

Tool to download all data from a Socrata data portal and keep revisions on S3.

## Command line

Install: `npm install catalog-it -g`

Use `catalog-it --help` to show this help page.

```
  Usage: catalog-it [options] [command]


  Commands:

    update|u    Fetch the list of datasets.
    changed|c   Look at each dataset to see what has changed.
    data|d      Archive data that has changed.
    one|o <id>  Get one dataset; more useful for testing.

  Options:

    -h, --help                    output usage information
    -V, --version                 output the version number
    -c, --catalog <catalog>       The domain where the data catalog is location, for instance: "nycopendata.socrata.com"
    -b, --bucket <bucket>         S3 bucket
    -p, --profile [profile]       Name of the profile in .aws/credentials to use.  Overrides key options
    --access-key-id [key]         AWS access key to use.  It is suggest to use the AWS_ACCESS_KEY_ID instead
    --secret-access-key [key]     AWS secret key to use.  It is suggest to use the AWS_SECRET_ACCESS_KEY instead
    -a, --acl [acl]               ACL of items, defaults to "private"; should be "private", "public-read", "public-read-write", or "authenticated-read"
    -C, --concurrency [int]       Concurrency of fetching datasets and uploading to S3, defaults to 5
    -f, --format [format]         Format of data download, defaults to "csv"; should be "csv" or "json"
    -r, --prefix [path]           The path prefix for S3 items; for example: "backups/catalogs"
    -t, --timeout [milleseconds]  Timeout for uploads and downloads in milliseconds, defaults to 100000 (Socrata can be slow)
    -P, --path [path]             Path to directory where cache will live, defauls to "HOME/.catalog-it"
    -o, --config [path]           Path to environment variable file as defined by the "dotenv" module.
    --compress                    Compress with gzip when uploading to S3 (saves space); this is the default;
    --no-compress                 Do not compress with gzip when uploading to S3 (saves space).
    --bucket-create               Attempt to create the bucket on start; this is the default.
    --no-bucket-create            Do not attempt to create the bucket on start.
```

The command line will also look for environment variables and use those if they are not provided by the command line.  Each environment variable should be prefixed with `CATALOG_IT_`.  The command line will also try to read in an `.env` file if it exists, or the file provided by the `--config` option.

## Module

Install: `npm install catalog-it --save`

Catalog It can also be used as a JS module.  Simply include and use the same options as the command line except that the option properties are camelcase and the `config` option is not used.

```js
const CatalogIt = require('catalog-it');
let c = new CatalogIt({
  catalog: 'something.catalog.com',
  bucket: 'my-s3.bucket',
  profile: 'default'
});
```

The module also supports using environment variables but will not read in any file.

### Properties and methods

* `catalog`: Current catalog in memory.
* `updateCatalog(function(error, catalog) { ... })`: Gets new catalog and updates existing.
* `scanHeaders(function(errors, updates) { ... })`: Gets info from headers to determine what needs changing.  This function will skip network errors.
* `scanData(function(errors, updates) { ... })`: Gets new data and archives to S3.  This function will skip network errors.

## Scheduling

Scheduling can happen however you like, but here is a cron example that runs once a week on Sunday at 2AM.  This updates the list of datasets, determines which ones have changed, and then archives the data.

```
0 2 * * 0 catalog-it u && catalog-it c && catalog-it d;
```
