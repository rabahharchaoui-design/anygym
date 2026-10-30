import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, exerciseView, fitsOneScreen, quickWith, watchErrors } from './workout-helpers';
import { makeGym } from '../src/db/gyms';

// Tester round 4: header crowding in the sheet with long totals, horn variant, badge vs number,
// 130% text on the sheet, double tap, reload, offline.
const dev = () => test.info().project.name.replace(/ /g, '-');
const shot = (page: Page, n: string) => page.screenshot({ path: `reports/shots/2.0b/v4/${n}-${dev()}.png` });

async function openSheet(page: Page, unit: 'lb' | 'kg') {
  if (unit === 'kg') {
    await page.goto('./');
    await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
    const old = (await dbAll<Record<string, unknown>>(page, 'gyms')).map((g) => ({ ...g, isActive: false }));
    await dbPut(page, { gyms: [...old, makeGym({ name: 'K', type: 'full', unit: 'kg', isActive: true })] });
    await page.reload();
  }
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await page.waitForTimeout(500);
  await fitsOneScreen(page);
  await shot(page, `exview-${unit}`);
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  return sheet;
}

const crowd = (page: Page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')!;
    const btn = (t: RegExp) => [...sheet.querySelectorAll('button')].find((b) => t.test((b.textContent || '').trim()))!;
    const r = (e: Element) => e.getBoundingClientRect();
    const card = r(sheet.querySelector('[data-testid="plate-svg"]')!.closest('section, div')!);
    const ti = r(btn(/^Type it$/)), cl = r(btn(/^Clear$/)), t = [ti.right, cl.left];
    return { ti: [ti.left, ti.right], cl: [cl.left, cl.right], t: [t[0], t[1]], card: [card.left, card.right], vw: innerWidth };
  });

for (const unit of ['kg', 'lb'] as const) {
  test(`sheet header with long total ${unit} @matrix`, async ({ page }) => {
    test.setTimeout(120_000);
    const errs = watchErrors(page);
    const sheet = await openSheet(page, unit);
    const taps = unit === 'kg' ? [25, 25, 20, 15, 10, 5, 2.5, 1.25] : [45, 45, 35, 25, 10, 5, 2.5];
    for (const w of taps) { await sheet.locator(`button[data-weight="${w}"]`).first().tap(); await page.waitForTimeout(80); }
    await page.waitForTimeout(600);
    await shot(page, `sheet-long-${unit}`);
    const c = await crowd(page);
    console.log('CROWD', unit, dev(), JSON.stringify(c));
    // Type it and Clear stay inside the card and clear of the total.
    expect(c.ti[0]!).toBeGreaterThanOrEqual(c.card[0]! - 0.5);
    expect(c.cl[1]!).toBeLessThanOrEqual(c.card[1]! + 0.5);
    expect(errs).toEqual([]);
  });
}

test('sheet 130% text, double tap Done, reload, offline @matrix', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errs = watchErrors(page);
  const sheet = await openSheet(page, 'lb');
  for (const w of [45, 45, 35, 25, 10, 5, 2.5]) { await sheet.locator(`button[data-weight="${w}"]`).first().tap(); await page.waitForTimeout(80); }
  await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')!;
    const els = Array.from(d.querySelectorAll<HTMLElement>('*')).filter((el) => !el.closest('svg'));
    const sizes = els.map((el) => { const st = getComputedStyle(el); return { el, fs: parseFloat(st.fontSize), lh: parseFloat(st.lineHeight) }; });
    for (const { el, fs, lh } of sizes) {
      el.style.fontSize = `${fs * 1.3}px`;
      if (Number.isFinite(lh)) el.style.lineHeight = `${lh * 1.3}px`;
    }
  });
  await page.waitForTimeout(400);
  await shot(page, 'sheet-130');
  const info = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')!;
    const hit = (el: Element) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: r.top >= 0 && r.bottom <= innerHeight, ok: !!top && (el === top || el.contains(top) || top.contains(el)), top: top ? `${top.tagName}.${(top as HTMLElement).className}|${(top.textContent || '').slice(0, 20)}` : null, r: [r.left, r.top, r.width, r.height] }; };
    const b = (t: RegExp) => [...d.querySelectorAll('button')].find((x) => t.test((x.textContent || '').trim()))!;
    return { done: hit(b(/^Done$/)), change: hit(b(/Change/)), typeit: hit(b(/^Type it$/)), clear: hit(b(/^Clear$/)), sw: document.documentElement.scrollWidth - innerWidth };
  });
  console.log('S130', dev(), JSON.stringify(info));
  expect(info.sw).toBeLessThanOrEqual(0);
  // double tap Done: one sheet close, one set value
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Done', exact: true }).dblclick();
  await expect(page.getByRole('dialog', { name: 'Pick the weight' })).toHaveCount(0);
  await expect(exerciseView(page, 'barbell-back-squat').getByTestId('weight-cell').first()).toContainText('380');
  await context.setOffline(true);
  await page.reload();
  await expect(exerciseView(page, 'barbell-back-squat')).toBeVisible();
  await expect(exerciseView(page, 'barbell-back-squat').getByTestId('weight-cell').first()).toContainText('380');
  await context.setOffline(false);
  expect(errs).toEqual([]);
});

