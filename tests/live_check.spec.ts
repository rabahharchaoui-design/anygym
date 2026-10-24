import { expect, test } from '@playwright/test';

// Runs only via `npm run test:live` (playwright.live.config.ts) against the deployed site.
const LIVE_HOST = 'rabahharchaoui-design.github.io';

test('live site: shell renders, manifest served, no errors, no third party requests', async ({ page, baseURL }) => {
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

  await nav.getByRole('link', { name: 'Run' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Run' })).toBeVisible();

  const manifest = await page.request.get(new URL('manifest.webmanifest', baseURL).href);
  expect(manifest.status()).toBe(200);

  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});
