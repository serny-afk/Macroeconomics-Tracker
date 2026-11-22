const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(600);
  await page.screenshot({ path: process.argv[2] + '/shot-scrolled.png' });
  await browser.close();
})();
