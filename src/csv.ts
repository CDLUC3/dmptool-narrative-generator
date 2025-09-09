import {
  AffiliationSearchAnswerType,
  AnyAnswerType,
  DateRangeAnswerType,
  NumberRangeAnswerType,
  TextAreaAnswerType
} from "@dmptool/types";
import { DisplayOptionsInterface } from "./server";
import { formatDate } from "./helper";
import { stringify } from "csv-stringify/sync";

function answerToCSV (json: AnyAnswerType): string | number | boolean {
  let answer: string | number | boolean;
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
  return answer ?? '';
}

// TODO: Update the type here once the common standard is in @dmptool/types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderCSV(display: DisplayOptionsInterface, data: any): string {
  const columns: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

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
    // TODO: Update the type here once the common standard is in @dmptool/types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.dmproadmap_narrative?.sections?.map((section: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
