const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.goto(process.argv[3], { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: process.argv[2] + '/shot-top.png' });
  await browser.close();
})();
