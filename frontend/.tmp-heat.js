const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const el = await page.locator('a[href*="/timeline/"]').first().locator('..');
  await page.screenshot({ path: process.argv[2] + '/heat-viewport.png' });
  await browser.close();
})();
