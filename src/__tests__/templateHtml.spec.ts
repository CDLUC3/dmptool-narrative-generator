import { describe, expect, it } from "@jest/globals";
import type { TemplateNarrative } from "@dmptool/utils";
import { escapeHTML, renderTemplateHTML, templateTitle } from "../templateHtml.js";

const margin = { marginTop: 76, marginRight: 96, marginBottom: 76, marginLeft: 96 };
const font = { fontFamily: "Tinos, serif", fontSize: "11pt", lineHeight: 120 };

function buildTemplate(overrides: Partial<TemplateNarrative> = {}): TemplateNarrative {
  return {
    id: 10,
    templateId: 3,
    title: "Arctic Data Center: NSF Polar Programs",
    version: "v2",
    visibility: "PUBLIC",
    versionType: "PUBLISHED",
    active: true,
    isDefault: false,
    owner: {
      uri: "https://ror.org/021nxhr62",
      name: "National Science Foundation (nsf.gov)",
      displayName: "National Science Foundation",
    },
    section: [
      {
        id: 1,
        order: 1,
        title: "Roles and responsibilities",
        introduction: "<p>Who is involved in managing the data</p>",
        requirements: "<p>Section requirements</p>",
        guidance: "<p>Section guidance</p>",
        question: [
          {
            id: 100,
            order: 1,
            text: "<p>What parties will be involved?</p>",
            type: "textArea",
            requirementText: "<p>Note: refer to the Arctic Data Center guidance</p>",
            guidanceText: "<p>Use ORCIDs</p>",
            sampleText: "<p>The PI, Jane Doe, will be responsible</p>",
            useSampleTextAsDefault: false,
            required: true,
          },
          {
            id: 101,
            order: 2,
            text: "Will you use a repository?",
            type: "radioButtons",
            json: {
              type: "radioButtons",
              options: [
                { label: "Yes", value: "yes", selected: true },
                { label: "No <maybe>", value: "no", selected: false },
              ],
              meta: { schemaVersion: "1.0" },
            },
            useSampleTextAsDefault: false,
            required: false,
          },
        ],
      },
    ],
    ...overrides,
  } as TemplateNarrative;
}

describe("templateTitle", () => {
  it("prefixes the title with the owner's name", () => {
    expect(templateTitle(buildTemplate())).toEqual(
      "National Science Foundation (nsf.gov): Arctic Data Center: NSF Polar Programs"
    );
  });

  it("falls back to the owner's display name", () => {
    const template = buildTemplate({ owner: { uri: "https://ror.org/1", displayName: "NSF" } });
    expect(templateTitle(template)).toEqual("NSF: Arctic Data Center: NSF Polar Programs");
  });

  it("uses just the title when there is no owner name", () => {
    const template = buildTemplate({ owner: { uri: "https://ror.org/1" } });
    expect(templateTitle(template)).toEqual("Arctic Data Center: NSF Polar Programs");
  });
});

describe("escapeHTML", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHTML(`<a href="x">Tom & Jerry's</a>`))
      .toEqual("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  });

  it("returns an empty string for missing values", () => {
    expect(escapeHTML(undefined)).toEqual("");
    expect(escapeHTML(null)).toEqual("");
  });
});

