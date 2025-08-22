import express, {Request, Response} from "express";
import puppeteer, {Browser, Page} from "puppeteer";
import Handlebars from "handlebars";
import {stringify} from "csv-stringify/sync";
import {Document, Packer, Paragraph, TextRun} from "docx";
import { Parser, DomUtils } from "htmlparser2";
import {
  AffiliationSearchAnswerType,
  AnswerSchemaMap,
  AnyAnswerType,
  DateAnswerType,
  DateRangeAnswerType,
  NumberRangeAnswerType,
  TableAnswerType,
  TextAreaAnswerType
} from "@dmptool/types";

const app = express();
app.use(express.json({ limit: "5mb" }));

// ---------------- Interfaces for formatting options ----------------
interface MarginInterface {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

interface FontInterface {
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
}

interface DisplayOptionsInterface {
  includeCoverPage: boolean;
  includeSectionHeadings: boolean;
  includeQuestionText: boolean;
  includeUnansweredQuestions: boolean;
  includeResearchOutputs: boolean;
  includeRelatedWorks: boolean;
}

// ---------------- Format query params ----------------
function safeNumber(value: string, fallback: number): number {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

function safeBoolean(value: string, fallback: boolean): boolean | undefined {
  if (["1", "on", "true", "yes"].includes(value?.toLowerCase())) {
    return true;
  } else if (["0", "off", "false", "no"].includes(value?.toLowerCase())) {
    return false;
  } else {
    return fallback;
  }
}

function pointsToFontSize(points: number): string {
  switch (points) {
    case 8:
      return '11px';
    case 9:
      return '12px';
    case 10:
      return '13px';
    case 12:
      return '16px';
    case 13:
      return '17px';
    case 14:
      return '19px';

    default:
      return '15px';
  }
}

// ---------------- Format ISO dates ----------------
function formatDate(date: string, includeDay = true): string {
  try {
    if (includeDay) {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      })
    }
  } catch (err) {
    console.log('Invalid date', date);
    return 'None specified';
  }
}

function answerToCSV (json: AnyAnswerType): string | number | boolean {
  let answer: string | number | boolean;
  // Special handling for certain answer types
  switch (json?.type as string) {
    case "textArea":
      const tAnswer = json.answer as TextAreaAnswerType["answer"];
      answer = tAnswer.replace(/<[^>]*>/g, "");
      break;

    case "dateRange":
      const drAnswer = json.answer as DateRangeAnswerType["answer"];
      answer = `${formatDate(drAnswer.start)} to ${formatDate(drAnswer.end)}`;
      break;

    case "numberRange":
      const nrAnswer = json.answer as NumberRangeAnswerType["answer"];
      answer = `${nrAnswer.start} to ${nrAnswer.end}`;
      break;

    case "checkBoxes":
    case "multiselectBox":
      if (Array.isArray(json.answer) && json.answer.length > 0) {
        answer = json.answer.join("; ");
      }
      break;

    case "affiliationSearch":
      const data = json.answer as AffiliationSearchAnswerType["answer"];
      answer = data?.affiliationId ? `${data.affiliationName} (${data.affiliationId})` : data.affiliationName;
      break;

    case "table":
      return JSON.stringify(json.answer);

    default:
      answer = json?.answer as string | number | boolean | undefined;
      break
  }
  return answer ?? '';
}

