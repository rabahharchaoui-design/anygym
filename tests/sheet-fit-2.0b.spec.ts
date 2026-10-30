import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, exerciseView, quickWith, watchErrors } from './workout-helpers';
import { makeGym } from '../src/db/gyms';

// PLAN 2.0b: the weight sheet's readout and pinned Done on every phone, at 100% and 130% text.
// A 5 character total ("227.5 kg") never pushes Type it or Clear past the card margins, and the
// plate tray is never under the Done bar.

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
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400);
  return sheet;
}

/** Bigger text the way the tester does it: every font size and line height in the sheet × k. */
const scaleText = (page: Page, k: number) =>
  page.evaluate((k) => {
    const d = document.querySelector('[role="dialog"]')!;
    const els = Array.from(d.querySelectorAll<HTMLElement>('*')).filter((el) => !el.closest('svg'));
    const sizes = els.map((el) => ({ el, st: getComputedStyle(el) })).map(({ el, st }) => ({ el, fs: parseFloat(st.fontSize), lh: parseFloat(st.lineHeight) }));
    for (const { el, fs, lh } of sizes) {
      el.style.fontSize = `${fs * k}px`;
      if (Number.isFinite(lh)) el.style.lineHeight = `${lh * k}px`;
    }
  }, k);

/** Type it, Clear and the total: inside the 16 px card margins, never on top of each other. */
const readout = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')!;
    const btn = (t: RegExp) => [...d.querySelectorAll('button')].find((b) => t.test((b.textContent || '').trim()))!;
    const r = (e: Element) => e.getBoundingClientRect();
    const card = r(d.querySelector('[data-testid="plate-svg"]')!.parentElement!);
    const ti = r(btn(/^Type it$/));
    const cl = r(btn(/^Clear$/));
    const total = r(d.querySelector('[data-testid="plate-total"]')!);
    const hit = (a: DOMRect, b: DOMRect) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    return { card: [card.left, card.right], ti: [ti.left, ti.right], cl: [cl.left, cl.right], overlap: hit(ti, total) || hit(cl, total) || hit(ti, cl) };
  });

for (const k of [1, 1.3]) {
  for (const unit of ['kg', 'lb'] as const) {
    test(`readout links stay in the margins with a long ${unit} total at ${k * 100}% text @matrix`, async ({ page }) => {
      test.setTimeout(120_000);
      const errs = watchErrors(page);
      const sheet = await openSheet(page, unit);
      const taps = unit === 'kg' ? [25, 25, 20, 15, 10, 5, 2.5, 1.25] : [45, 45, 35, 25, 10, 5, 2.5];
      for (const w of taps) {
        await sheet.locator(`button[data-weight="${w}"]`).first().tap();
        await page.waitForTimeout(60);
      }
      await expect(sheet.getByTestId('plate-total')).toContainText(unit === 'kg' ? '227.5' : '380');
      if (k !== 1) await scaleText(page, k);
      await page.waitForTimeout(400);
      const c = await readout(page);
      expect(c.ti[0]!).toBeGreaterThanOrEqual(c.card[0]! - 0.5);
      expect(c.cl[1]!).toBeLessThanOrEqual(c.card[1]! + 0.5);
      expect(c.overlap).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      expect(errs).toEqual([]);
    });
  }
}

test('130% text: the plate tray is in view and never under Done @matrix', async ({ page }) => {
  test.setTimeout(120_000);
  const errs = watchErrors(page);
  const sheet = await openSheet(page, 'lb');
  for (const w of [45, 45, 35, 25, 10, 5, 2.5]) {
    await sheet.locator(`button[data-weight="${w}"]`).first().tap();
    await page.waitForTimeout(60);
  }
  await scaleText(page, 1.3);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')!;
    const tray = d.querySelector('[role="group"][aria-label="Plates"]')!;
    const done = [...d.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Done')!;
    const t = tray.getBoundingClientRect();
    const dn = done.getBoundingClientRect();
    // Center and both lower corners of the tray (inset 4 px): each hit lands on the tray itself.
    const pts: Array<[number, number]> = [
      [t.left + t.width / 2, t.top + t.height / 2],
      [t.left + 4, t.bottom - 4],
      [t.right - 4, t.bottom - 4],
    ];
    const hits = pts.map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return !!top && tray.contains(top);
    });
    return { hits, trayBottom: t.bottom, doneTop: dn.top, doneBottom: dn.bottom, vh: innerHeight };
  });
  expect(r.hits).toEqual([true, true, true]);
  expect(r.trayBottom).toBeLessThanOrEqual(r.doneTop);
  expect(r.doneBottom).toBeLessThanOrEqual(r.vh);
  // And one tap on a tray plate still adds it (not swallowed by the bar above it).
  await sheet.getByRole('button', { name: 'Clear', exact: true }).tap();
  await sheet.locator('button[data-weight="45"]').first().tap();
  await expect(sheet.getByTestId('plate-total')).toContainText('135');
  expect(errs).toEqual([]);
});
