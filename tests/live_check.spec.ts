import { expect, test } from '@playwright/test';

// Runs only via `npm run test:live` (playwright.live.config.ts) against the deployed site.
const LIVE_HOST = 'rabahharchaoui-design.github.io';
// PLAN 4.2: the Run map's tile host (src/lib/run/mapSource.ts), the one outside host the app may
// talk to, and only while the Run tab is open.
const TILE_HOST = 'tiles.openfreemap.org';

// PLAN 3.3: a brand new phone lands in the intake funnel.
test('live site: a brand new phone opens the intake funnel', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('intake')).toBeVisible();
});

test('live site: shell renders, manifest served, no errors, no third party requests but map tiles on the Run tab', async ({ page, baseURL }) => {
  // This phone already answered the funnel (the same flag the app writes).
  await page.addInitScript(() => localStorage.setItem('anygym.intakeDone', '1'));
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.hostname !== LIVE_HOST) foreign.push(r.url());
  });

  await page.goto('./');
  await expect(page).toHaveTitle('AnyGym');

  const nav = page.getByRole('navigation', { name: 'Main' });
  const tabs = nav.getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText(['Today', 'Run', 'History', 'Plans']);
  for (const t of await tabs.all()) await expect(t).toBeVisible();

  // Nothing left the site before the Run tab was opened.
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);

  await nav.getByRole('link', { name: 'Run' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Run With Me' })).toBeVisible();
  await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');

  const manifest = await page.request.get(new URL('manifest.webmanifest', baseURL).href);
  expect(manifest.status()).toBe(200);

  await page.waitForLoadState('networkidle');
  // On the Run tab the map may ask its tile host, and nobody else.
  expect(foreign.filter((u) => new URL(u).hostname !== TILE_HOST)).toEqual([]);
  // Leaving the Run tab ends it: no request to any outside host from the other tabs.
  await nav.getByRole('link', { name: 'History' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  const before = foreign.length;
  await page.waitForTimeout(1500);
  expect(foreign.slice(before)).toEqual([]);
  expect(errors).toEqual([]);
});
