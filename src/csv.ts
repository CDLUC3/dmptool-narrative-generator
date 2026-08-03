import {
  AffiliationSearchAnswerType,
  AnyAnswerType,
  AnyResearchOutputTableColumnAnswerType,
  DateRangeAnswerType,
  DMPToolDMPType,
  NumberRangeAnswerType,
  ResearchOutputLicenseColumnAnswerType,
  ResearchOutputMetadataStandardColumnAnswerType,
  ResearchOutputRepositoryColumnAnswerType,
  ResearchOutputTableAnswerType,
  ResearchOutputTableRowAnswerType,
  TextAreaAnswerType
} from "@dmptool/types";
import { DisplayOptionsInterface } from "./server";
import { formatDate } from "./helper";
import { stringify } from "csv-stringify/sync";
import { DMPExtensionNarrative } from "@dmptool/utils";

// Convert an array of values in an answer to a single entry
function answerArrayToString(
  heading: string,
  answer: ResearchOutputRepositoryColumnAnswerType["answer"]
    | ResearchOutputMetadataStandardColumnAnswerType["answer"]
    | ResearchOutputLicenseColumnAnswerType["answer"],
): string {
  if (Array.isArray(answer)) {
    // Ignore any empty entries
    const entries = answer.filter(Boolean).filter(entry => {
      return 'repositoryName' in entry
        ? entry.repositoryName !== ''
        : 'metadataStandardName' in entry
          ? entry.metadataStandardName !== ''
          : 'licenseName' in entry
            ? entry.licenseName !== ''
            : false;
    });

    if (entries.length > 0) {
      const strings: string[] = entries.map(entry => {
        return 'repositoryName' in entry
          ? `${entry.repositoryName} (${entry.repositoryId})`
          : 'metadataStandardName' in entry
            ? `${entry.metadataStandardName} (${entry.metadataStandardId})`
            : 'licenseName' in entry
              ? `${entry.licenseName} (${entry.licenseId})`
              : '';
      });
      return `${heading}: ${strings.join(', ')}`;
    }
  }
  return `${heading}: N/A`;
}

function answerToCSV (json: AnyAnswerType): string | number | boolean {
  let answer: string | number | boolean | undefined;
  // Special handling for certain answer types
  switch (json?.type as string) {
    case "textArea": {
      const tAnswer = json.answer as TextAreaAnswerType["answer"];
      answer = tAnswer.replace(/<[^>]*>/g, "");
      break;
    }
    case "dateRange": {
      const drAnswer = json.answer as DateRangeAnswerType["answer"];
      answer = `${formatDate(drAnswer.start)} to ${formatDate(drAnswer.end)}`;
      break;
    }
    case "numberRange": {
      const nrAnswer = json.answer as NumberRangeAnswerType["answer"];
      answer = `${nrAnswer.start} to ${nrAnswer.end}`;
      break;
    }
    case "checkBoxes":
    case "multiselectBox": {
      if (Array.isArray(json.answer) && json.answer.length > 0) {
        answer = json.answer.join("; ");
      }
      break;
    }
    case "affiliationSearch": {
      const data = json.answer as AffiliationSearchAnswerType["answer"];
      answer = data?.affiliationId ? `${data.affiliationName} (${data.affiliationId})` : data.affiliationName;
      break;
    }
    case "researchOutputTable":
      if ('columnHeadings' in json) {
        const roJSON = json as ResearchOutputTableAnswerType;
        const headings = roJSON.columnHeadings;
        answer = roJSON.answer.map((row: ResearchOutputTableRowAnswerType) => {
          return row.columns.map((col: AnyResearchOutputTableColumnAnswerType, idx: number) => {
            switch (col.commonStandardId) {
              case 'host':
                return answerArrayToString(headings[idx], col.answer as ResearchOutputRepositoryColumnAnswerType["answer"]);
              case 'metadata':
                return answerArrayToString(headings[idx], col.answer as ResearchOutputMetadataStandardColumnAnswerType["answer"]);
              case 'license_ref':
                return answerArrayToString(headings[idx], col.answer as ResearchOutputLicenseColumnAnswerType["answer"]);
              case 'data_flags':
                return `${headings[idx]}: ${ col.answer.length > 0 ? col.answer.join(', ') : 'N/A'}`;
              case 'byte_size':
                return col.answer.value > 0
                  ? `${headings[idx]}: ${col.answer.value} ${col.answer.context}`
                  : `${headings[idx]}: N/A`;
              default:
                return `${headings[idx]}: ${col.answer}`;
            }
          }).join("; ");
        }).flat().join("\n");
      }
      break;

    case "table":
      return JSON.stringify(json.answer);

    default:
      answer = json?.answer as string | number | boolean | undefined;
      break;
  }
  // Normalize to string for CSV output
  let finalAnswer = answer ?? '';

  // 👇 Append comment if it exists
  if (json?.comment) {
    finalAnswer = `${finalAnswer} (Comment: ${json.comment})`;
  }

  return finalAnswer;

}

export function renderCSV(display: DisplayOptionsInterface, data: DMPToolDMPType["dmp"]): string {
  const columns: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  // If there is narrative content
  if (data.narrative?.template?.section) {
    // Define the column headings
    if (display.includeSectionHeadings) {
      columns.push('Section');
    }
    if (display.includeQuestionText) {
      columns.push('Question');
    }
    columns.push('Answer');

    // Define the rows
    const narrative = data.narrative?.template as DMPExtensionNarrative;
    narrative?.section?.map((section) => {
      return section.question?.map((question) => {
        const row = [];
        const answer = answerToCSV(question.answer?.json as AnyAnswerType);

        if (display.includeSectionHeadings) {
          row.push(section.title);
        }
        if (display.includeQuestionText) {
          row.push(question.text);
        }
        row.push(answer ?? '');
        rows.push(row);
      });
    });
  }
  return stringify(rows, { header: true, columns });
}