// ---------------- Format an Answer as HTML ----------------
function answerToHTML (json: AnyAnswerType): string {
  let out: string = "<p>Not yet answered.</p>";

  // If the answer isn't a known type skip it
  if (!Object.keys(AnswerSchemaMap).includes(json['type'])) {
    return "<p>Unable to render this answer (unknown type).</p>";
  }

  // Validate the json against the Zod schema and if invalid skip it
  const result = AnswerSchemaMap[json['type']]?.safeParse(json);
  if (result && !result.success) {
    return "<p>Unable to render this answer (invalid answer).</p>";
  }

  if (json?.answer || json.type === "boolean") {
    switch (json.type as string) {
      case "textArea":
        out = json.answer as TextAreaAnswerType["answer"];
        break;

      case "checkBoxes":
      case "multiselectBox":
        if (Array.isArray(json.answer) && json.answer.length > 0) {
          const answers = json.answer.map((answer) => `<li>${answer}</li>`);
          out = `<ul>${answers.join("")}</ul>`;
        }
        break;

      case "dateRange":
        const drAnswer = json.answer as DateRangeAnswerType["answer"];
        out = `<p>${formatDate(drAnswer.start)} to ${formatDate(drAnswer.end)}</p>`;
        break;

      case "numberRange":
        const nrAnswer = json.answer as NumberRangeAnswerType["answer"];
        out = `<p>${nrAnswer?.start} to ${nrAnswer?.end}</p>`;
        break;

      case "table":
        const tblAnswer = json as TableAnswerType;
        const cols = tblAnswer.columnHeadings;
        const rows = tblAnswer.answer;
        let table = "<table>";

        if (cols) {
          // Add all of the column headings
          const ths = cols.map((th) => `<th>${th}</th>`).join("");
          table += `<tr>${ths}</tr>`;
        }

        // Loop through all the rows
        table += rows.map(row => {
          // Loop through each column and convert the entry to HTML based on its type
          const tds = row.columns.map((td) => {
            const tdAnswer = td as AnyAnswerType;
            `<td>${answerToHTML(tdAnswer)}</td>`;
          }).join("");

          return `<tr>${tds}</tr>`;
        }).join("");

        out = `<table>${table}</table>`;
        break;

      case "date":
        const dtAnswer = json.answer as DateAnswerType["answer"];
        out = `<p>${formatDate(dtAnswer)}</p>`;
        break;

      case "currency":
        out = `<p>$${json.answer.toLocaleString('en-US')}</p>`;
        break;

      case "number":
        out = `<p>${json.answer.toLocaleString('en-US')}</p>`;
        break;

      case "boolean":
        out = json.answer ? "<p>Yes</p>" : "<p>No</p>";
        break;

      case "affiliationSearch":
        const data = json.answer as AffiliationSearchAnswerType["answer"];
        if (data?.affiliationId) {
          out = `<p><a href="${data.affiliationId}" target="_blank">${data.affiliationName ?? data.affiliationId}</a></p>`;
        } else {
          out = `<p>${data.affiliationName}</p>`;
        }
        break;

      case "url":
        out = `<p><a href="${json.answer}" target="_blank">${json.answer}</a></p>`;
        break;

      case "email":
        out = `<p><a href="mailto:${json.answer}">${json.answer}</a></p>`;
        break;

      default:
        // A text type field, so wrap it in a paragraph
        out = `<p>${json.answer}</p>`;
        break;
    }
  }
  return out;
}

// ---------------- Format ISO dates ----------------
Handlebars.registerHelper("formatDate", formatDate);

// ---------------- Remove protocol and domains from URLs ----------------
Handlebars.registerHelper("doiForDisplay", function (doi: string): string {
  return doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
});

Handlebars.registerHelper("orcidForDisplay", function (orcid: string): string {
  return orcid.replace(/^(https?:\/\/)?(orcid\.org\/)?/, "");
});

// ---------------- Group contributors by role ----------------
Handlebars.registerHelper("contributorsForRole", function(role: string, contributors: any[]): any {
  const out: string[] = contributors.filter((contributor: any) => contributor.role.includes(role))
      .map((contributor: any) => {
        return contributor?.contributor_id?.identifier ? `<a href="${contributor.contributor_id.identifier}" target="_blank">${contributor.name}</a>` : contributor.name;
      });

  return out.length === 0 ? "None specified" : out.join("; ");
});

// ---------------- Funder and Project helpers ----------------
Handlebars.registerHelper("funders", function(project: any): string {
  const funding = project.map((project) => project.funding).flat();
  return funding.map((fund: any) => {
    return fund?.funder_id?.identifier ? `<a href="${fund.funder_id.identifier}" target="_blank">${fund.name}</a>` : fund.name;
  }).join("; ");
});

