import sanitizeHtml from "sanitize-html";
import type {
  TemplateNarrative,
  TemplateNarrativeQuestion,
  TemplateNarrativeSection,
} from "@dmptool/utils";
import type { FontInterface, MarginInterface } from "./server.js";

interface QuestionOption {
  label?: string;
  value?: string;
  selected?: boolean;
}

/**
 * Escape plain text (e.g. titles and option labels) for use in HTML.
 */
export function escapeHTML(text: string | undefined | null): string {
  if (text === undefined || text === null) return "";

  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitize rich text (e.g. question text, guidance and sample text) for use in HTML.
 */
function sanitize(html: string | undefined | null): string {
  if (html === undefined || html === null) return "";

  return sanitizeHtml(String(html).trim(), {
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
    },
  });
}

/**
 * The name to use for the Template's owner (e.g. the funder)
 */
function ownerName(template: TemplateNarrative): string | undefined {
  return template.owner?.name || template.owner?.displayName || undefined;
}

/**
 * The title of the document (e.g. "National Science Foundation (nsf.gov): NSF Polar Programs")
 */
export function templateTitle(template: TemplateNarrative): string {
  const owner = ownerName(template);
  return owner ? `${owner}: ${template.title}` : template.title;
}

/**
 * Render a labeled block of rich text (e.g. "Guidance:") if the text is present
 */
function annotationToHTML(label: string, text: string | undefined, cssClass: string): string {
  if (!text) return "";

  return `
    <div class="annotation ${cssClass}">
      <p class="annotation-label"><em>${escapeHTML(label)}</em>:</p>
      <div class="annotation-text">${sanitize(text)}</div>
    </div>`;
}

/**
 * Render the options for option based questions (e.g. checkBoxes, radioButtons, selectBox)
 */
function optionsToHTML(question: TemplateNarrativeQuestion): string {
  const json = question.json as { options?: QuestionOption[] } | undefined;
  if (!Array.isArray(json?.options) || json.options.length === 0) return "";

  const items = json.options.map((option: QuestionOption) => {
    const label = escapeHTML(option?.label ?? option?.value);
    return `<li>${label}${option?.selected ? " - default" : ""}</li>`;
  });
  return `<ul class="options">${items.join("")}</ul>`;
}

interface ResearchOutputColumn {
  commonStandardId?: string;
  heading?: string;
  enabled?: boolean;
  content?: {
    attributes?: { labelTranslationKey?: string };
  };
}

// The labels plan writers see for the standard Research Output fields. The plan writer's form
// shows the translation of the field's `labelTranslationKey` (the English `Global.labels` in
// dmptool-ui) and falls back to the field's heading when there is no translation.
export const RESEARCH_OUTPUT_FIELD_LABELS: Record<string, string> = {
  "labels.title": "Title",
  "labels.description": "Description",
  "labels.outputType": "Output Type",
  "labels.dataFlags": "Data Flags",
  "labels.repositories": "Repositories",
  "labels.metadataStandards": "Metadata Standards",
  "labels.licenses": "Licenses",
  "labels.initialAccessLevels": "Initial Access Levels",
};

// The default headings for the Research Output fields (keyed by the commonStandardId) for the
// rare case where a field has neither a translation nor a heading
const RESEARCH_OUTPUT_DEFAULT_HEADINGS: Record<string, string> = {
  title: "Title",
  description: "Description",
  type: "Type",
  data_flags: "Data Flags",
  data_access: "Access Level",
  issued: "Anticipated Release Date",
  byte_size: "Byte Size",
  host: "Repository(ies)",
  metadata: "Metadata Standard(s)",
  license_ref: "License",
  custom: "Custom Column",
};

/**
 * The label a plan writer sees for a Research Output field
 */
function researchOutputFieldLabel(column: ResearchOutputColumn): string {
  const translationKey = column.content?.attributes?.labelTranslationKey;
  const id = column.commonStandardId ?? "";
  return (translationKey && RESEARCH_OUTPUT_FIELD_LABELS[translationKey])
    || column.heading
    || RESEARCH_OUTPUT_DEFAULT_HEADINGS[id]
    || id;
}

/**
 * Render the list of fields (columns) that plan writers fill in for each Research Output
 */
