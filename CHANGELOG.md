# dmptool-narrative-generator

## Added
- Added override for `axios` dependency
- Added override for `fast-xml-parser` and `flatted` dependencies
- Added override for `minimatch` dependency
- Added `@dmptool/utils` package
- Added new `dataAccess` file that works with the `@dmptool/utils` package
- Added a Dependabot config file
- Added this `CHANGELOG.md`, `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` files

## Updated
- Updated `puppeteer` and `turbodocx/html-to-docx` dependencies
- Updated renovate config to rebase when behind the base branch
- Fixed an issue with a check to determine if the maDMP is missing or just outdated
- Updated `docx.ts` so that borders display around tables
- Updated `html.ts` to format layout for `researchOutputTable` question types
- Updated override for `minimatch` dependency and updated all dependencies
- Added `renovate` config
- Fixed issue with narrative generation by adding undefined checks to handlebars functions
- Upgraded dependencies
- Update the `server` file to use the new `dataAccess` file and to get its logger from `@dmptool/utils`
- Updated `server` file so that it will first try to get maDMP from Dynamo, will then try to build the maDMP from the MySQL record if none was found in Dynamo (and save it to Dynamo)
- Updated `html` and `csv` to work with RDA Common Standard `v1.2`
- Updated `dotenv`, `mysql2`, `@eslint/js`, `fast-check` and `puppeteer` dependencies
- Updated the `glob` and `js-yaml` dependencies

## Deleted
- Removed overrides for `picomatch`, `brace-expansion`, `flatted`, `lodash` and `path-to-regexp`
- Removed override for `minimatch` dependency
- Removed old dependabot config (we now use renovate)
- Removed the old `logger`, `mysql` and `dynamo` files
- Removed the `@types/eslint__js` dependency as `@eslint/js` includes its own types now
