// Render guide.html to PDF with Chromium (web fonts from Google Fonts).
const { chromium } = require("playwright");
const path = require("node:path");

(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(__dirname, "guide.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="font-size:8px;width:100%;text-align:center;color:#888">Civil Suits — Demo process guide · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: "14mm", bottom: "16mm", left: "13mm", right: "13mm" },
  });
  await browser.close();
  console.log("wrote", out);
})();
