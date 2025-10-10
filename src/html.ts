import Handlebars from "handlebars";
import pluralize from "pluralize";
import { formatDate } from "./helper";
import {
  DisplayOptionsInterface,
  FontInterface,
  MarginInterface,
} from "./server";
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

// ---------------- Format an Answer as HTML ----------------
function answerToHTML (json: AnyAnswerType): string {
  let out = "<p>Not yet answered.</p>";

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
      case "multiselectBox": {
        if (Array.isArray(json.answer) && json.answer.length > 0) {
          const answers = json.answer.map((answer) => `<li>${answer}</li>`);
          out = `<ul>${answers.join("")}</ul>`;
        }
        break;
      }

      case "dateRange": {
        const drAnswer = json.answer as DateRangeAnswerType["answer"];
        out = `<p>${formatDate(drAnswer.start)} to ${formatDate(drAnswer.end)}</p>`;
        break;
      }

      case "numberRange": {
        const nrAnswer = json.answer as NumberRangeAnswerType["answer"];
        out = `<p>${nrAnswer?.start} to ${nrAnswer?.end}</p>`;
        break;
      }

      case "table": {
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
            return `<td>${answerToHTML(tdAnswer)}</td>`;
          }).join("");

          return `<tr>${tds}</tr>`;
        }).join("");

        out = `<table>${table}</table>`;
        break;
      }

      case "date": {
        const dtAnswer = json.answer as DateAnswerType["answer"];
        out = `<p>${formatDate(dtAnswer)}</p>`;
        break;
      }

      case "currency":
        out = `<p>$${json.answer.toLocaleString('en-US')}</p>`;
        break;

      case "number":
        out = `<p>${json.answer.toLocaleString('en-US')}</p>`;
        break;

      case "boolean":
        out = json.answer ? "<p>Yes</p>" : "<p>No</p>";
        break;

      case "affiliationSearch": {
        const data = json.answer as AffiliationSearchAnswerType["answer"];
        if (data?.affiliationId) {
          out = `<p><a href="${data.affiliationId}" target="_blank">${data.affiliationName ?? data.affiliationId}</a></p>`;
        } else {
          out = `<p>${data.affiliationName}</p>`;
        }
        break;
      }

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

// ---------------- Related works for a specific type ----------------
function workTypeForDisplay(workType: string, pluralizeIt = true): string {
  // Capitalize the type name and replace underscores with spaces
  let typeLabel = workType.replace(/_/g, " ");
  typeLabel = pluralizeIt ? pluralize(typeLabel) : typeLabel;
  return `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)}`;
}

// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relatedWorksForType(workType: string, works: any[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: string[] = works.filter((work: any) => work.work_type.includes(workType))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((work: any) => {
      return work?.citation ? work.citation : `<a href="${work.identifier}" target="_blank">${work.identifier}</a>`;
    });

  return out.length === 0 ? null : out.map((work) => `<li>${work}</li>`).join("");
}

// ---------------- Format ISO dates ----------------
Handlebars.registerHelper("formatDate", formatDate);

// ---------------- Remove protocol and domains from URLs ----------------
Handlebars.registerHelper("doiForDisplay", function (doi: string): string {
  return doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
});

// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("contactIdentifierForDisplay", function (contactId: any): string {
  if (contactId?.type === "orcid" && contactId?.identifier) {
    const idForDisplay = contactId?.identifier?.replace(/^(https?:\/\/)?(orcid\.org\/)?/, "")
    return `- <strong>ORCID:</strong> <a href="${contactId?.identifier}" target="_blank">${idForDisplay}</a>`
  }
});

// ---------------- Group contributors by role ----------------
// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("contributorsForRole", function(role: string, contributors: any[]): any {
  if (!Array.isArray(contributors) || contributors.length < 1) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: string[] = contributors.filter((contributor: any) => contributor.role.includes(role))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((contributor: any) => {
        return contributor?.contributor_id?.identifier ? `<a href="${contributor.contributor_id.identifier}" target="_blank">${contributor.name}</a>` : contributor.name;
    });

  return out.length === 0 ? "None specified" : out.join("; ");
});

// ---------------- Group related works by type ----------------
// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("relatedWorksByType", function(works: any[]): string {
  if (!Array.isArray(works) || works.length < 1) return "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workTypes: string[] = works.map((work: any) => work.work_type).flat();

  const out: string[] = [];
  // Loop through each unique work type and collect all the citations
  for(const workType of [...new Set(workTypes)]) {
    const worksForType = relatedWorksForType(workType, works);

    if (worksForType) {
      out.push(`<li><strong>${workTypeForDisplay(workType)}</strong><ul>${worksForType}</ul></li>`);
    }
  }
  return out.length === 0 ? "None specified" : `<ul>${out.join("")}</ul>`;
});

// ---------------- Affiliation helper ----------------
// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("affiliationForDisplay", function(affiliation: any): string {
  return affiliation?.affiliation_id?.identifier ? `<a href="${affiliation.affiliation_id.identifier}" target="_blank">${affiliation.name}</a>` : affiliation?.name;
});

// ---------------- Copyright info based on the DMP visibility ----------------
Handlebars.registerHelper("copyrightForDisplay", function(visibility: string): string {
  if (visibility?.toLowerCase()?.trim() === "public") {
    return `
      The above plan creator(s) have agreed that others may use as much of the text of this
      plan as they would like in their own plans, and customize it as necessary. You do not
      need to credit the creator(s) as the source of the language used, but using any of the
      plan's text does not imply that the creator(s) endorse, or have any relationship to,
      your project or proposal`
  } else {
    return `
      This document is intended for internal use only. You may share it with colleagues at
      your organization, but it should not be shared outside the organization without prior
      written permission from the plan creator(s). In accordance with service terms, system
      administrators at the CDL and authorized users at your home institution may also access
      this document for specific purposes (e.g., system maintenance, compliance tracking, or
      service assessment). Beyond these cases, the contents of this document will not be
      accessed, used, or shared without permission.`
  }
});

