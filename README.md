# dmptool-narrative-generator
Service that generates a narrative document for a DMP in various formats. 

The structure of a request should follow this format: 
- **PATH**: `GET dmps/{:dmpId}/narrative`
- **ACCEPT HEADER**: `application/pdf` (or one of the supported formats listed below)
- **AUTH COOKIE** `dmspt` (optional auth token)
- **AUTH HEADER** (_COMING SOON_): `Bearer my_token` (optional auth token)

A narrative for any `public` DMP can be generated without an authentication cookie/header. All other DMPs require you to provide an authentication token.

The service can also respond to health checks on `/narrative-health`

## Supported Formats

The service supports the following output formats:
- **CSV** A CSV representation of the DMP (typically the cover page and appendices are excluded) [example]()
  - As header: `Accept: text/csv`
  - As extension: `/dmps/{dmpId}/narrative.csv`
- **DOCX** An editable MS Word compliant version [example]()
  - As header: `Accept: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - As extension: `/dmps/{dmpId}/narrative.docx`
- **HTML** An html representation [example](https://dmptool.org/plans/51258/export?format=html&export%5Bform%5D=true&phase_id=&export%5Bproject_details%5D=true&export%5Bsection_headings%5D=true&export%5Bquestion_text%5D=true&export%5Bunanswered_questions%5D=true&export%5Bresearch_outputs%5D=true&export%5Brelated_identifiers%5D=true&export%5Bformatting%5D%5Bfont_face%5D=Tinos%2C+serif&export%5Bformatting%5D%5Bfont_size%5D=11&export%5Bformatting%5D%5Bmargin%5D%5Btop%5D=25&export%5Bformatting%5D%5Bmargin%5D%5Bbottom%5D=25&export%5Bformatting%5D%5Bmargin%5D%5Bleft%5D=25&export%5Bformatting%5D%5Bmargin%5D%5Bright%5D=25&button=)
  - As header: `Accept: text/html`
  - As extension: `/dmps/{dmpId}/narrative.html`
- **JSON** The JSON representation of the DMP
  - As header: `Accept: application/json`
  - As extension: `/dmps/{dmpId}/narrative` or `/dmps/{dmpId}/narrative.json` 
- **PDF** A PDF representation (required by most funders) [example](https://dmptool.org/plans/51258/export.pdf?export%5Bpub%5D=true&export%5Bquestion_headings%5D=true)
  - As header: `Accept: application/pdf`
  - As extension: `/dmps/{dmpId}/narrative.pdf`
- **TEXT** `Accept: text/plain` A plain text version [example]()
  - As header: `Accept: text/plain`
  - As extension: `/dmps/{dmpId}/narrative.txt`

## Query parameters

The service supports the following query params which may be passed to help control the styling and what portions to display.
- Specific DMP version
  - **version** A UTC ISO8601 formatted date (e.g. `2025-08-26T10:43:12Z`) (if omitted, the latest version of the DMP will be returned) 
- Display (all default to true) (each can accept `true/false`, `yes/no` or `0/1`):
  - **includeCoverPage** Whether the overview page should be included (N/A for CSV)
  - **includeSectionHeadings** Whether the template section titles and descriptions should be included
  - **includeQuestionText** Whether the question text should be included
  - **includeUnansweredQuestions** Whether unanswered questions should be included (will exclude the question text if false)
  - **includeResearchOutputs** Whether the research outputs should appear as an appendix page
  - **includeRelatedWorks** Whther the related works should be included as an appendix page
- Font:
  - **fontFamily** The font family to use (default is `Tinos, serif`)
  - **fontSize** The size of the font in points (default is `11`, `8` to `14` allowed)
  - **lineHeight** The height of a standard line (default is `120`)
- Margin
  - **marginBottom** The bottom page margin (default is `76px`)
  - **marginLeft** The bottom page margin (default is `96px`)
  - **marginRight** The bottom page margin (default is `96px`)
  - **marginTop** The bottom page margin (default is `76px`)

## Usage

Note that you must have the application running using `npm run dev` for the following examples to work.

Example with query parameters to adjust formatting:
```shell
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?fontSize=13&marginLeft=5&includeCoverPage=false" \
-H "Accept: text/html" 
--output tmp/test.html
```

Example of fetching a historical version of a DMP:
```shell
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: text/html"  
--output tmp/test.html
```

Example with Auth token as cookie:
```shell
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative" \
-H "Accept: text/html" 
-b "dmspt=my-cookie"  
--output tmp/test.html
```

Examples for each format type:
```shell
# CSV
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: text/csv" \
--output tmp/dmp.csv

# DOCX
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
--output tmp/dmp.docx

# HTML
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: text/html" 
--output tmp/dmp.html  

# JSON
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: text/html" 
--output tmp/dmp.json

# PDF
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: application/pdf" \
--output tmp/dmp.pdf

# TEXT
curl -v "http://localhost:3030/dmps/00.00000/A1B2C3/narrative?version=2024-01-23T16:24:56Z" \
-H "Accept: text/plain" \
--output tmp/dmp.txt
```

## Development

To run this service locally, you must: 
- Have the [DMP Tool UI](https://github.com/CDLUC3/dmsp_frontend_prototype) docker environment running on your local machine. This service will allow you to login (obtain an auth cookie) and create/update DMP data which can then be used to generate narratives.
- Have the [DMP Tool Apollo server](https://github.com/CDLUC3/dmsp_backend_prototype) docker environment running on your local machine. This service has a local DynamoDB Table with DMP records available for query.
- Run `npm install` and then `docker compose up`
- Send queries to the local service at `http://localhost:4030/dmps/{dmpId}/narrative`

## Testing

To run the linter checks you should run `npm run lint`
To run the tests you should run `npm run test`
