import { Document, Packer, Paragraph, TextRun } from "docx";

export async function renderDOCX(data: any): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: data.title, bold: true, size: 32 })] }),
          new Paragraph(data.abstract || ""),
          ...(data.sections?.map((s: any) => [
            new Paragraph({ children: [new TextRun({ text: s.heading, bold: true, size: 26 })] }),
            new Paragraph(s.body || ""),
            ...(s.bullets?.map((b: string) => new Paragraph("• " + b)) || []),
          ]) || []).flat(),
        ],
      },
    ],
  });
  return await Packer.toBuffer(doc);
}
