import { expect, test, type Page } from '@playwright/test';

const watch = (page: Page) => {
  const e: string[] = [];
  page.on('console', (m) => m.type() === 'error' && e.push(m.text()));
  page.on('pageerror', (x) => e.push(x.message));
  return e;
};
const open = async (page: Page) => {
  await page.goto('./?dev#/dev/plates');
  await expect(page.getByRole('heading', { name: 'Plates' })).toBeVisible();
};
const tray = (p: Page, l: string) => p.getByRole('button', { name: `Add ${l} plate to each side` });
const count = (p: Page, s: string) => p.locator(`[data-plate][data-side="${s}"]`).count();

test('1.5 audit: presets DOM counts, tray sizes', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  const report: string[] = [];
  const audit = async (tag: string) => {
    await page.waitForTimeout(500);
    const l = await page.locator('[data-plate][data-side="left"]').evaluateAll((e) => e.map((x) => x.getAttribute('data-weight')));
    const r = await page.locator('[data-plate][data-side="right"]').evaluateAll((e) => e.map((x) => x.getAttribute('data-weight')));
    const fills = await page.locator('[data-plate][data-side="right"] rect:first-child').evaluateAll((e) => e.map((x) => x.getAttribute('fill')));
    report.push(`${tag} L=${l} R=${r} fills=${fills} math=${await page.getByTestId('plate-math').textContent()} total=${await page.getByTestId('plate-total').textContent()}`);
  };
  for (const t of [135, 185, 315]) { await page.getByRole('button', { name: `${t} lb`, exact: true }).tap(); await audit(`${t}lb`); }
  await page.getByRole('button', { name: 'kg', exact: true }).tap();
  for (const t of [60, 102.5]) { await page.getByRole('button', { name: `${t} kg`, exact: true }).tap(); await audit(`${t}kg`); }
  console.log('AUDIT\n' + report.join('\n'));
  const tb = await page.locator('button[data-weight]').evaluateAll((e) => e.map((x) => { const b = x.getBoundingClientRect(); return [b.width, b.height]; }));
  console.log('TRAY', JSON.stringify(tb));
  for (const [w = 0, h = 0] of tb) expect(Math.min(w, h)).toBeGreaterThanOrEqual(48);
  expect(errors).toEqual([]);
});

test('1.5 break it', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  // fast double taps
  await tray(page, '45 lb').dblclick();
  await page.waitForTimeout(500);
  console.log('after dblclick', await count(page, 'left'), await count(page, 'right'), await page.getByTestId('plate-math').textContent());
  expect(await count(page, 'left')).toBe(2);
  await tray(page, '25 lb').tap(); await tray(page, '25 lb').tap(); await tray(page, '10 lb').tap();
  await page.waitForTimeout(500);
  expect(await count(page, 'right')).toBe(5);
  // open/close type it 10x
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: 'Type it' }).tap();
    await page.getByTestId('sheet-scrim').click({ position: { x: 20, y: 20 }, timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // huge / zero values
  await page.getByRole('button', { name: 'Type it' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Type a weight' });
  for (const ch of '99999999') await sheet.getByRole('button', { name: ch, exact: true }).tap();
  console.log('HUGE', await sheet.innerText());
  for (let i = 0; i < 10; i++) await sheet.getByRole('button', { name: 'Delete' }).tap();
  await sheet.getByRole('button', { name: '0', exact: true }).tap();
  console.log('ZERO', await sheet.innerText());
  await page.getByTestId('sheet-scrim').click({ position: { x: 20, y: 20 } });
  // unit rotate with plates
  await page.getByRole('button', { name: 'kg', exact: true }).tap();
  await page.waitForTimeout(800); expect(await count(page, 'right')).toBe(0);
  await expect(page.getByTestId('plate-math')).toHaveText('20 bar = 20 kg');
  await tray(page, '25 kg').tap();
  await page.getByRole('button', { name: 'lb', exact: true }).tap();
  await page.waitForTimeout(800); expect(await count(page, 'right')).toBe(0);
  await tray(page, '45 lb').tap();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Plates' })).toBeVisible();
  console.log('after reload', await count(page, 'right'));
  // go offline
  await page.context().setOffline(true);
  await tray(page, '45 lb').tap();
  await expect(page.getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
});

test('1.5 reduced motion', async ({ page }) => {
  const errors = watch(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await tray(page, '45 lb').tap();
  await tray(page, '25 lb').tap();
  await expect(page.getByTestId('plate-math')).toHaveText('45 bar + 2 × (45 + 25) = 185 lb');
  await page.locator('[data-plate][data-side="right"]').last().tap();
  await expect(page.getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');
  expect(errors).toEqual([]);
});
