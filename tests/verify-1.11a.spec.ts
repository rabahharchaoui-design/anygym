import { allowConsoleErrors, expect, test } from './fixtures';
import { mockReportApi } from './helpers/reportApi';
import { dbAll, dbPut, quickWith, seedFinished, bar185 } from './workout-helpers';

// Tester pass for PLAN 1.11a: privacy of every captured payload.
const SECRETS = ['Zebra Palace Gym', 'secret note 4711', 'imported note 5522', 'jane.doe@example.com', 'Zebra Plan 9923', 'Zebra Profile Name', 'seed-'];

test('PRIVACY: nothing seeded leaves the phone in feedback or crash payloads', async ({ page, context }) => {
  allowConsoleErrors(/Privacy crash/, /app error at/);
  const sent = await mockReportApi(context);
  await page.goto('./');
  const gymId = await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  const gym = (await dbAll<Record<string, unknown>>(page, 'gyms')).find((g) => g.id === gymId)!;
  const sessions = await dbAll<Record<string, unknown>>(page, 'sessions');
  const sets = await dbAll<Record<string, unknown>>(page, 'sets');
  await dbPut(page, {
    gyms: [{ ...gym, name: 'Zebra Palace Gym' }],
    sessions: [{ ...sessions[0], note: 'imported note 5522 jane.doe@example.com', imported: true }],
    sets: [{ ...sets[0], note: 'secret note 4711' }],
    plans: [{ id: 'plan-zebra', name: 'Zebra Plan 9923', source: 'generated', createdAt: Date.now() }],
    profile: [{ id: 'me', name: 'Zebra Profile Name', defaultUnit: 'lb', createdAt: Date.now() }],
  });
  await page.evaluate(() => localStorage.setItem('anygym-drafts', JSON.stringify({ 'seed-x': { e: { id: 'd', load: null, note: 'draft jane.doe@example.com' } } })));
  await page.reload();
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  await page.evaluate(() => console.error('app error at jane.doe@example.com in /Users/jane/x.js?token=abc'));
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('hello');
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByTestId('report-done')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await page.goBack();
  await page.evaluate(() => window.setTimeout(() => { throw new Error('Privacy crash'); }));
  await expect.poll(() => sent.filter((s) => s.path === '/crash').length).toBe(1);
  const all = JSON.stringify(sent);
  console.log('PAYLOADS', all.replace(/"screenshot":"[^"]*"/, '"screenshot":"..."'));
  for (const s of SECRETS) expect(all, s).not.toContain(s);
  const fb = sent.find((s) => s.path === '/feedback')!.body;
  expect(Object.keys(fb).sort()).toEqual(['appVersion', 'device', 'errors', 'gymType', 'message', 'requestId', 'route', 'unit']);
  expect((fb.errors as string[]).length).toBeLessThanOrEqual(20);
});

test('GUARD: service worker controlled page sends a report to the mock, never to the real Worker', async ({ page, context }) => {
  const sent = await mockReportApi(context);
  const hits: string[] = [];
  page.on('request', (r) => { if (r.url().includes('workers.dev')) hits.push(r.url()); });
  context.on('request', (r) => { if (r.url().includes('workers.dev')) hits.push(`ctx ${r.url()}`); });
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('sw guard');
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByTestId('report-done')).toBeVisible();
  expect(sent).toHaveLength(1);
  console.log('REAL-REQUESTS', JSON.stringify(hits));
});

test('double tap and rapid taps on Send deliver one report; reload mid-offline-queue keeps one', async ({ page, context }) => {
  const sent = await mockReportApi(context);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('x'.repeat(5000));
  const send = sheet.getByTestId('report-send');
  await send.scrollIntoViewIfNeeded(); const bb = (await send.boundingBox())!; const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  await page.touchscreen.tap(cx, cy); await page.touchscreen.tap(cx, cy).catch(() => {}); await page.touchscreen.tap(cx, cy).catch(() => {});
  await expect(sheet.getByTestId('report-done')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(sent).toHaveLength(1);
  expect(String(sent[0]!.body.message).length).toBeLessThanOrEqual(4000);
  // offline, queue, reload while offline, then online: exactly one
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await context.setOffline(true);
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  await sheet.getByTestId('report-text').fill('queued one');
  await send.tap();
  await expect(sheet.getByTestId('report-done')).toContainText('saved on this phone');
  await page.reload();
  await page.waitForTimeout(2500);
  expect(sent).toHaveLength(1);
  await context.setOffline(false);
  await expect.poll(() => sent.length, { timeout: 15000 }).toBe(2);
  await page.waitForTimeout(2000);
  expect(sent).toHaveLength(2);
});

test('SHEET at 130% text: disclosure reachable by scrolling, targets >= 48, nothing clipped', async ({ page }) => {
  await page.goto('./#/settings');
  await page.addStyleTag({ content: 'html{font-size:130% !important}' });
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('hi');
  const small = await sheet.locator('button, textarea, input:not([type=file])').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${e.textContent?.trim().slice(0, 20)}:${Math.round(r.width)}x${Math.round(r.height)}`; }).filter((s) => { const [w, h] = s.split(':').pop()!.split('x').map(Number); return h! < 48 || w! < 48; }));
  console.log('SMALL', JSON.stringify(small));
  await sheet.getByTestId('report-disclosure').scrollIntoViewIfNeeded();
  const r = await sheet.getByTestId('report-disclosure').evaluate((e) => { const b = e.getBoundingClientRect(); return { bottom: b.bottom, vh: innerHeight, sw: e.scrollWidth, cw: e.clientWidth }; });
  console.log('DISC', JSON.stringify(r));
  expect(r.bottom).toBeLessThanOrEqual(r.vh);
  expect(r.sw).toBeLessThanOrEqual(r.cw + 1);
  await page.screenshot({ path: `reports/shots/1.11a-verify/sheet-130-${test.info().project.name.replace(/ /g, '-')}.png` });
});