// ---------------- Funder and Project helpers ----------------
// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("fundersForDisplay", function(project: any): string {
  let funding = project.map((project) => project.funding).flat();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funding = funding.filter((fund: any) => fund !== null && fund !== undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return funding.map((fund: any) => {
    return fund?.funder_id?.identifier ? `<a href="${fund.funder_id.identifier}" target="_blank">${fund.name}</a>` : fund.name;
  }).join("; ");
});

// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("displayProjectStartDate", function(project: any): string {
  const dates: string[] = project.map((project) => formatDate(project.start, false)).flat();
  return dates.length === 0 ? "None specified" : dates.sort()[0];
});

// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper("displayProjectEndDate", function (project: any): string {
  const dates: string[] = project.map((project) => formatDate(project.end, false)).flat();
  return dates.length === 0 ? "None specified" : dates.sort()[dates.length - 1];
});

// ---------------- Answer helpers ----------------
Handlebars.registerHelper("formatAnswer", function (json: AnyAnswerType): string {
  return answerToHTML(json);
});

Handlebars.registerHelper("questionAnswerForDisplay", function (question: string, answer: AnyAnswerType, includeQs: boolean, includeUnanswered: boolean): string {
  let answered = false;

  // Determine if the answer is empty based on the type
  if (answer?.type !== undefined && answer?.type !== null) {
    switch (answer.type) {
      case "boolean":
        answered = true
        break;

      case "currency":
      case "number":
        answered = answer.answer !== undefined;
        break;

      case "dateRange":
      case "numberRange":
        answered = answer.answer.start !== undefined || answer.answer.end !== undefined;
        break;

      case "checkBoxes":
      case "multiselectBox":
        answered = Array.isArray(answer.answer) && answer.answer.length > 0;
        break;

      case "affiliationSearch":
        answered = answer.answer?.affiliationId !== undefined || answer.answer?.affiliationName !== undefined;
        break;

      default:
        answered = answer?.answer?.toString()?.trim()?.length > 0;
        break;
    }
  }

  // If the question was not answered and we are not supposed to return unanswered questions
  if (!answered && !includeUnanswered) return "";

  const qText = includeQs ? `<strong>${question}</strong>` : "";
  const aText = answered
    ? answerToHTML(answer)
    : (includeUnanswered ? "<p>Not answered</p>" : "");

  return `<div class="question">${qText}${aText}</div>`;
});

// ---------------- Render the full HTML doc ----------------
export function renderHTML(
  display: DisplayOptionsInterface,
  margin: MarginInterface,
  font: FontInterface,
  // TODO: Update the type here once the common standard is in @dmptool/types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
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
      </style>
    </head>
    <body>
      {{#if ${display.includeCoverPage}}}

        <h1>{{title}}</h1>
        <hr>
        <div class="cover-page">
          <p class="header">
            <em>A Data Management Plan created using the DMP Tool</em>
          </p>
          {{#if registered}}
            <p>
              <b>DMP ID:</b>
              <a href="{{dmp_id.identifier}}" target="_blank">{{doiForDisplay dmp_id.identifier}}</a>
            </p>
          {{/if}}
          <p>
            <strong>Creator:</strong> {{contact.name}} {{{contactIdentifierForDisplay contact.contact_id}}}
          </p>
          <p>
            <strong>Affiliation:</strong> {{{affiliationForDisplay contact.dmproadmap_affiliation}}}
          </p>
          <p>
            <b>Principal Investigator(s): </b>{{{contributorsForRole "http://credit.niso.org/contributor-roles/investigation" contributor}}}
          </p>
          <p>
            <b>Funder: </b>{{{fundersForDisplay project}}}
          </p>
          <p>
            <b>DMP Tool Template: </b>{{dmproadmap_narrative.template_title}} - {{dmproadmap_narrative.template_version}}
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
            <strong>Copyright information:</strong> {{{copyrightForDisplay dmproadmap_privacy}}}
          </p>
        </div>
        <hr class="bottom" />

        <div class="page-break" style="page-break-before: always;"></div>
      {{/if}}


      <h1>{{title}}</h1>

      {{#if dmproadmap_narrative.sections}}
        {{#each dmproadmap_narrative.sections}}
          <div class="section">
            {{#if ${display.includeSectionHeadings}}}
              <h2>{{section_title}}</h2>
              <hr>
            {{/if}}
            {{#if questions}}
              {{#each questions}}
                {{{questionAnswerForDisplay question_text answer_json ${display.includeQuestionText} ${display.includeUnansweredQuestions}}}}
              {{/each}}
              </p>
            {{/if}}
          </div>
        {{/each}}
      {{/if}}
      <hr class="bottom" />

      {{#if ${display.includeRelatedWorks}}}
        {{#if dmproadmap_related_identifiers}}
          <div class="page-break" style="page-break-before: always;"></div>

          <div style="page-break-before:always;"></div>
          <h1>{{title}}</h1>
          <h2>Related Works</h2>
          {{{relatedWorksByType dmproadmap_related_identifiers}}}
          <hr class="bottom" />
        {{/if}}
      {{/if}}
    </body>
  </html>
  `);
  return template(data);
}
