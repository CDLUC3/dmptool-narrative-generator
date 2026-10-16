import { describe, it, expect } from "@jest/globals";
import { renderCSV } from "../csv.js";
import type { AnyAnswerType, TableAnswerType } from "@dmptool/types";
import type { DMPExtensionNarrative } from "@dmptool/utils";

const defaultDisplayOptions = {
  includeCoverPage: true,
  includeSectionHeadings: true,
  includeQuestionText: true,
  includeUnansweredQuestions: true,
  includeResearchOutputs: true,
  includeRelatedWorks: true,
};

describe("renderCsv + answerToCSV integration", () => {
  const baseDisplay = {
    ...defaultDisplayOptions,
    includeSectionHeadings: false,
    includeQuestionText: false
  };

  const wrap = (answer_json: AnyAnswerType): DMPExtensionNarrative => ({
    id: 1,
    title: "Template",
    section: [
      {
        id: 123,
        title: "Section 1",
        order: 1,
        type: "BASE",
        question: [{
          id: 123,
          type: "BASE",
          text: "Q1",
          order: 1,
          answer: {
            id: 123,
            json: answer_json
          }
        }]
      }
    ]
  });

  it("handles textArea (strips HTML)", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "textArea",
      answer: "<p>Hello <b>World</b></p>",
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("Hello World");
  });

  it("handles dateRange (uses formatDate)", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "dateRange",
      answer: { start: "2020-01-02", end: "2020-12-31" },
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toMatch(/January.*2020 to December.*2020/);
  });

  it("handles numberRange", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "numberRange",
      answer: { start: 1, end: 10 },
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("1 to 10");
  });

  it("handles checkBoxes (joins with ;)", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "checkBoxes",
      answer: ["A", "B", "C"],
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("A; B; C");
  });

  it("handles multiselectBox", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "multiselectBox",
      answer: ["X", "Y"],
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("X; Y");
  });

  it("leaves empty checkbox answers blank", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "checkBoxes",
      answer: [],
      meta: { schemaVersion: "1.0.0" },
    });

    expect(renderCSV(baseDisplay, { narrative: { template: data } }).trim()).toBe("Answer");
  });

  it("handles affiliationSearch with id", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "affiliationSearch",
      answer: { affiliationName: "Uni", affiliationId: "123" },
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("Uni (123)");
  });

  it("handles affiliationSearch without id", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "affiliationSearch",
      answer: { affiliationName: "Uni", affiliationId: "" },
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("Uni");
  });

  it("handles table (JSON.stringify)", () => {
    // CSV doubles up quotation marks!
    // const expected = '{""columnHeadings"":[""col1"",""col2""],""answer"":[{""columns"":[""row1col1"",""row1col2""]}]}';
    const obj = {
      type: "table",
      columnHeadings: ["col1", "col2"],
      answer: [
        {
          columns: [
            { type: "text", answer: "row1col1", meta: { schemaVersion: "v1.0.0" } },
            { type: "text", answer: "row1col2", meta: { schemaVersion: "v1.0.0" } }
          ],
        }, {
          columns: [
            { type: "text", answer: "row2col1", meta: { schemaVersion: "v1.0.0" } },
            { type: "text", answer: "row2col2", meta: { schemaVersion: "v1.0.0" } }
          ],
        }
      ],
      meta: {
        schemaVersion: "1.0.0",
      }
    }
    const data: DMPExtensionNarrative = wrap(obj as TableAnswerType);
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    const expected = "{\"\"type\"\":\"\"text\"\",\"\"answer\"\":\"\"row1col2\"\"";
    expect(csv).toContain(expected);
  });

  it("appends comment to answer", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "textArea",
      answer: "Just the answer",
      comment: "This is a comment",
      meta: {
        schemaVersion: "1.0.0",
      }
    });
    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("Just the answer (Comment: This is a comment)");
  });

  it("renders all research output column variants and empty values", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "researchOutputTable",
      columnHeadings: ["Host", "Metadata", "License", "Flags", "Size", "Title"],
      answer: [{
        columns: [
          { commonStandardId: "host", answer: [{ repositoryName: "Repo", repositoryId: "repo-id" }, { repositoryName: "" }] },
          { commonStandardId: "metadata", answer: [{ metadataStandardName: "Schema", metadataStandardId: "schema-id" }] },
          { commonStandardId: "license_ref", answer: [{ licenseName: "CC-BY", licenseId: "cc-by" }] },
          { commonStandardId: "data_flags", answer: ["sensitive", "restricted"] },
          { commonStandardId: "byte_size", answer: { value: 10, context: "MB" } },
          { commonStandardId: "title", answer: "Dataset" },
        ],
      }, {
        columns: [
          { commonStandardId: "host", answer: [] },
          { commonStandardId: "metadata", answer: [] },
          { commonStandardId: "license_ref", answer: [] },
          { commonStandardId: "data_flags", answer: [] },
          { commonStandardId: "byte_size", answer: { value: 0, context: "MB" } },
          { commonStandardId: "title", answer: "" },
        ],
      }],
      meta: { schemaVersion: "1.0.0" },
    } as AnyAnswerType);

    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("Host: Repo (repo-id)");
    expect(csv).toContain("Metadata: Schema (schema-id)");
    expect(csv).toContain("License: CC-BY (cc-by)");
    expect(csv).toContain("Flags: sensitive, restricted");
    expect(csv).toContain("Size: 10 MB");
    expect(csv).toContain("Host: N/A");
    expect(csv).toContain("Size: N/A");
  });

  it("treats research output entries without recognized names as unavailable", () => {
    const data: DMPExtensionNarrative = wrap({
      type: "researchOutputTable",
      columnHeadings: ["Host", "Metadata", "License"],
      answer: [{
        columns: [
          { commonStandardId: "host", answer: [{}] },
          { commonStandardId: "metadata", answer: [{}] },
          { commonStandardId: "license_ref", answer: [{}] },
        ],
      }],
      meta: { schemaVersion: "1.0.0" },
    } as AnyAnswerType);

    const csv = renderCSV(baseDisplay, { narrative: { template: data } });
    expect(csv).toContain("Host: N/A; Metadata: N/A; License: N/A");
  });
});

