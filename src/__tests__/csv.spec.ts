import { renderCSV } from "../csv";

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

  const wrap = (answer_json: any) => ({
    dmproadmap_narrative: {
      sections: [
        {
          section_title: "Section 1",
          questions: [{ question_text: "Q1", answer_json }]
        }
      ]
    }
  });

  it("handles textArea (strips HTML)", () => {
    const data = wrap({ type: "textArea", answer: "<p>Hello <b>World</b></p>" });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("Hello World");
  });

  it("handles dateRange (uses formatDate)", () => {
    const data = wrap({
      type: "dateRange",
      answer: { start: "2020-01-02", end: "2020-12-31" }
    });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toMatch(/January.*2020 to December.*2020/);
  });

  it("handles numberRange", () => {
    const data = wrap({ type: "numberRange", answer: { start: 1, end: 10 } });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("1 to 10");
  });

  it("handles checkBoxes (joins with ;)", () => {
    const data = wrap({ type: "checkBoxes", answer: ["A", "B", "C"] });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("A; B; C");
  });

  it("handles multiselectBox", () => {
    const data = wrap({ type: "multiselectBox", answer: ["X", "Y"] });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("X; Y");
  });

  it("handles affiliationSearch with id", () => {
    const data = wrap({
      type: "affiliationSearch",
      answer: { affiliationName: "Uni", affiliationId: "123" }
    });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("Uni (123)");
  });

  it("handles affiliationSearch without id", () => {
    const data = wrap({
      type: "affiliationSearch",
      answer: { affiliationName: "Uni" }
    });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("Uni");
  });

  it("handles table (JSON.stringify)", () => {
    const obj = {
      columnHeadings: ["col1", "col2"],
      answer: [{
        columns: ["row1col1", "row1col2"],
      }]
    };
    // CSV doubles up quotation marks!
    const expected = '{""columnHeadings"":[""col1"",""col2""],""answer"":[{""columns"":[""row1col1"",""row1col2""]}]}';
    const data = wrap({ type: "table", answer: obj });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain(expected);
  });

  it("handles unknown type with raw answer", () => {
    const data = wrap({ type: "other", answer: "raw" });
    const csv = renderCSV(baseDisplay, data);
    expect(csv).toContain("raw");
  });

  it("handles undefined answer as empty string", () => {
    const data = wrap({ type: "other", answer: undefined });
    const csv = renderCSV(baseDisplay, data);
    // should still include header + empty cell
    expect(csv.trim()).toEqual("Answer");
  });
});

describe("renderCsv general", () => {
  const mockData = {
    dmproadmap_narrative: {
      sections: [
        {
          section_title: "S1",
          questions: [{ question_text: "Q1", answer_json: { type: "other", answer: "Ans1" } }]
        }
      ]
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
      { dmproadmap_narrative: { sections: [] } }
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
});
