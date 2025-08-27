import { Parser } from "htmlparser2";

export async function renderTXT(html: string): Promise<Buffer> {
  let plainText = '';
  let inStyleTag = false;

  const parser = new Parser({
    onopentag(name: string) {
      if (name === 'style') {
        inStyleTag = true;
      }
    },
    ontext(text: string) {
      if (!inStyleTag) {
        // Remove excess space
        plainText += text.replace(/\s+/g, ' ');
      }
    },
    onclosetag(name: string) {
      if (name === 'style') {
        inStyleTag = false;
      } else {
        // Add a newline character for closing tags
        plainText += '\n';
      }
    },
  }, { decodeEntities: true }); // decodeEntities ensures HTML entities like &amp; are converted

  parser.write(html);
  parser.end();

  // Clean up extra whitespace and then wrap into Node Buffer and return
  return Buffer.from(plainText);
}
