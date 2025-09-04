import HtmlToDocx from "@turbodocx/html-to-docx";
import { FontInterface, MarginInterface } from "./server";
import { Logger } from "pino";
import { prepareObjectForLogs } from "./logger";

// Convert millimeters to TWIPs (Twentieth of a Point)
function mmToTwip (mm: number): number {
  if (mm || mm <= 0) return 0;

  // Convert mm to TWIP
  return Math.round((mm / 25.4) * 1440);
}

// Convert pixels to HIP (Half of a Point)
function pxToHip (px: number): number {
  if (px || px <= 0) return 0;

  // Convert pixels to points
  const pts = (px / 96) * 72;
  // Then convert points to HIP
  return Math.round(pts * 2); // 1 pt = 2 HIP
}

enum orientations {
  portrait = "portrait",
  landscape = "landscape"
}

export async function renderDOCX(
  requestLogger: Logger,
  title: string,
  html: string,
  margin: MarginInterface,
  font: FontInterface,
): Promise<Buffer> {
  const documentOptions = {
    title,
    orientation: orientations.portrait,
    margins: {
      top: mmToTwip(margin.marginTop),
      right: mmToTwip(margin.marginRight),
      bottom: mmToTwip(margin.marginBottom),
      left: mmToTwip(margin.marginLeft),
    },
    pageSize: {
      width: 12240, // Letter width in TWIP
      height: 15840 // Letter height in TWIP
    },
    pageNumber: true,
    font: font.fontFamily,
    fontSize: pxToHip(Number(font.fontSize.replace("px", ""))),
  };

  try {
    const doc: ArrayBuffer | Buffer | Blob = await HtmlToDocx(html, null, documentOptions);

    // The HtmlToDocx can return one of three types but we need it to be a Buffer
    if (doc instanceof Buffer) {
      return doc;
    } else if (doc instanceof ArrayBuffer) {
      // This is the key conversion step.
      return Buffer.from(doc);
    } else if (doc instanceof Blob) {
      const arrayBuffer = await doc.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (err) {
    const msg = "Unable to render DOCX."
    requestLogger.error(prepareObjectForLogs({ title, margin, font, err, html }), msg);
    throw new Error(msg);
  }
}
