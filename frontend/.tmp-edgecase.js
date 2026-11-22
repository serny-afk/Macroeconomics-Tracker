const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  // vitals: one row with empty points (should show "No history yet", not a broken chart)
  await page.route('**/api/vitals/market', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      key: 'TEST', name: 'Test Symbol (no history)', category: null, value: 123.45,
      change_percent: 0, points: [], x_labels: [], tone: 'up', type: 'market', updated_at: null,
    }]),
  }));
  await page.route('**/api/vitals/macro', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.route('**/api/news', route => route.fulfill({ contentType: 'application/json', body: '{"articles":[]}' }));

  // trending themes: one row missing theme_id entirely (should render non-interactive, no dead link)
  await page.route('**/api/themes/hottest*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      { theme_id: null, topic: 'Theme With No ID', score: 55 },
      { theme_id: 'real-id-123', topic: 'Normal Theme', score: 30 },
    ]),
  }));

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(String(err)));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // check the heat tile with no theme_id is NOT an <a> tag
  const noIdTile = await page.locator('text=Theme With No ID').locator('..');
  const tagName = await noIdTile.evaluate(el => el.tagName);
  console.log('no-theme_id tile tag:', tagName, '(expect DIV, not A)');

  const hasEmptyPlaceholder = await page.locator('text=No history yet').count();
  console.log('empty-points placeholder count:', hasEmptyPlaceholder, '(expect >= 1)');

  console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
  await page.screenshot({ path: process.argv[2] + '/edgecase.png' });
  await browser.close();
})();