function researchOutputFieldsToHTML(question: TemplateNarrativeQuestion): string {
  if (question.type !== "researchOutputTable") return "";

  const json = question.json as { columns?: ResearchOutputColumn[] } | undefined;
  if (!Array.isArray(json?.columns)) return "";

  // Only the fields the template selected (enabled) are shown to plan writers
  const labels = json.columns
    .filter((column: ResearchOutputColumn) => column && column.enabled !== false)
    .map(researchOutputFieldLabel)
    .filter((label: string) => label.trim().length > 0);
  if (labels.length === 0) return "";

  return `
    <div class="research-output-fields">
      <p class="annotation-label"><em>Research output fields</em>:</p>
      <ul>${labels.map((label: string) => `<li>${escapeHTML(label)}</li>`).join("")}</ul>
    </div>`;
}

const REQUIRED_MARKER = `<span class="required">(required)</span>`;

/**
 * Add "(required)" to the end of the question text. If the text ends with a paragraph, the
 * marker goes inside it so that it appears on the same line as the end of the question.
 */
function addRequiredMarker(html: string): string {
  const trimmed = html.trimEnd();
  if (/<\/p>$/i.test(trimmed)) {
    return `${trimmed.slice(0, -4)} ${REQUIRED_MARKER}</p>`;
  }
  return `${trimmed} ${REQUIRED_MARKER}`;
}

/**
 * Render a single question: the full question text (with "(required)" if it is required), its
 * options, the Research Output fields, and its requirements, example answer and guidance
 */
function questionToHTML(question: TemplateNarrativeQuestion): string {
  const sampleLabel = question.useSampleTextAsDefault ? "Default Answer" : "Example Answer";
  const text = sanitize(question.text);

  return `
    <div class="question">
      <div class="question-text">${question.required ? addRequiredMarker(text) : text}</div>
      ${optionsToHTML(question)}
      ${researchOutputFieldsToHTML(question)}
      <div class="annotations">
        ${annotationToHTML("Requirements", question.requirementText, "requirements")}
        ${annotationToHTML(sampleLabel, question.sampleText, "sample-text")}
        ${annotationToHTML("Guidance", question.guidanceText, "guidance")}
      </div>
    </div>`;
}

/**
 * Render a single section and all of its questions
 */
function sectionToHTML(section: TemplateNarrativeSection): string {
  const introduction = section.introduction
    ? `<div class="section-introduction">${sanitize(section.introduction)}</div>`
    : "";
  const questions = Array.isArray(section.question)
    ? section.question.map(questionToHTML).join("")
    : "";

  return `
    <div class="section">
      <h2>${escapeHTML(section.title)}</h2>
      ${introduction}
      <div class="annotations">
        ${annotationToHTML("Requirements", section.requirements, "requirements")}
        ${annotationToHTML("Guidance", section.guidance, "guidance")}
      </div>
      ${questions}
    </div>`;
}

/**
 * Render a published Template (the sections and questions without any answers) as HTML.
 * This follows the layout of the old DMP Tool's Funder Requirements template export.
 *
 * @param margin The margins to use when rendering the HTML
 * @param font The font to use when rendering the HTML
 * @param template The Template to render
 * @returns The rendered HTML
 */
export function renderTemplateHTML(
  margin: MarginInterface,
  font: FontInterface,
  template: TemplateNarrative
): string {
  const title = escapeHTML(templateTitle(template));
  const sections = Array.isArray(template.section)
    ? template.section.map(sectionToHTML).join("")
    : "";

  return `
  <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
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
          margin: 1em 0 0 0;
        }
        p {
          margin: 0.25em 0;
        }
        div.section {
          margin-bottom: 25px;
        }
        div.question {
          margin-top: 15px;
          margin-bottom: 10px;
        }
        .annotations {
          margin-left: 15px;
          margin-bottom: 10px;
        }
        .annotation-text {
          margin-left: 15px;
        }
        .research-output-fields {
          margin-left: 15px;
          margin-bottom: 10px;
        }
        table, tr, td, th, tbody, thead, tfoot {
          page-break-inside: avoid !important;
        }
        table {
          border-collapse: collapse;
        }
        th, td {
          border: 1px solid black !important;
          padding: 2px;
        }
        ul {
          margin-left: 20px;
          padding: 0;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${sections}
    </body>
  </html>
  `;
}
