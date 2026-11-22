const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  const icons = await page.$$eval('link[rel*="icon"]', els => els.map(e => ({ rel: e.getAttribute('rel'), href: e.getAttribute('href'), type: e.getAttribute('type') })));
  console.log(JSON.stringify(icons, null, 2));

  // render the icon at favicon-realistic sizes on a white and dark backdrop
  const html = `<!doctype html><html><body style="margin:0;display:flex;gap:16px;align-items:center;background:#fff;padding:16px;">
    <div style="width:16px;height:16px;"><img src="http://localhost:3000/icon.svg" width="16" height="16"/></div>
    <div style="width:32px;height:32px;"><img src="http://localhost:3000/icon.svg" width="32" height="32"/></div>
    <div style="width:64px;height:64px;background:#222;padding:4px;"><img src="http://localhost:3000/icon.svg" width="64" height="64"/></div>
  </body></html>`;
  await page.setContent(html);
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.argv[2] + '/favicon-check.png' });
  await browser.close();
})();