test('horn variant and group badge vs number @matrix', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = watchErrors(page);
  await page.goto('./?dev#/dev/loads');
  await expect(page.getByTestId('section-dumbbell')).toBeVisible();
  const s = page.getByTestId('section-plate-machine');
  await s.scrollIntoViewIfNeeded();
  const add = async (w: number) => { await s.getByRole('button', { name: `Add ${w} lb plate to each side` }).tap(); await page.waitForTimeout(150); };
  const measure = () => s.evaluate((el) => {
    const svg = el.querySelector('svg')!;
    const rr = (e: Element) => e.getBoundingClientRect();
    const plates = [...svg.querySelectorAll('[data-plate]')].map((p) => ({ more: p.hasAttribute('data-more'), face: p.querySelector('[data-face]')?.textContent, badge: p.querySelector('[data-badge]')?.textContent ?? '', lines: p.getAttribute('data-lines'), l: rr(p.querySelector('rect')!).left, r: rr(p.querySelector('rect')!).right,
      overlap: (() => { const f = p.querySelector('[data-face]'), bd = p.querySelector('[data-badge]'); if (!f || !bd) return false; const a = rr(f), b = rr(bd); return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); })() }));
    const card = rr(el);
    const all = [...svg.querySelectorAll('rect,path,text')].map(rr).filter((x) => x.width > 0);
    return { plates, out: all.filter((x) => x.left < card.left - 0.5 || x.right > card.right + 0.5).length, math: el.querySelector('[data-testid="plate-math"]')?.textContent ?? el.querySelector('[data-testid="plate-total"]')?.textContent, bd: el.querySelector('[data-testid="plate-breakdown"]')?.textContent };
  });
  await add(45); await add(25);
  const a = await measure();
  console.log('HORN 45+25', dev(), JSON.stringify(a));
  await shot(page, 'horn-45-25');
  expect(a.out).toBe(0);
  for (const p of a.plates) expect(p.overlap).toBe(false);
  await add(45); await add(45);
  const b = await measure();
  console.log('HORN 3x45+25', dev(), JSON.stringify(b));
  await shot(page, 'horn-3x45');
  expect(b.out).toBe(0);
  for (const p of b.plates) expect(p.overlap).toBe(false);
  expect(errs).toEqual([]);
});

test('group badge 3x25 kg on the plate diagram @matrix', async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto('./?dev#/dev/plates?dev&unit=kg&nohint');
  await page.reload();
  for (let i = 0; i < 3; i++) { await page.locator('button[data-weight="25"]').first().dispatchEvent('click'); await page.waitForTimeout(80); }
  await page.waitForTimeout(600);
  await shot(page, 'kg-3x25');
  const r = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const rr = (e: Element) => e.getBoundingClientRect();
    return { w: rr(svg).width, math: document.querySelector('[data-testid="plate-math"]')?.textContent, plates: [...svg.querySelectorAll('[data-plate]')].map((p) => { const f = p.querySelector('[data-face]'), bd = p.querySelector('[data-badge]'); const a = f && rr(f), b = bd && rr(bd); return { face: f?.textContent, badge: bd?.textContent, overlap: !!(a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)), rect: rr(p.querySelector('rect')!).width }; }) };
  });
  console.log('B3x25', dev(), JSON.stringify(r));
  for (const p of r.plates) expect(p.overlap).toBe(false);
  expect(errs).toEqual([]);
});
