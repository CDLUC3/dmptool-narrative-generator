import { renderPDF } from "../pdf";
import puppeteer, { Browser, Page } from "puppeteer";

jest.mock("puppeteer");

describe("renderPdfWithPuppeteer", () => {
  let mockBrowser: jest.Mocked<Browser>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      goto: jest.fn(),
      evaluate: jest.fn(),
      close: jest.fn(),
      bringToFront: jest.fn(),
      screenshot: jest.fn(),
      type: jest.fn(),
      click: jest.fn(),
      waitForSelector: jest.fn(),
      waitForTimeout: jest.fn(),
      exposeFunction: jest.fn(),
      // add anything else if needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      pages: jest.fn().mockResolvedValue([mockPage]),
      wsEndpoint: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("launches puppeteer with expected options", async () => {
    await renderPDF("<h1>Hello</h1>");
    expect(puppeteer.launch).toHaveBeenCalledWith({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  });

  it("creates a new page and sets HTML content", async () => {
    const html = "<p>test content</p>";
    await renderPDF(html);
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.setContent).toHaveBeenCalledWith(html, { waitUntil: "networkidle0" });
  });

  it("calls page.pdf with correct options", async () => {
    await renderPDF("<p>doc</p>");
    expect(mockPage.pdf).toHaveBeenCalledWith({
      format: "Letter",
      printBackground: false,
    });
  });

  it("wraps PDF result in a Node Buffer", async () => {
    const buf = await renderPDF("<p>doc</p>");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it("closes the browser after generating PDF", async () => {
    await renderPDF("<p>doc</p>");
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("still closes the browser if setContent throws", async () => {
    mockPage.setContent.mockRejectedValueOnce(new Error("bad html"));
    await expect(renderPDF("<bad>"))
      .rejects.toThrow("bad html");
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("still closes the browser if pdf generation fails", async () => {
    mockPage.pdf.mockRejectedValueOnce(new Error("pdf failed"));
    await expect(renderPDF("<p>doc</p>"))
      .rejects.toThrow("pdf failed");
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