Handlebars.registerHelper("displayProjectStartDate", function(project: any): string {
  const dates: string[] = project.map((project) => formatDate(project.start, false)).flat();
  return dates.length === 0 ? "None specified" : dates.sort()[0];
});

Handlebars.registerHelper("displayProjectEndDate", function (project: any): string {
  const dates: string[] = project.map((project) => formatDate(project.end, false)).flat();
  return dates.length === 0 ? "None specified" : dates.sort()[dates.length - 1];
});

// ---------------- Answer helpers ----------------
Handlebars.registerHelper("formatAnswer", function (json: any): string {
  return answerToHTML(json);
});

// ----------------- HTML -----------------
function renderHtmlTemplate(
  display: DisplayOptionsInterface,
  margin: MarginInterface,
  font: FontInterface,
  data: any // TODO: Set this to the common standard once we add it to @dmptool/types
): string {
  const template = Handlebars.compile(`
    <html>
      <head>
        <meta charset="utf-8">
        <title>{{title}}</title>
        <style>
          @page {
            margin-top: ${margin?.marginTop}px;
            margin-right: ${margin?.marginRight}px;
            margin-bottom: ${margin?.marginBottom}px;
            margin-left: ${margin?.marginLeft}px;
          }
          body {
            font-family: ${font?.fontFamily};
            font-size: ${font?.fontSize};
            line-height: ${font?.lineHeight}%;
          }
          .break-after {
            page-break-after: always;
          }
          .break-before {
            page-break-before: always;
          }
          h1 {
            font-size: 1.4em;
          }
          h2 {
            font-size: 1.3em;
          }
          h3 {
            font-size: 1.2em;
          }
          div.cover-page p {
            margin-left: 10px;
            margin-bottom: 35px;
          }
          div.section {
            margin-bottom: 35px;
          }
          div.question {
            margin-bottom: 25px;
          }
          div.question h4 {
            font-size: 1.1em;
            font-weight: bold;
          }
          div.question p {
            margin-left: 15px;
          }
          table, tr, td, th, tbody, thead, tfoot {
            page-break-inside: avoid !important;
          }
          table {
            border-collapse: collapse;
          }
          table caption {
            font-weight: bold;
            font-size: 1.1em;
            text-align: left;
          }
          th, td {
            border: 1px solid black !important;
            padding: 2px;
          }
          .annotations {
            margin-left: 15px;
            margin-bottom: 10px;
          }
          ul.research_output {
            margin-bottom: 15px;
          }
          ul.research_output li {
            margin-bottom: 5px;
          }
          ul.research_output li strong {
            padding-right: 5px;
          }
        </style>
      </head>
      <body>
        {{#if ${display.includeCoverPage}}}
          <h1>{{title}}</h1>
          <hr>
          <h2>Plan Overview</h2>
          <div class="cover-page">
            <p class="header">
              <em>A Data Management Plan created using the DMP Tool</em>
            </p>
            <p>
              <b>DMP ID:</b>
              <a href="{{dmp_id.identifier}}" target="_blank">{{doiForDisplay dmp_id.identifier}}</a>
            </p>
            <p>
              <b>Title: </b>{{title}}
            </p>
            <p>
              <strong>Creator:</strong> {{contact.name}} - <strong>ORCID:</strong> <a href="{{contact.contact_id.identifier}}" target="_blank">{{orcidForDisplay contact.contact_id.identifier}}</a>
            </p>
            <p>
              <b>Affiliation: </b><a href="{{contact.dmproadmap_affiliation.affiliation_id.identifier}}" target="_blank">{{contact.dmproadmap_affiliation.name}}</a>
            </p>
            <p>
              <b>Principal Investigator: </b>{{{contributorsForRole "http://credit.niso.org/contributor-roles/investigation" contributor}}}
            </p>
            <p>
              <b>Data Manager: </b>{{{contributorsForRole "http://credit.niso.org/contributor-roles/data-curation" contributor}}}
            </p>
            <p>
              <b>Funder: </b>{{{funders project}}}
            </p>
            <p>
              <b>DMP Tool Template: </b>{{dmproadmap_template.title}}
            </p>
            <p>
              <b>Project abstract: </b>
              <div style="margin-left: 15px;">
                <p>{{{description}}}</p>
              </div>
            </p>
            <p>
              <b>Start date: </b>{{displayProjectStartDate project}}
            </p>
            <p>
              <b>End date: </b>{{displayProjectEndDate project}}
            </p>
            <p>
              <b>Last modified: </b>{{formatDate modified}}
            </p>
          </div>
          <hr class="bottom" />
        {{/if}}
        
        <div style="page-break-before:always;"></div>
        <h1>{{title}}</h1>
        <hr>
        
        {{#if dmproadmap_narrative.sections}}
          {{#each dmproadmap_narrative.sections}}
            <div class="section">
              {{#if ${display.includeSectionHeadings}}}
                <h3>{{section_title}}</h3>
                {{#if section_description}}
                  <p>{{{section_description}}}</p>
                {{/if}}
              {{/if}}
              {{#if questions}}
                {{#each questions}}
                  <div class="question">
                    {{#if ${display.includeQuestionText}}}
                      <h4>{{{question_text}}}</h4>
                    {{/if}}
                    {{#if answer_json}}
                      {{{formatAnswer answer_json}}}
                    {{else if ${display.includeUnansweredQuestions}}}
                      <p>Not answered</p>
                    {{/if}}
                  </div>
                {{/each}}
                </p>
              {{/if}}
            </div>
          {{/each}}
        {{/if}}
        <hr class="bottom" />
        
        {{#if ${display.includeResearchOutputs}}} 
          {{#if dataset}}
            <div style="page-break-before:always;"></div>
            <h2>Planned Research Outputs</h2>
            
            {{#each dataset}}
              <h3>{{title}}</h3>
              <p>{{description}}</p>
              
            {{/each}}
            
            <hr class="bottom" />
          {{/if}}
        {{/if}}
        
        {{#if ${display.includeRelatedWorks}}} 
          {{#if dmproadmap_related_identifiers}}
            <div style="page-break-before:always;"></div>
            <h2>Related Works</h2>
            
            <ul>
              {{#each dmproadmap_related_identifiers}}
                {{#if citation}}
                  <li>{{{citation}}}</li>
                {{/if}}
              {{/each}}
            </ul>
            <hr class="bottom" />
          {{/if}}
        {{/if}}
      </body>
    </html>
  `);
  return template(data);
}

