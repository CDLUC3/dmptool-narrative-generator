import { renderHTML } from "../html";

describe("renderHtmlTemplate", () => {
  const display = {
    includeCoverPage: true,
    includeSectionHeadings: true,
    includeQuestionText: true,
    includeUnansweredQuestions: true,
    includeResearchOutputs: true,
    includeRelatedWorks: true,
  };

  const margin = { marginTop: 10, marginRight: 10, marginBottom: 10, marginLeft: 10 };
  const font = { fontFamily: "Arial", fontSize: "12pt", lineHeight: 120 };

  it("renders cover page with DOI, ORCID and funder links", () => {
    const html = renderHTML(display, margin, font, {
      title: "Test Plan",
      dmp_id: { identifier: "https://doi.org/10.1234/abcd" },
      contact: {
        name: "Alice",
        contact_id: { identifier: "https://orcid.org/0000-0001-2345-6789" },
        dmproadmap_affiliation: {
          affiliation_id: { identifier: "http://example.com/affil" },
          name: "Example University",
        },
      },
      contributor: [
        {
          role: ["http://credit.niso.org/contributor-roles/investigation"],
          name: "PI Person",
        },
      ],
      project: [
        {
          funding: [
            {
              name: "NSF",
              funder_id: { identifier: "http://funder.org/nsf" },
            },
          ],
          start: "2024-01-01",
          end: "2024-12-31",
        },
      ],
      dmproadmap_template: { title: "Generic Template" },
      description: "This is an abstract.",
      modified: "2024-02-01",
    });

    expect(html).toContain("Test Plan");
    expect(html).toContain("10.1234/abcd"); // doiForDisplay strips prefix
    expect(html).toContain("0000-0001-2345-6789"); // orcidForDisplay strips prefix
    expect(html).toContain("Example University");
    expect(html).toContain("NSF");
  });

  it("renders narrative sections and unanswered questions", () => {
    const html = renderHTML(display, margin, font, {
      title: "Narrative Test",
      dmp_id: { identifier: "10.5678/efgh" },
      contact: { name: "Bob", contact_id: { identifier: "1234" }, dmproadmap_affiliation: { affiliation_id: { identifier: "id" }, name: "Org" } },
      contributor: [],
      project: [],
      dmproadmap_template: { title: "Template" },
      description: "desc",
      modified: "2024-01-01",
      dmproadmap_narrative: {
        sections: [
          {
            section_title: "Data Collection",
            section_description: "Section description",
            questions: [
              { question_text: "What data?", answer_json: { type: "textArea", answer: "Some data" } },
              { question_text: "Unanswered?" }, // triggers includeUnansweredQuestions
            ],
          },
        ],
      },
    });

    expect(html).toContain("Data Collection");
    expect(html).toContain("Some data"); // answerToHTML -> <p>Some data</p>
    expect(html).toContain("Not answered");
  });

  it("renders related works grouped by type", () => {
    const html = renderHTML(display, margin, font, {
      title: "Works Test",
      dmp_id: { identifier: "id" },
      contact: { name: "Y", contact_id: { identifier: "id" }, dmproadmap_affiliation: { affiliation_id: { identifier: "id" }, name: "Aff" } },
      contributor: [],
      project: [],
      dmproadmap_template: { title: "T" },
      description: "desc",
      modified: "2024-01-01",
      dmproadmap_related_identifiers: [
        { work_type: ["dataset"], citation: "Dataset citation" },
        { work_type: ["publication"], identifier: "http://paper" },
      ],
    });

    expect(html).toContain("Dataset citation");
    expect(html).toContain("http://paper");
    expect(html).toContain("Related Works");
  });

  it("handles empty arrays gracefully", () => {
    const html = renderHTML(display, margin, font, {
      title: "Empty Test",
      dmp_id: { identifier: "id" },
      contact: { name: "Z", contact_id: { identifier: "id" }, dmproadmap_affiliation: { affiliation_id: { identifier: "id" }, name: "Aff" } },
      contributor: [],
      project: [],
      dmproadmap_template: { title: "T" },
      description: "",
      modified: "2024-01-01",
      dmproadmap_narrative: { sections: [] },
      dataset: [],
      dmproadmap_related_identifiers: [],
    });

    expect(html).toContain("Empty Test");
    expect(html).not.toContain("Not answered"); // no questions
  });
});