describe("renderCsv general", () => {
  const mockData = {
    narrative: {
      template: {
        title: "Template",
        section: [
          {
            title: "S1",
            question: [{
              text: "Q1", answer: {
                json: { type: "other", answer: "Ans1" }
              }
            }]
          }
        ]
      }
    }
  };

  it("includes only Answer column when no flags", () => {
    const csv = renderCSV(
      { ...defaultDisplayOptions, includeSectionHeadings: false, includeQuestionText: false },
      mockData
    );
    expect(csv).toContain("Answer");
    expect(csv).not.toContain("Section");
    expect(csv).not.toContain("Question");
  });

  it("includes Section and Question columns when flags enabled", () => {
    const csv = renderCSV(
      { ...defaultDisplayOptions, includeSectionHeadings: true, includeQuestionText: true },
      mockData
    );
    expect(csv).toContain("Section,Question,Answer");
    expect(csv).toContain("S1");
    expect(csv).toContain("Q1");
  });

  it("handles empty sections gracefully", () => {
    const csv = renderCSV(
      { ...defaultDisplayOptions, includeSectionHeadings: true, includeQuestionText: true },
      { narrative: { template: { section: [] } } }
    );
    expect(csv).toContain("Section,Question,Answer"); // only header
  });

  it("returns empty string if no narrative data", () => {
    const csv = renderCSV(
      { ...defaultDisplayOptions, includeSectionHeadings: false, includeQuestionText: false },
      {}
    );
    expect(csv.trim()).toBe("");
  });

  it("skips sections without questions", () => {
    const csv = renderCSV(
      { ...defaultDisplayOptions, includeSectionHeadings: true, includeQuestionText: true },
      { narrative: { template: { section: [{ title: "Empty section" }] } } }
    );

    expect(csv).toBe("Section,Question,Answer\n");
  });

  it("leaves research outputs without column headings blank", () => {
    const data = {
      narrative: {
        template: {
          section: [{
            title: "Section",
            question: [{
              text: "Question",
              answer: {
                json: {
                  type: "researchOutputTable",
                  answer: [],
                  meta: { schemaVersion: "1.0.0" },
                } as AnyAnswerType,
              },
            }],
          }],
        },
      },
    };

    expect(renderCSV(
      { ...defaultDisplayOptions, includeSectionHeadings: false, includeQuestionText: false },
      data
    ).trim()).toBe("Answer");
  });
});
