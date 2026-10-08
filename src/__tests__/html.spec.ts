import { describe, expect, it } from "@jest/globals";
import {
  DefaultResearchOutputByteSizeAnswer,
  DefaultResearchOutputDataFlagsAnswer,
  DefaultResearchOutputDescriptionAnswer,
  DefaultResearchOutputLicenseAnswer,
  DefaultResearchOutputMetadataStandardAnswer,
  DefaultResearchOutputRepositoryAnswer,
  DefaultResearchOutputTitleAnswer,
  DefaultResearchOutputTypeAnswer,
} from "@dmptool/types";
import { renderHTML } from "../html.js";

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

  const roBaseData = {
    title: "Test Plan",
    dmp_id: { identifier: "id", type: "other" },
    contact: {
      name: "Alice",
      contact_id: { identifier: "id", type: "other" },
      affiliation: [{ affiliation_id: { identifier: "id", type: "other" }, name: "Org" }],
    },
    contributor: [],
    project: [],
    description: "desc",
    modified: "2024-01-01",
  };

  it("should render researchOutputTable row summaries using Title, Description, and Output Type column headings", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Research Outputs",
            description: "",
            order: 1,
            question: [{
              text: "Research outputs",
              order: 1,
              answer: {
                json: {
                  type: "researchOutputTable",
                  columnHeadings: ["Title", "Description", "Output Type"],
                  answer: [{
                    columns: [
                      { type: "text", answer: "My Dataset", meta: { schemaVersion: "1.0" }, commonStandardId: 'title' },
                      { type: "textArea", answer: "<p>A description of the dataset</p>", meta: { schemaVersion: "1.0" }, commonStandardId: 'description' },
                      { type: "selectBox", answer: "dataset", meta: { schemaVersion: "1.0" }, commonStandardId: 'type' },
                    ],
                  }],
                  meta: { schemaVersion: "1.0" },
                }
              }
            }]
          }]
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Row summary <h4> uses named column headings, with Output Type title-cased
    expect(html).toContain('<h4>Dataset - "My Dataset"</h4>');
    // Description content appears in the summary above the table
    expect(html).toContain("A description of the dataset");
    // Description is excluded from the table column headings
    expect(html).not.toContain("<th>Description</th>");
    // Title and Output Type remain as table column headings
    expect(html).toContain("<th>Title</th>");
    expect(html).toContain("<th>Output Type</th>");
  });

  it("should format the researchOutputTable Output Type with title case replacing hyphens and underscores", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Research Outputs",
            description: "",
            order: 1,
            question: [{
              text: "Research outputs",
              order: 1,
              answer: {
                json: {
                  type: "researchOutputTable",
                  columnHeadings: ["Title", "Description", "Output Type"],
                  answer: [{
                    columns: [
                      { type: "text", answer: "Fatty acids from juvenile salmon", meta: { schemaVersion: "1.0" }, commonStandardId: 'title' },
                      { type: "textArea", answer: "<p>Some description</p>", meta: { schemaVersion: "1.0" }, commonStandardId: 'description' },
                      { type: "selectBox", answer: "my_output_type", meta: { schemaVersion: "1.0" }, commonStandardId: 'type' },
                    ],
                  }],
                  meta: { schemaVersion: "1.0" },
                }
              }
            }]
          }]
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // "my_output_type" → replace underscores → "my output type" → title case → "My Output Type"
    expect(html).toContain('<h4>My Output Type - "Fatty acids from juvenile salmon"</h4>');
  });

  it("should use empty strings in researchOutputTable row summary when Title or Output Type headings are absent", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Research Outputs",
            description: "",
            order: 1,
            question: [{
              text: "Research outputs",
              order: 1,
              answer: {
                json: {
                  type: "researchOutputTable",
                  columnHeadings: ["Description"],
                  answer: [{
                    columns: [
                      { type: "textArea", answer: "<p>Only description</p>", meta: { schemaVersion: "1.0" }, commonStandardId: 'description' },
                    ],
                  }],
                  meta: { schemaVersion: "1.0" },
                }
              }
            }]
          }]
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // No Title or Output Type headings → both default to empty string
    expect(html).toContain('<h4> - ""</h4>');
    expect(html).toContain("Only description");
  });

  it("renders standard answer types and research output columns", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      privacy: "public",
      contributor: [{
        name: "Linked investigator",
        role: ["https://credit.niso.org/contributor-roles/investigation"],
        contributor_id: { identifier: "https://orcid.org/1" },
      }],
      project: [{
        description: "Project description",
        start: "2024-01-01",
        end: "2024-12-31",
        funding: [{ name: "Linked funder", funder_id: { identifier: "https://funder.example" } }],
      }],
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Answers",
            description: "",
            order: 1,
            question: [
              { text: "Checkbox", order: 1, answer: { json: { type: "checkBoxes", answer: ["One", "Two"], meta: { schemaVersion: "1.0" } } } },
              { text: "Date", order: 2, answer: { json: { type: "date", answer: "2024-01-02", meta: { schemaVersion: "1.0" } } } },
              { text: "Range", order: 3, answer: { json: { type: "dateRange", answer: { start: "2024-01-01", end: "2024-12-31" }, meta: { schemaVersion: "1.0" } } } },
              { text: "Number range", order: 4, answer: { json: { type: "numberRange", answer: { start: 1, end: 2 }, meta: { schemaVersion: "1.0" } } } },
              { text: "Boolean", order: 5, answer: { json: { type: "boolean", answer: false, meta: { schemaVersion: "1.0" } } } },
              { text: "Affiliation", order: 6, answer: { json: { type: "affiliationSearch", answer: { affiliationName: "University", affiliationId: "https://org.example" }, meta: { schemaVersion: "1.0" } } } },
              { text: "URL", order: 7, answer: { json: { type: "url", answer: "https://example.com", meta: { schemaVersion: "1.0" } } } },
              { text: "Email", order: 8, answer: { json: { type: "email", answer: "user@example.com", meta: { schemaVersion: "1.0" } } } },
              { text: "Unknown", order: 9, answer: { json: { type: "unknown", answer: "ignored" } } },
              { text: "Output", order: 10, answer: { json: {
                type: "researchOutputTable",
                columnHeadings: ["Host", "Metadata", "License", "Size", "Flags"],
                answer: [{
                  columns: [
                    { commonStandardId: "host", answer: [{ repositoryName: "Repo", repositoryId: "https://repo.example" }] },
                    { commonStandardId: "metadata", answer: [{ metadataStandardName: "Schema", metadataStandardId: "https://schema.example" }] },
                    { commonStandardId: "license_ref", answer: [{ licenseName: "CC-BY", licenseId: "https://license.example" }] },
                    { commonStandardId: "byte_size", answer: { value: 10, context: "MB" } },
                    { commonStandardId: "data_flags", answer: "open" },
                  ],
                }],
                meta: { schemaVersion: "1.0" },
              } } },
            ],
          }],
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(html).toContain("<li>One</li>");
    expect(html).toContain("January 1, 2024");
    expect(html).toContain("<p>1 to 2</p>");
    expect(html).toContain("<p>No</p>");
    expect(html).toContain('href="https://org.example"');
    expect(html).toContain('mailto:user@example.com');
    expect(html).toContain("unknown type");
    expect(html).toContain("invalid answer");
  });

  it("renders each specialized research output column", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Outputs",
            order: 1,
            question: [{
              text: "Output",
              order: 1,
              answer: { json: {
                type: "researchOutputTable",
                columnHeadings: ["Title", "Description", "Output Type", "Host", "Metadata", "License", "Size", "Flags"],
                answer: [{
                  columns: [
                    { ...DefaultResearchOutputTitleAnswer, answer: "Dataset" },
                    { ...DefaultResearchOutputDescriptionAnswer, answer: "<p>Description</p>" },
                    { ...DefaultResearchOutputTypeAnswer, answer: "dataset" },
                    { ...DefaultResearchOutputRepositoryAnswer, answer: [{ repositoryName: "Repo", repositoryId: "https://repo.example" }] },
                    { ...DefaultResearchOutputMetadataStandardAnswer, answer: [{ metadataStandardName: "Schema", metadataStandardId: "https://schema.example" }] },
                    { ...DefaultResearchOutputLicenseAnswer, answer: [{ licenseName: "CC-BY", licenseId: "https://license.example" }] },
                    { ...DefaultResearchOutputByteSizeAnswer, answer: { value: 10, context: "MB" } },
                    { ...DefaultResearchOutputDataFlagsAnswer, answer: ["open"] },
                  ],
                }],
                meta: { schemaVersion: "1.0" },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any },
            }],
          }],
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(html).toContain('href="https://repo.example"');
    expect(html).toContain('href="https://schema.example"');
    expect(html).toContain('href="https://license.example"');
    expect(html).toContain("<p>10 MB</p>");
  });

  it("omits unanswered questions and renders empty display helpers safely", () => {
    const html = renderHTML(
      {
        ...display,
        includeCoverPage: true,
        includeQuestionText: false,
        includeUnansweredQuestions: false,
        includeRelatedWorks: false,
      },
      margin,
      font,
      {
        title: "Minimal",
        dmp_id: { identifier: "id", type: "other" },
        contact: { name: "Creator", affiliation: [] },
        contributor: [],
        project: [],
        privacy: "private",
        narrative: {
          template: {
            title: "T",
            section: [{
              title: "Empty",
              order: 1,
              question: [{ text: "Unanswered", order: 1 }],
            }],
          },
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );

    expect(html).not.toContain("Unanswered");
    expect(html).toContain("internal use only");
  });

  it("renders research output entries without identifiers and empty output values", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Outputs",
            order: 1,
            question: [{
              text: "Output",
              order: 1,
              answer: { json: {
                type: "researchOutputTable",
                columnHeadings: ["Host", "Metadata", "License", "Type", "Flags"],
                answer: [{
                  columns: [
                    { ...DefaultResearchOutputRepositoryAnswer, answer: [] },
                    { ...DefaultResearchOutputMetadataStandardAnswer, answer: [] },
                    { ...DefaultResearchOutputLicenseAnswer, answer: [] },
                    { ...DefaultResearchOutputTypeAnswer, answer: "" },
                    { ...DefaultResearchOutputDataFlagsAnswer, answer: [] },
                  ],
                }],
                meta: { schemaVersion: "1.0" },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any },
            }],
          }],
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(html.match(/None specified/g)).toHaveLength(4);
  });

  it("handles partially answered narrative question types", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Answers",
            order: 1,
            question: [
              { text: "Currency", order: 1, answer: { json: { type: "currency", answer: 1, meta: { schemaVersion: "1.0" } } } },
              { text: "Number", order: 2, answer: { json: { type: "number", answer: 1, meta: { schemaVersion: "1.0" } } } },
              { text: "Range", order: 3, answer: { json: { type: "dateRange", answer: { end: "2024-12-31" }, meta: { schemaVersion: "1.0" } } } },
              { text: "Choices", order: 4, answer: { json: { type: "checkBoxes", answer: [], meta: { schemaVersion: "1.0" } } } },
              { text: "Affiliation", order: 5, answer: { json: { type: "affiliationSearch", answer: { affiliationName: "University" }, meta: { schemaVersion: "1.0" } } } },
            ],
          }],
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(html).toContain("Currency");
    expect(html).toContain("$1");
    expect(html).toContain("University");
    expect(html.match(/Not answered/g)).toHaveLength(1);
  });

  it("renders generic table answers", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Table",
            order: 1,
            question: [{
              text: "Rows",
              order: 1,
              answer: { json: {
                type: "table",
                columnHeadings: ["Column"],
                answer: [{
                  columns: [{ type: "text", answer: "Cell", meta: { schemaVersion: "1.0" } }],
                }],
                meta: { schemaVersion: "1.0" },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any },
            }],
          }],
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(html).toContain("<th>Column</th>");
    expect(html).toContain("<td><p>Cell</p></td>");
  });

  it("renders multi-select answers", () => {
    const html = renderHTML(display, margin, font, {
      ...roBaseData,
      narrative: {
        template: {
          title: "T",
          section: [{
            title: "Selections",
            order: 1,
            question: [{
              text: "Choices",
              order: 1,
              answer: { json: {
                type: "multiselectBox",
                answer: ["One", "Two"],
                meta: { schemaVersion: "1.0" },
              } },
            }],
          }],
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(html).toContain("<li>One</li>");
    expect(html).toContain("<li>Two</li>");
  });
});
