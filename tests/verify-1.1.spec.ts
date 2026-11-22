import { expect, test, TILE_ORIGIN } from './fixtures';
import { tileAsks } from './helpers/tiles';

test('1.1 verify: network, shots, break', async ({ page }) => {
  // The app's own origin is where the first request (the page itself) goes, whatever port serves it.
  let own = '';
  const errors: string[] = [];
  const external: string[] = [];
  // PLAN 4.2: what each screen tried to ask the map tile host for (the fixtures refuse it in the page).
  const asks: Record<string, string[]> = {};
  const fonts: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    own ||= u.origin;
    if (u.origin !== own) external.push(r.url());
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
    // The Run tab loads its map code lazily: wait until it has asked for the map, not a fixed moment.
    if (n === 'run') await expect.poll(async () => (await tileAsks(page)).length, { timeout: 15000 }).toBeGreaterThan(0);
    asks[n] = await tileAsks(page);
    await page.screenshot({ path: `test-results/verify-1.1/${n}.png` });
  }
  // The map tile host is the one outside host the app may talk to, and only the Run tab does.
  for (const [n, urls] of Object.entries(asks)) if (n !== 'run') expect(urls, `${n} asks the tile host for nothing`).toEqual([]);
  expect(asks.run!.length, 'the Run tab asks for its map').toBeGreaterThan(0);
  for (const u of asks.run!) expect(new URL(u).origin).toBe(TILE_ORIGIN);
  expect(fonts.length).toBeGreaterThan(0);
  await page.goto('./');
  const boxes: any[] = [];
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const l of await nav.getByRole('link').all()) boxes.push(await l.boundingBox());
  boxes.push(await page.getByTestId('tab-you').boundingBox());
  console.log('BOXES', JSON.stringify(boxes));
  const names = ['Today', 'Plan', 'Run', 'History', 'You'];
  for (let i = 0; i < 20; i++) {
    await nav.getByRole('link', { name: names[Math.floor(Math.random() * names.length)] }).tap({ timeout: 2000 });
  }
  for (let i = 0; i < 6; i++) { await page.goBack(); await page.goForward(); }
  await page.goto('./#/nonsense');
  await expect(page.locator('h1')).toHaveText('Today');
  await expect(page.locator('h1')).toBeVisible();
  console.log('EXTERNAL', JSON.stringify(external), 'FONTS', fonts.length);
  // Requests that reached the network layer: none to any host but the tile host, ever.
  expect(external.filter((u) => new URL(u).origin !== TILE_ORIGIN)).toEqual([]);
  expect(errors).toEqual([]);
});
