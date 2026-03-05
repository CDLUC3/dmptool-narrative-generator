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
  DMPToolDMPType,
  NumberRangeAnswerType,
  TableAnswerType,
  TextAreaAnswerType
} from "@dmptool/types";

/**
 * Convert an answer to HTML based on its type.
 *
 * @param json The answer JSON to convert to HTML.
 * @returns The HTML representation of the answer.
 */
function answerToHTML (json: AnyAnswerType): string {
  let out = "<p>Not yet answered.</p>";
  if (!json) return out;

  // If the answer isn't a known type, skip it
  if (!Object.keys(AnswerSchemaMap).includes(json['type'])) {
    return "<p>Unable to render this answer (unknown type).</p>";
  }

  // Validate the JSON against the Zod schema and if invalid skip it
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
          // Add all the column headings
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

/**
 * Transform a work type for display in the narrative.
 *
 * @param workType The work type to transform.
 * @param pluralizeIt Whether to pluralize the type name.
 * @returns The transformed work type.
 */
function workTypeForDisplay(workType: string, pluralizeIt = true): string {
  if (!workType) return "";

  // Capitalize the type name and replace underscores with spaces
  let typeLabel = workType.replace(/_/g, " ");
  typeLabel = pluralizeIt ? pluralize(typeLabel) : typeLabel;
  return `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)}`;
}

/**
 * Helper to gather all the related works for a given work type.
 *
 * @param workType The work type to gather works for.
 * @param works The list of related works to search.
 * @returns A list of HTML formatted related works.
 */
function relatedWorksForType(
  workType: string,
  works: DMPToolDMPType["dmp"]["related_identifier"]
): string {
  if (!Array.isArray(works) || works.length < 1) return "";

  const out: string[] = works.filter((work: { type: string, identifier: string }) => work.type.includes(workType))
    .map((work) => {
      return work?.citation ? work.citation : `<a href="${work.identifier}" target="_blank">${work.identifier}</a>`;
    });

  return out.length === 0 ? null : out.map((work) => `<li>${work}</li>`).join("");
}

/**
 * Format a date for display.
 */
Handlebars.registerHelper("formatDate", formatDate);

/**
 * Format a DOI for display.
 */
Handlebars.registerHelper("doiForDisplay", function (doi: string): string {
  return doi?.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
});

/**
 * Format the contact person's identifier for display (ignore email).
 */
Handlebars.registerHelper(
  "contactIdentifierForDisplay",
  function (contactId: DMPToolDMPType["dmp"]["contact"]["contact_id"]): string {
    if (!contactId) return "";

    const id = Array.isArray(contactId) ? contactId[0] : contactId;
    if (id?.type === "orcid" && id?.identifier) {
      const idForDisplay = id?.identifier?.replace(/^(https?:\/\/)?(orcid\.org\/)?/, "")
      return `- <strong>ORCID:</strong> <a href="${id?.identifier}" target="_blank">${idForDisplay}</a>`
    }
 }
);

/**
 * Format a list of contributors for display based on their role.
 */
Handlebars.registerHelper(
  "contributorsForRole",
  function(role: string, contributors: DMPToolDMPType["dmp"]["contributor"]): string {
    if (!Array.isArray(contributors) || contributors.length < 1) return "";
    const out: string[] = contributors.filter((contributor) => contributor.role.includes(role))
      .map((contributor) => {
          return contributor?.contributor_id?.identifier ? `<a href="${contributor.contributor_id.identifier}" target="_blank">${contributor.name}</a>` : contributor.name;
      });
    return out.length === 0 ? "None specified" : out.join("; ");
  }
);

/**
 * Format a list of related works for display.
 */
Handlebars.registerHelper(
  "relatedWorksByType",
  function(works: DMPToolDMPType["dmp"]["related_identifier"]): string {
    if (!Array.isArray(works) || works.length < 1) return "";

    const workTypes: string[] = works.map((work) => work.type).flat();

    const out: string[] = [];
    // Loop through each unique work type and collect all the citations
    for(const workType of [...new Set(workTypes)]) {
      const worksForType = relatedWorksForType(workType, works);

      if (worksForType) {
        out.push(`<li><strong>${workTypeForDisplay(workType)}</strong><ul>${worksForType}</ul></li>`);
      }
    }
    return out.length === 0 ? "None specified" : `<ul>${out.join("")}</ul>`;
  }
);

/**
 * Format a an affiliation for display.
 */
Handlebars.registerHelper(
  "affiliationForDisplay",
  function(affiliation: DMPToolDMPType["dmp"]["contact"]["affiliation"]): string {
    if (!Array.isArray(affiliation) || affiliation.length < 1) return "";
    return affiliation[0]?.affiliation_id?.identifier ? `<a href="${affiliation[0].affiliation_id.identifier}" target="_blank">${affiliation[0].name}</a>` : affiliation[0]?.name;
  }
);

/**
 * Generate the copyright notice for display based on the privacy setting.
 */
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

/**
 * Format a list of funding sources for display.
 */
Handlebars.registerHelper(
  "fundersForDisplay",
  function(project: DMPToolDMPType["dmp"]["project"][]): string {
    if (!Array.isArray(project) || project.length < 1) return "";
    let funding = project.map((project) => project.funding).flat();
    funding = funding.filter((fund) => fund !== null && fund !== undefined);
    return funding.map((fund) => {
      return fund?.funder_id?.identifier ? `<a href="${fund.funder_id.identifier}" target="_blank">${fund.name}</a>` : fund.name;
    }).join("; ");
  }
);

/**
 * Format the project abstract
 */
Handlebars.registerHelper(
  "displayProjectAbstract",
  function(project: DMPToolDMPType["dmp"]["project"][]): string {
    if (!Array.isArray(project) || project.length < 1) return "";
    return project[0]?.description;
  }
);

/**
 * Format the project start date for display.
 */
Handlebars.registerHelper(
  "displayProjectStartDate",
  function(project: DMPToolDMPType["dmp"]["project"][]): string {
    if (!Array.isArray(project) || project.length < 1) return "";
    const dates: string[] = project.map((project) => formatDate(project.start, false)).flat();
    return dates.length === 0 ? "None specified" : dates.sort()[0];
  }
);

/**
 * Format the project end date for display.
 */
Handlebars.registerHelper(
  "displayProjectEndDate",
  function (project: DMPToolDMPType["dmp"]["project"][]): string {
    if (!Array.isArray(project) || project.length < 1) return "";
    const dates: string[] = project.map((project) => formatDate(project.end, false)).flat();
    return dates.length === 0 ? "None specified" : dates.sort()[dates.length - 1];
  }
);

/**
 * Format the answer to a question
 */
Handlebars.registerHelper("formatAnswer", function (json: AnyAnswerType): string {
  return answerToHTML(json);
});

/**
 * Format a question and answer for display.
 */
Handlebars.registerHelper(
  "questionAnswerForDisplay",
  function (question: string, answer: { id: number, json: AnyAnswerType }, includeQs: boolean, includeUnanswered: boolean): string {
    let answered = false;

    // Determine if the answer is empty based on the type
    if (answer?.json?.type !== undefined && answer?.json?.type !== null) {
      switch (answer?.json.type) {
        case "boolean":
          answered = true
          break;

        case "currency":
        case "number":
          answered = answer?.json.answer !== undefined;
          break;

        case "dateRange":
        case "numberRange":
          answered = answer?.json.answer.start !== undefined || answer?.json.answer.end !== undefined;
          break;

        case "checkBoxes":
        case "multiselectBox":
          answered = Array.isArray(answer?.json.answer) && answer?.json.answer.length > 0;
          break;

        case "affiliationSearch":
          answered = answer?.json.answer?.affiliationId !== undefined || answer?.json.answer?.affiliationName !== undefined;
          break;

        default:
          answered = answer?.json?.answer?.toString()?.trim()?.length > 0;
          break;
      }
    }

    // If the question was not answered, and we are not supposed to return unanswered questions
    if (!answered && !includeUnanswered) return "";

    const qText = includeQs ? `<strong>${question}</strong>` : "";
    const aText = answered
      ? answerToHTML(answer?.json)
      : (includeUnanswered ? "<p>Not answered</p>" : "");

    return `<div class="question">${qText}${aText}</div>`;
  }
);

/**
 * Render the maDMP record as HTML
 *
 * @param display The options for displaying parts of the narrative
 * (e.g. show unanswered questions)
 * @param margin The margins to use when rendering the HTML
 * @param font The font to use when rendering the HTML
 * @param data The maDMP record to render
 * @returns The rendered HTML
 */
export function renderHTML(
  display: DisplayOptionsInterface,
  margin: MarginInterface,
  font: FontInterface,
  data: DMPToolDMPType["dmp"]
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
            <strong>Affiliation:</strong> {{{affiliationForDisplay contact.affiliation}}}
          </p>
          <p>
            <b>Principal Investigator(s): </b>{{{contributorsForRole "https://credit.niso.org/contributor-roles/investigation" contributor}}}
          </p>
          <p>
            <b>Funder: </b>{{{fundersForDisplay project}}}
          </p>
          <p>
            <b>DMP Tool Template: </b>{{narrative.template.title}} - {{narrative.template.version}}
          </p>
          <p>
            <b>Project abstract: </b>
            <div style="margin-left: 15px;">
              <p>{{{displayProjectAbstract project}}}</p>
            </div>
          </p>
          <p>
            <b>Start date: </b>{{displayProjectStartDate project}}
          </p>
          <p>
            <b>End date: </b>{{displayProjectEndDate project}}
          </p>
          <p>
            <strong>Copyright information:</strong> {{{copyrightForDisplay privacy}}}
          </p>
        </div>
        <hr class="bottom" />

        <div class="page-break" style="page-break-before: always;"></div>
      {{/if}}


      <h1>{{title}}</h1>

      {{#if narrative}}
        {{#if narrative.template}}
          {{#if narrative.template.section}}
            {{#each narrative.template.section}}
              <div class="section">
                {{#if ${display.includeSectionHeadings}}}
                  <h2>{{title}}</h2>
                  <hr>
                {{/if}}
                {{#if question}}
                  {{#each question}}
                    {{{questionAnswerForDisplay text answer ${display.includeQuestionText} ${display.includeUnansweredQuestions}}}}
                  {{/each}}
                  </p>
                {{/if}}
              </div>
            {{/each}}
          {{/if}}
        {{/if}}
      {{/if}}
      <hr class="bottom" />

      {{#if ${display.includeRelatedWorks}}}
        {{#if related_identifier}}
          <div class="page-break" style="page-break-before: always;"></div>

          <div style="page-break-before:always;"></div>
          <h1>{{title}}</h1>
          <h2>Related Works</h2>
          {{{relatedWorksByType related_identifier}}}
          <hr class="bottom" />
        {{/if}}
      {{/if}}
    </body>
  </html>
  `);
  return template(data);
}
