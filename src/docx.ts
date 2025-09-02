import { Document, Packer, Paragraph, TextRun } from "docx";
import * as htmlToDocx from "html-to-docx";
import { FontInterface, MarginInterface } from "./server";
import { Logger } from "pino";
import { prepareObjectForLogs } from "./logger";

export async function renderDOCX(
  requestLogger: Logger,
  title: string,
  html: string,
  margin: MarginInterface,
  font: FontInterface,
): Promise<Buffer> {
  const documentOptions = {
    title,
    orientation: 'portrait', // or 'landscape'
    margins: {
      top: margin.marginTop, // in TWIP, or use '1in', '2.54cm', '96px'
      right: margin.marginRight,
      bottom: margin.marginBottom,
      left: margin.marginLeft,
    },
    pageNumber: true,
    // font: font.fontFamily,
    // fontSize: font.fontSize,
  };

  try {
    return await htmlToDocx(html, documentOptions);
  } catch (err) {
    const msg = "Unable to render DOCX."
    requestLogger.error(prepareObjectForLogs({ title, margin, font, err, html }), msg);
    throw new Error(msg);
  }
}
