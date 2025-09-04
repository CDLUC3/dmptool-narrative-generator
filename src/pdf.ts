import puppeteer, { Browser, Page } from "puppeteer";

export async function renderPDF(html: string): Promise<Buffer> {
  // Launch headless chrome so we can convert the HTML into a PDF doc
  const browser: Browser = await puppeteer.launch({
    // This path is where `apt-get` installs Chromium.
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page: Page = await browser.newPage();
    await page.setContent(html, {waitUntil: "networkidle0"});

    const pdf: Uint8Array = await page.pdf({
      format: "Letter",
      printBackground: false
    });
    // Close the browser
    await browser.close();

    // wrap Puppeteer Uint8Array into Node Buffer and return
    return Buffer.from(pdf);
  } catch (e) {
    if (browser) {
      // Close the browser
      await browser.close();
    }
    throw e;
  }
}