// ----------------- PDF -----------------
async function renderPdfWithPuppeteer(html: string): Promise<Buffer> {
  // Launch headless chrome so we can convert the HTML into a PDF doc
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page: Page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf: Uint8Array = await page.pdf({
    format: "Letter",
    printBackground: false
  });
  // Close the browser
  await browser.close();

  // wrap Puppeteer Uint8Array into Node Buffer and return
  return Buffer.from(pdf);
}

// ----------------- CSV -----------------
function renderCsv(display: DisplayOptionsInterface, data: any): string {
  const columns: string[] = [];
  let rows: any[] = [];

  // If there is narrative content
  if (data.dmproadmap_narrative?.sections) {
    // Define the column headings
    if (display.includeSectionHeadings) {
      columns.push('Section');
    }
    if (display.includeQuestionText) {
      columns.push('Question');
    }
    columns.push('Answer');

    // Define the rows
    data.dmproadmap_narrative?.sections?.map((section: any) => {
      return section.questions?.map((question: any) => {
        const row = [];
        const answer = answerToCSV(question.answer_json);

        if (display.includeSectionHeadings) {
          row.push(section.section_title);
        }
        if (display.includeQuestionText) {
          row.push(question.question_text);
        }
        row.push(answer ?? '');
        rows.push(row);
      });
    });
  }
  return stringify(rows, { header: true, columns });
}

