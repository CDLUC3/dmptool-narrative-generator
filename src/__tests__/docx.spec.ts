import { describe, expect, it, jest } from "@jest/globals";
import type { Logger } from "pino";

const mockHtmlToDocx = jest.fn();
jest.unstable_mockModule("@turbodocx/html-to-docx", () => ({
  default: mockHtmlToDocx,
}));

const { renderDOCX } = await import("../docx.js");
const logger = { error: jest.fn() } as unknown as Logger;
const margin = { marginTop: 25.4, marginRight: 12.7, marginBottom: 0, marginLeft: -1 };
const font = { fontFamily: "Arial", fontSize: "16px", lineHeight: 120 };

describe("renderDOCX", () => {
  it("adds table styles and converts document options before returning a Buffer", async () => {
    mockHtmlToDocx.mockResolvedValueOnce(Buffer.from("document"));

    const result = await renderDOCX(
      logger,
      "Narrative",
      '<table><tr><th style="color:red">Header</th><td>Cell</td></tr></table>',
      margin,
      font,
    );

    expect(result).toEqual(Buffer.from("document"));
    expect(mockHtmlToDocx).toHaveBeenCalledWith(
      '<table style="border-collapse:collapse;"><tr><th style="color:red;border:1px solid black;padding:2px;" >Header</th><td style="border:1px solid black;padding:2px;">Cell</td></tr></table>',
      null,
      expect.objectContaining({
        title: "Narrative",
        orientation: "portrait",
        margins: { top: 1440, right: 720, bottom: 0, left: 0 },
        font: "Arial",
        fontSize: 24,
      }),
    );
  });

  it("converts ArrayBuffer and Blob output to Buffers", async () => {
    mockHtmlToDocx.mockResolvedValueOnce(new Uint8Array([1, 2]).buffer);
    await expect(renderDOCX(logger, "Title", "", margin, font)).resolves.toEqual(Buffer.from([1, 2]));

    mockHtmlToDocx.mockResolvedValueOnce(new Blob([new Uint8Array([3, 4])]));
    await expect(renderDOCX(logger, "Title", "", margin, font)).resolves.toEqual(Buffer.from([3, 4]));
  });

  it("preserves existing table styles", async () => {
    mockHtmlToDocx.mockResolvedValueOnce(Buffer.from("document"));

    await renderDOCX(logger, "Title", '<table style="width:100%"></table>', margin, font);

    expect(mockHtmlToDocx).toHaveBeenCalledWith(
      '<table style="width:100%;border-collapse:collapse;" ></table>',
      null,
      expect.any(Object),
    );
  });

  it("logs and throws a stable error when conversion fails", async () => {
    const error = new Error("converter failed");
    mockHtmlToDocx.mockRejectedValueOnce(error);

    await expect(renderDOCX(logger, "Title", "<p>text</p>", margin, font))
      .rejects.toThrow("Unable to render DOCX.");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, title: "Title" }),
      "Unable to render DOCX.",
    );
  });

  it("handles non-positive font sizes and an unsupported converter return value", async () => {
    mockHtmlToDocx.mockResolvedValueOnce({} as never);

    await expect(renderDOCX(
      logger,
      "Title",
      "",
      { marginTop: 0, marginRight: -1, marginBottom: 0, marginLeft: 0 },
      { ...font, fontSize: "-1px" },
    )).resolves.toBeUndefined();
    expect(mockHtmlToDocx).toHaveBeenCalledWith(
      "",
      null,
      expect.objectContaining({ fontSize: 0 }),
    );
  });
});
