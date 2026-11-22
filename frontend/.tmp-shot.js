const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto(process.argv[3] || 'http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: process.argv[2] + '/shot-full.png', fullPage: true });
  await page.screenshot({ path: process.argv[2] + '/shot-viewport.png' });
  console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
  await browser.close();
})();