// ----------------- DOCX -----------------
async function renderDocx(data: any): Promise<Buffer> {
  const doc = new Document({
    sections: [
     {
       children: [
         new Paragraph({ children: [new TextRun({ text: data.title, bold: true, size: 32 })] }),
         new Paragraph(data.abstract || ""),
         ...(data.sections?.map((s: any) => [
           new Paragraph({ children: [new TextRun({ text: s.heading, bold: true, size: 26 })] }),
           new Paragraph(s.body || ""),
           ...(s.bullets?.map((b: string) => new Paragraph("• " + b)) || []),
         ]) || []).flat(),
       ],
     },
   ],
  });
  return await Packer.toBuffer(doc);
}

// ----------------- PLAIN TEXT -----------------
async function renderPlainText(html: string): Promise<Buffer> {
  let plainText = '';
  let inStyleTag = false;

  const parser = new Parser({
    onopentag(name: string) {
      if (name === 'style') {
        inStyleTag = true;
      }
    },
    ontext(text: string) {
      if (!inStyleTag) {
        // Remove excess space
        plainText += text.replace(/\s+/g, ' ');
      }
    },
    onclosetag(name: string) {
      if (name === 'style') {
        inStyleTag = false;
      } else {
        // Add a newline character for closing tags
        plainText += '\n';
      }
    },
  }, { decodeEntities: true }); // decodeEntities ensures HTML entities like &amp; are converted

  parser.write(html);
  parser.end();

  // Clean up extra whitespace and then wrap into Node Buffer and return
  return Buffer.from(plainText);
}

// ----------------- Main Entrypoint -----------------
app.post("/generate", async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const accept = req.headers["accept"] || "application/pdf";
    // get the query params
    const params = req.query;

    // Get the incoming query params or use the default settings
    const display = {
      includeCoverPage: safeBoolean(params?.includeCoverPage as string, true),
      includeSectionHeadings: safeBoolean(params?.includeSectionHeadings as string, true),
      includeQuestionText: safeBoolean(params?.includeQuestionText as string, true),
      includeUnansweredQuestions: safeBoolean(params?.includeUnansweredQuestions as string, true),
      includeResearchOutputs: safeBoolean(params?.includeResearchOutputs as string, true),
      includeRelatedWorks: safeBoolean(params?.includeRelatedWorks as string, true),
    }
    const margin = {
      marginTop: safeNumber(params?.marginTop as string, 76),
      marginRight: safeNumber(params?.marginRight as string, 96),
      marginBottom: safeNumber(params?.marginBottom as string, 76),
      marginLeft: safeNumber(params?.marginLeft as string, 96),
    }
    const font = {
      fontFamily: "Tinos, serif",
      fontSize: pointsToFontSize(safeNumber(params?.fontSize as string, 11)),
      lineHeight: safeNumber(params?.lineHeight as string, 120),
    }

    // 1. HTML
    const html = renderHtmlTemplate(display, margin, font, data);

    if (accept.includes("text/html")) {
      res.type("html").send(html);
      return;
    }

    // 2. PDF
    if (accept.includes("application/pdf")) {
      const pdf = await renderPdfWithPuppeteer(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${(data.title || "document").replace(/\W+/g, "-")}.pdf"`
      );
      res.send(pdf);
      return;
    }

    // 3. CSV
    if (accept.includes("text/csv")) {
      const csv = renderCsv(display, data);
      res.type("csv").send(csv);
      return;
    }

    // 4. DOCX
    if (
      accept.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ) {
      const docx = await renderDocx(data);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(data.title || "document").replace(/\W+/g, "-")}.docx"`
      );
      res.send(docx);
      return;
    }

    // 5. TXT
    if (accept.includes("text/plain")) {
      const txt = await renderPlainText(html);
      res.type("txt").send(txt);
      return;
    }

    res.status(406).send("Not Acceptable: Supported formats are HTML, PDF, CSV, DOCX");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Document generation failed" });
  }
});

// ----------------- ALB Healthcheck -----------------
app.get("/health", (_: Request, res: Response) => res.send("ok"));

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => console.log(`DMP Tool narrative generator listening on port ${PORT}`));
