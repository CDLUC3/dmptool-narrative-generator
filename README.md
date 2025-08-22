# dmptool-narrative-generator
Service that takes in a DMP as JSON and renders the narrative in the requested format.

The DMP JSON should be in the RDA Common Standard format with DMP Tool extensions.

## Supported Formats

The service supports the following output formats:
- **CSV** `Accept: text/csv` A CSV representation of the DMP (typically the cover page and appendices are excluded) [example]()
- **DOCX** `Accept: application/vnd.openxmlformats-officedocument.wordprocessingml.document` An editable MS Word compliant version [example]() 
- **HTML** `Accept: text/html` An html representation [example](https://dmptool.org/plans/51258/export?format=html&export%5Bform%5D=true&phase_id=&export%5Bproject_details%5D=true&export%5Bsection_headings%5D=true&export%5Bquestion_text%5D=true&export%5Bunanswered_questions%5D=true&export%5Bresearch_outputs%5D=true&export%5Brelated_identifiers%5D=true&export%5Bformatting%5D%5Bfont_face%5D=Tinos%2C+serif&export%5Bformatting%5D%5Bfont_size%5D=11&export%5Bformatting%5D%5Bmargin%5D%5Btop%5D=25&export%5Bformatting%5D%5Bmargin%5D%5Bbottom%5D=25&export%5Bformatting%5D%5Bmargin%5D%5Bleft%5D=25&export%5Bformatting%5D%5Bmargin%5D%5Bright%5D=25&button=)
- **PDF** `Accept: application/pdf` A PDF representation (required by most funders) [example](https://dmptool.org/plans/51258/export.pdf?export%5Bpub%5D=true&export%5Bquestion_headings%5D=true)
- **TEXT** `Accept: text/plain` A plain text version [example]()

## Options

The service supports the following query params which may be passed to help control the styling and what portions to display.
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
Example with query params:
```shell
curl -X POST "http://localhost:3030/generate?fontSize=14&includeCoverPage=no" \
-H "Content-Type: application/json" \
-H "Accept: text/html" \
--data-ascii @src/__mocks__/full-dmp.json \
--output tmp/report-full-dmp.html
```

Examples for each format type:
```shell
# CSV
curl -X POST http://localhost:3030/generate \
-H "Content-Type: application/json" \
-H "Accept: text/csv" \
--data-ascii @src/__mocks__/full-dmp.json \
--output tmp/report-full-dmp.csv

# DOCX
curl -X POST http://localhost:3030/generate \
-H "Content-Type: application/json" \
-H "Accept: application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
--data-ascii @src/__mocks__/full-dmp.json \
--output tmp/report-full-dmp.docx

# HTML
curl -X POST http://localhost:3030/generate \
-H "Content-Type: application/json" 
-H "Accept: text/html" 
--data-ascii @src/__mocks__/full-dmp.json \
--output tmp/report-full-dmp.html  

# PDF
curl -X POST http://localhost:3030/generate \
-H "Content-Type: application/json" \
-H "Accept: application/pdf" \
--data-ascii @src/__mocks__/full-dmp.json \
--output tmp/report-full-dmp.pdf

# TEXT
curl -X POST http://localhost:3030/generate \
-H "Content-Type: application/json" \
-H "Accept: text/plain" \
--data-ascii @src/__mocks__/full-dmp.json \
--output tmp/report-full-dmp.txt
```
