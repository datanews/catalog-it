# Catalog It

Tool to download Socrata data and keep revisions on S3.

## Install

`npm install catalog-it -g`

## Use

Catalog is just a running program.  It will only stop if an error occurs.

`catalog-it data-portal --cred=something`

Running with Forever is suggested:

`forever catalog-it ...`
