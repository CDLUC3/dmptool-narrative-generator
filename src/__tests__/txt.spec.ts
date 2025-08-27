import { renderTXT } from "../txt";

describe("renderPlainText", () => {
  const bufToString = async (html: string) => {
    const buf = await renderTXT(html);
    expect(Buffer.isBuffer(buf)).toBe(true);
    return buf.toString();
  };

  it("extracts plain text from simple HTML", async () => {
    const text = await bufToString("<p>Hello World</p>");
    expect(text).toContain("Hello World");
  });

  it("removes style tag content", async () => {
    const text = await bufToString("<style>body { color: red; }</style><p>Keep me</p>");
    expect(text).toContain("Keep me");
    expect(text).not.toContain("color: red");
  });

  it("decodes HTML entities", async () => {
    const text = await bufToString("<p>Fish &amp; Chips</p>");
    expect(text).toContain("Fish & Chips");
  });

  it("collapses multiple spaces", async () => {
    const text = await bufToString("<p>Hello     World</p>");
    expect(text).toContain("Hello World");
  });

  it("adds newlines for closing tags", async () => {
    const text = await bufToString("<div>First</div><div>Second</div>");
    const lines = text.trim().split("\n");
    expect(lines[0]).toContain("First");
    expect(lines[1]).toContain("Second");
  });

  it("handles nested tags correctly", async () => {
    const text = await bufToString("<p><b>Bold</b> and <i>Italic</i></p>");
    expect(text).toContain("Bold");
    expect(text).toContain("and");
    expect(text).toContain("Italic");
  });

  it("returns empty buffer for empty input", async () => {
    const buf = await renderTXT("");
    expect(buf.toString()).toBe("");
  });

  it("trims whitespace from text nodes", async () => {
    const text = await bufToString("<p>   padded   </p>");
    expect(text).toContain("padded");
    expect(text).not.toContain("   ");
  });
});