describe("renderTemplateHTML", () => {
  it("renders the title, margins and font", () => {
    const html = renderTemplateHTML(margin, font, buildTemplate());

    expect(html).toContain(
      "<title>National Science Foundation (nsf.gov): Arctic Data Center: NSF Polar Programs</title>"
    );
    expect(html).toContain(
      "<h1>National Science Foundation (nsf.gov): Arctic Data Center: NSF Polar Programs</h1>"
    );
    expect(html).toContain("margin-top: 76px;");
    expect(html).toContain("margin-left: 96px;");
    expect(html).toContain("font-family: Tinos, serif;");
    expect(html).toContain("font-size: 11pt;");
  });

  it("renders the sections with their introduction, requirements and guidance", () => {
    const html = renderTemplateHTML(margin, font, buildTemplate());

    expect(html).toContain("<h2>Roles and responsibilities</h2>");
    expect(html).toContain("<p>Who is involved in managing the data</p>");
    expect(html).toContain("<p>Section requirements</p>");
    expect(html).toContain("<p>Section guidance</p>");
  });

  it("renders the question text with its requirements, example answer and guidance in order", () => {
    const html = renderTemplateHTML(margin, font, buildTemplate());

    // The required marker goes at the end of the question text (inside the paragraph)
    expect(html).toContain(`<p>What parties will be involved? <span class="required">(required)</span></p>`);

    const requirementsIdx = html.indexOf("<p>Note: refer to the Arctic Data Center guidance</p>");
    const exampleIdx = html.indexOf("<em>Example Answer</em>:");
    const sampleIdx = html.indexOf("<p>The PI, Jane Doe, will be responsible</p>");
    const guidanceIdx = html.indexOf("<p>Use ORCIDs</p>");
    expect(requirementsIdx).toBeGreaterThan(-1);
    expect(exampleIdx).toBeGreaterThan(requirementsIdx);
    expect(sampleIdx).toBeGreaterThan(exampleIdx);
    expect(guidanceIdx).toBeGreaterThan(sampleIdx);
  });

  it("labels the sample text as the default answer when it is used as the default", () => {
    const template = buildTemplate();
    template.section[0].question[0].useSampleTextAsDefault = true;
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain("<em>Default Answer</em>:");
    expect(html).not.toContain("<em>Example Answer</em>:");
  });

  it("does not render empty annotations or the required flag for optional questions", () => {
    const template = buildTemplate();
    template.section[0].question = [template.section[0].question[1]];
    const html = renderTemplateHTML(margin, font, template);

    expect(html).not.toContain("Example Answer");
    expect(html).not.toContain("Default Answer");
    expect(html).not.toContain(`<span class="required">`);
    // The section still has requirements and guidance
    expect(html.match(/<em>Guidance<\/em>/g)).toHaveLength(1);
  });

  it("renders the options for option based questions and marks the default", () => {
    const html = renderTemplateHTML(margin, font, buildTemplate());

    expect(html).toContain(`<ul class="options"><li>Yes - default</li><li>No &lt;maybe&gt;</li></ul>`);
  });

  it("removes unsafe HTML from the rich text", () => {
    const template = buildTemplate();
    template.section[0].question[0].text = `<p onclick="alert(1)">Question</p><script>alert(1)</script>`;
    template.section[0].question[0].guidanceText = `<a href="javascript:alert(1)">Bad link</a>`;
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain(`<p>Question <span class="required">(required)</span></p>`);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("escapes the template and section titles", () => {
    const template = buildTemplate({ title: "<b>Bold</b> template" });
    template.section[0].title = "<i>Section</i>";
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain("<h1>National Science Foundation (nsf.gov): &lt;b&gt;Bold&lt;/b&gt; template</h1>");
    expect(html).toContain("<h2>&lt;i&gt;Section&lt;/i&gt;</h2>");
  });

  it("renders a template with no sections", () => {
    const html = renderTemplateHTML(margin, font, buildTemplate({ section: [] }));

    expect(html).toContain("<h1>");
    expect(html).not.toContain("<h2>");
  });

  it("renders a template whose sections are missing", () => {
    const template = buildTemplate();
    (template as { section?: unknown }).section = undefined;
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain("<h1>");
    expect(html).not.toContain("<h2>");
  });

  it("renders a section without an introduction or questions", () => {
    const template = buildTemplate();
    template.section[0].introduction = undefined;
    (template.section[0] as { question?: unknown }).question = undefined;
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain("<h2>Roles and responsibilities</h2>");
    expect(html).not.toContain("section-introduction");
    expect(html).not.toContain(`class="question"`);
  });

  it("renders a question with no text", () => {
    const template = buildTemplate();
    (template.section[0].question[0] as { text?: unknown }).text = null;
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain(`<div class="question-text"> <span class="required">(required)</span></div>`);
  });

  it("uses the option value when an option has no label", () => {
    const template = buildTemplate();
    template.section[0].question[1].json = {
      type: "radioButtons",
      options: [{ value: "maybe" }],
      meta: { schemaVersion: "1.0" },
    } as unknown as TemplateNarrative["section"][number]["question"][number]["json"];
    const html = renderTemplateHTML(margin, font, template);

    expect(html).toContain(`<ul class="options"><li>maybe</li></ul>`);
  });
});

describe("renderTemplateHTML question details", () => {
  // Builds a template with a single question
  function templateWithQuestion(type: string, json: unknown, text = `<p>${type} question</p>`): TemplateNarrative {
    const template = buildTemplate();
    template.section[0].question = [{
      id: 200,
      order: 1,
      text,
      type,
      json,
      requirementText: "<p>The requirements</p>",
      guidanceText: "<p>The guidance</p>",
      useSampleTextAsDefault: false,
      required: true,
    } as TemplateNarrative["section"][number]["question"][number]];
    return template;
  }

  describe("required questions", () => {
    it("adds (required) after question text that is not in a paragraph", () => {
      const html = renderTemplateHTML(margin, font, templateWithQuestion("text", { type: "text" }, "Plain question"));

      expect(html).toContain(`Plain question <span class="required">(required)</span>`);
    });

    it("adds (required) after the last paragraph of a multi paragraph question", () => {
      const text = "<p>1. Who is involved?</p><p>Note: refer to the guidance.</p>";
      const html = renderTemplateHTML(margin, font, templateWithQuestion("textArea", { type: "textArea" }, text));

      expect(html).toContain(
        `<p>1. Who is involved?</p><p>Note: refer to the guidance. <span class="required">(required)</span></p>`
      );
    });

    it("does not add (required) to optional questions", () => {
      const template = templateWithQuestion("textArea", { type: "textArea" });
      template.section[0].question[0].required = false;
      const html = renderTemplateHTML(margin, font, template);

      expect(html).not.toContain("(required)");
    });
  });

  describe("template builder settings", () => {
    it("does not include the comment box, best practice tags or affiliation search settings", () => {
      const json = {
        type: "affiliationSearch",
        attributes: { label: "Search for your institution", help: "Start typing the name" },
        showCommentField: true,
        meta: {},
      };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("affiliationSearch", json));

      expect(html).toContain("<p>affiliationSearch question <span class=\"required\">(required)</span></p>");
      expect(html).toContain("<p>The requirements</p>");
      expect(html).toContain("<p>The guidance</p>");
      expect(html).not.toContain("Search for your institution");
      expect(html).not.toContain("Start typing the name");
      expect(html).not.toContain("comment");
      expect(html).not.toContain("Best Practices");
      expect(html).not.toContain("Mark as required");
    });
  });

  describe("researchOutputTable", () => {
    // Matches the JSON the template builder (stateToJSON in dmptool-ui) saves
    const researchOutputJSON = {
      type: "researchOutputTable",
      attributes: { canAddRows: true, canRemoveRows: true, initialRows: 1, label: "", help: "" },
      meta: { schemaVersion: "1.0" },
      columns: [
        {
          commonStandardId: "title",
          heading: "Title",
          required: true,
          enabled: true,
          help: "Enter the title of this research output",
          content: { type: "text", attributes: { labelTranslationKey: "labels.title", maxLength: 120 } },
        },
        {
          // The template builder renamed the field, but plan writers see the translated label
          commonStandardId: "type",
          heading: "Kind of output",
          required: true,
          enabled: true,
          content: {
            type: "selectBox",
            attributes: { labelTranslationKey: "labels.outputType", help: "Pick the type" },
            options: [{ label: "Dataset", value: "dataset", selected: false }],
          },
        },
        {
          commonStandardId: "host",
          heading: "Repositories",
          enabled: true,
          content: { type: "repositorySearch", attributes: { labelTranslationKey: "labels.repositories" } },
          preferences: [{ label: "Preferred Repo XYZ", value: "https://repo.example.org" }],
        },
        {
          // No Global translation for this key so plan writers see the heading
          commonStandardId: "issued",
          heading: "Anticipated Release Date",
          enabled: true,
          content: { type: "date", attributes: { labelTranslationKey: "labels.releaseDate" } },
        },
        {
          commonStandardId: "byte_size",
          heading: "Anticipated File Size",
          enabled: false,
          content: { type: "numberWithContext", attributes: { labelTranslationKey: "labels.byteSize" } },
        },
        {
          commonStandardId: "custom",
          heading: "Funding source",
          enabled: true,
          content: { type: "text", attributes: { help: "Who funds it", defaultValue: "Default funder value" } },
        },
      ],
    };

    it("lists the selected fields in order using the labels plan writers see", () => {
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", researchOutputJSON));

      expect(html).toContain("<em>Research output fields</em>:");
      expect(html).toContain(
        "<ul><li>Title</li><li>Output Type</li><li>Repositories</li><li>Anticipated Release Date</li><li>Funding source</li></ul>"
      );
      expect(html.indexOf("Research output fields")).toBeLessThan(html.indexOf("<p>The requirements</p>"));
    });

    it("leaves out the fields that were not selected and the field settings", () => {
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", researchOutputJSON));

      expect(html).not.toContain("Anticipated File Size");
      expect(html).not.toContain("Kind of output");
      expect(html).not.toContain("Enter the title of this research output");
      expect(html).not.toContain("Pick the type");
      expect(html).not.toContain("Dataset");
      expect(html).not.toContain("Preferred Repo XYZ");
      expect(html).not.toContain("Default funder value");
      expect(html).not.toContain("Who funds it");
    });

    it("falls back to the default heading when the field has no label", () => {
      const json = { type: "researchOutputTable", columns: [{ commonStandardId: "license_ref", enabled: true }] };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", json));

      expect(html).toContain("<li>License</li>");
    });

    it("uses the heading when the label has no translation", () => {
      const json = {
        type: "researchOutputTable",
        columns: [{
          commonStandardId: "custom",
          heading: "Storage location",
          enabled: true,
          content: { attributes: { labelTranslationKey: "labels.unknownKey" } },
        }],
      };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", json));

      expect(html).toContain("<li>Storage location</li>");
    });

    it("falls back to the field id when there is no label, heading or default heading", () => {
      const json = { type: "researchOutputTable", columns: [{ commonStandardId: "something_new", enabled: true }] };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", json));

      expect(html).toContain("<li>something_new</li>");
    });

    it("renders nothing extra when the question has no fields", () => {
      const json = { type: "researchOutputTable" };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", json));

      expect(html).not.toContain("Research output fields");
    });

    it("escapes the field labels", () => {
      const json = { type: "researchOutputTable", columns: [{ commonStandardId: "custom", heading: "<b>Cost</b>", enabled: true }] };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", json));

      expect(html).toContain("<li>&lt;b&gt;Cost&lt;/b&gt;</li>");
    });

    it("renders nothing extra when no fields are selected", () => {
      const json = { type: "researchOutputTable", columns: [{ commonStandardId: "title", enabled: false }] };
      const html = renderTemplateHTML(margin, font, templateWithQuestion("researchOutputTable", json));

      expect(html).not.toContain("Research output fields");
    });

    it("does not list fields for other question types", () => {
      const html = renderTemplateHTML(margin, font, templateWithQuestion("table", researchOutputJSON));

      expect(html).not.toContain("Research output fields");
    });
  });
});
