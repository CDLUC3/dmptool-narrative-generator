import {
  AffiliationSearchAnswerType,
  AnyAnswerType,
  DateRangeAnswerType, DefaultAnswer, DMPToolDMPType,
  NumberRangeAnswerType,
  TextAreaAnswerType
} from "@dmptool/types";
import { DisplayOptionsInterface } from "./server";
import { formatDate } from "./helper";
import { stringify } from "csv-stringify/sync";
import {DMPExtensionNarrative} from "@dmptool/utils";

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
    case "table":
      return JSON.stringify(json.answer);

    default:
      answer = json?.answer as string | number | boolean | undefined;
      break
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
        let answerJSON: AnyAnswerType | undefined = question.answer?.json;
        if (!answerJSON) {
          answerJSON = DefaultAnswer[question.type as string];
        }
        const answer = answerToCSV(answerJSON);

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
