import { expect, test } from '@playwright/test';

test('1.1 verify: network, shots, break', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  const fonts: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== 'http://localhost:4173') external.push(r.url());
    if (u.pathname.endsWith('.woff2')) fonts.push(u.pathname);
  });
  const routes: Array<[string, string]> = [['', 'today'], ['run', 'run'], ['history', 'history'], ['plans', 'plans'], ['settings', 'settings']];
  for (const [h, n] of routes) {
    await page.goto('./#/' + h);
    // Let SW registration settle: navigating away mid-register makes WebKit report an aborted sw.js fetch as a pageerror.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/verify-1.1/${n}.png` });
  }
  expect(fonts.length).toBeGreaterThan(0);
  await page.goto('./');
  const boxes: any[] = [];
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const l of await nav.getByRole('link').all()) boxes.push(await l.boundingBox());
  boxes.push(await page.getByRole('link', { name: 'Settings' }).boundingBox());
  console.log('BOXES', JSON.stringify(boxes));
  const names = ['Today', 'Run', 'History', 'Plans'];
  for (let i = 0; i < 20; i++) {
    await nav.getByRole('link', { name: names[Math.floor(Math.random() * 4)] }).tap({ timeout: 2000 });
  }
  for (let i = 0; i < 6; i++) { await page.goBack(); await page.goForward(); }
  await page.goto('./#/nonsense');
  await expect(page.locator('h1')).toHaveText('Today');
  await expect(page.locator('h1')).toBeVisible();
  console.log('EXTERNAL', JSON.stringify(external), 'FONTS', fonts.length);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
