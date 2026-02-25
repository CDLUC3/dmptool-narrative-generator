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

  it("renders cover page  for un-registered DMPs", () => {
    const html = renderHTML(display, margin, font, {
      title: "Test Plan",
      dmp_id: { identifier: "https://doi.org/10.1234/abcd" },
      contact: {
        name: "Alice",
        contact_id: {
          type: "orcid",
          identifier: "https://orcid.org/0000-0001-2345-6789"
        },
        affiliation: [{
          affiliation_id: {
            identifier: "http://example.com/affil",
            type: "url"
          },
          name: "Example University",
        }],
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
              funder_id: {
                identifier: "http://funder.org/nsf",
                type: "url"
              },
            },
          ],
          start: "2024-01-01",
          end: "2024-12-31",
        },
      ],
      narrative: {
        template: { title: "Generic Template" },
      },
      description: "This is an abstract.",
      modified: "2024-02-01",
    });

    expect(html).toContain("Test Plan");
    expect(html).toContain("0000-0001-2345-6789"); // orcidForDisplay strips prefix
    expect(html).toContain("Example University");
    expect(html).toContain("NSF");
  });

  it("renders cover page appropriately for registered DMPs", () => {
    const html = renderHTML(display, margin, font, {
      title: "Test Plan",
      dmp_id: {
        identifier: "https://doi.org/10.1234/abcd",
        type: "doi",
      },
      registered: "2025-08-01T10:50:23Z",
      contact: {
        name: "Alice",
        contact_id: {
          type: "other",
          identifier: "tester@example.com"
        },
        affiliation: [{
          affiliation_id: {
            identifier: "http://example.com/affil",
            type: "url"
          },
          name: "Example University",
        }],
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
              funder_id: {
                identifier: "http://funder.org/nsf",
                type: "url"
              },
            },
          ],
          start: "2024-01-01",
          end: "2024-12-31",
        },
      ],
      narrative: {
        template: { title: "Generic Template" }
      },
      description: "This is an abstract.",
      modified: "2024-02-01",
    });

    expect(html).toContain("Test Plan");
    expect(html).not.toContain("tester@example.com"); // doiForDisplay strips prefix
    expect(html).toContain("Example University");
    expect(html).toContain("NSF");
  });

  it("renders narrative sections and unanswered questions", () => {
    const html = renderHTML(display, margin, font, {
      title: "Narrative Test",
      dmp_id: {
        identifier: "10.5678/efgh",
        type: "other"
      },
      contact: {
        name: "Bob",
        contact_id: {
          identifier: "1234",
          type: "other"
        },
        affiliation: [{
          affiliation_id: {
            identifier: "id",
            type: "other"
          },
          name: "Org"
        }]
      },
      contributor: [],
      project: [],
      description: "desc",
      modified: "2024-01-01",
      narrative: {
        template: {
          title: "Template",
          section: [
            {
              title: "Data Collection",
              description: "Section description",
              order: 1,
              question: [
                {
                  text: "What data?",
                  order: 1,
                  answer: {
                    json: {
                      type: "textArea",
                      answer: "Some data",
                      meta: { schemaVersion: '1.0' }
                    }
                  }
                },
                {
                  text: "Unanswered?",
                  order: 2
                }, // triggers includeUnansweredQuestions
              ],
            },
          ],
        },
      }
    });

    expect(html).toContain("Data Collection");
    expect(html).toContain("Some data"); // answerToHTML -> <p>Some data</p>
    expect(html).toContain("Not answered");
  });

  it("renders related works grouped by type", () => {
    const html = renderHTML(display, margin, font, {
      title: "Works Test",
      dmp_id: {
        identifier: "id",
        type: "other"
      },
      contact: {
        name: "Y",
        contact_id: {
          identifier: "id",
          type: "other"
        },
        affiliation: [{
          affiliation_id: {
            identifier: "id",
            type: "other"
          },
          name: "Aff"
        }]
      },
      contributor: [],
      project: [],
      narrative: {
        title: "T"
      },
      description: "desc",
      modified: "2024-01-01",
      related_identifier: [
        {
          type: ["dataset"],
          identifier: "http://example.com/dataset",
          relation_type: ["isCitedBy"]
        },
        {
          type: ["publication"],
          identifier: "http://example.com/paper",
          relation_type: ["isSupplementTo"]
        },
      ],
    });

    expect(html).toContain("http://example.com/dataset");
    expect(html).toContain("http://example.com/paper");
    expect(html).toContain("Related Works");
  });

  it("handles empty arrays gracefully", () => {
    const html = renderHTML(display, margin, font, {
      title: "Empty Test",
      dmp_id: {
        identifier: "id",
        type: "other"
      },
      contact: {
        name: "Z",
        contact_id: {
          identifier: "id",
          type: "other"
        },
        affiliation: [{
          affiliation_id: {
            identifier: "id",
            type: "other"
          },
          name: "Aff"
        }]
      },
      contributor: [],
      project: [],
      description: "",
      modified: "2024-01-01",
      narrative: {
        template: {
          title: "T",
          section: []
        }
      },
      dataset: [],
      related_identifiers: [],
    });

    expect(html).toContain("Empty Test");
    expect(html).not.toContain("Not answered"); // no questions
  });
});
