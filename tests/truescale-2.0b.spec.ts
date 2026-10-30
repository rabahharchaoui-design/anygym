import { expect, test, type Page } from './fixtures';

// PLAN 2.0b, SPEC 5.6 TRUE SCALE: the bar is drawn to real proportions with one scale. Each check
// load is typed with Type it on the dev harness, then the rendered SVG is measured.

const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
const OLYMPIC = 1310 / 415;

// `faces`: the fat numbered plates on one side (a run that does not fit as single plates is one "3×45").
const LOADS: Array<{ unit: 'lb' | 'kg'; load: number; perSide: number[]; faces: string[]; math: string }> = [
  { unit: 'lb', load: 45, perSide: [], faces: [], math: '45 bar = 45 lb' },
  { unit: 'lb', load: 135, perSide: [45], faces: ['45'], math: '45 bar + 2 × 45 = 135 lb' },
  { unit: 'lb', load: 225, perSide: [45, 45], faces: ['45', '45'], math: '45 bar + 2 × (45 + 45) = 225 lb' },
  { unit: 'lb', load: 315, perSide: [45, 45, 45], faces: ['3×45'], math: '45 bar + 2 × (45 + 45 + 45) = 315 lb' },
  { unit: 'lb', load: 405, perSide: [45, 45, 45, 45], faces: ['4×45'], math: '45 bar + 2 × (45 + 45 + 45 + 45) = 405 lb' },
  { unit: 'kg', load: 60, perSide: [20], faces: ['20'], math: '20 bar + 2 × 20 = 60 kg' },
  { unit: 'kg', load: 100, perSide: [25, 15], faces: ['25', '15'], math: '20 bar + 2 × (25 + 15) = 100 kg' },
  { unit: 'kg', load: 140, perSide: [25, 25, 10], faces: ['2×25', '10'], math: '20 bar + 2 × (25 + 25 + 10) = 140 kg' },
];

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const typeIt = async (page: Page, text: string) => {
  await page.getByRole('button', { name: 'Type it' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Type a weight' });
  await expect(sheet).toBeVisible();
  for (const ch of text) await sheet.getByRole('button', { name: ch, exact: true }).tap();
  await expect(sheet.getByTestId('solve-result')).toContainText('Exact');
  await sheet.getByRole('button', { name: 'Load it' }).tap();
  await expect(sheet).toBeHidden();
};

/** Rendered geometry of the drawing, in CSS pixels. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const card = svg.closest('section')!;
    const shaft = box(svg.querySelector('[data-bar-part="shaft"]')!);
    const sleeves = [...svg.querySelectorAll('[data-bar-part="sleeve"]')].map(box);
    const right = [...svg.querySelectorAll('[data-plate][data-side="right"]')];
    const faces = right.map((p) => p.getAttribute('data-label'));
    // Each number sits inside its own plate.
    const faceOutside = right.filter((p) => {
      const pb = box(p.querySelector('rect')!);
      return [...p.querySelectorAll('text')].some((t) => {
        const tb = box(t);
        return tb.left < pb.left - 0.5 || tb.right > pb.right + 0.5 || tb.top < pb.top - 0.5 || tb.bottom > pb.bottom + 0.5;
      });
    }).length;
    const texts = [...svg.querySelectorAll('text')].map((t) => ({ box: box(t), size: parseFloat(getComputedStyle(t).fontSize) }));
    const everything = [...svg.querySelectorAll('rect, path, text')].map(box).filter((b) => b.width > 0);
    const c = box(card);
    return {
      ratio: shaft.width / sleeves[0]!.width,
      sleevesEqual: Math.abs(sleeves[0]!.width - sleeves[1]!.width) < 0.5,
      faces,
      faceOutside,
      withNumber: right.filter((p) => p.querySelector('[data-face]')?.textContent).length,
      underRow: svg.querySelectorAll('[data-under-label]').length,
      covered: right.reduce((n, p) => n + Number(p.getAttribute('data-count')), 0),
      plates: right.length,
      minPlateWidth: Math.min(...right.map((p) => box(p.querySelector('rect')!).width), 99),
      minFont: Math.min(...texts.map((t) => t.size), 99),
      rotated: svg.querySelectorAll('text[transform*="rotate"]').length,
      svgWidth: box(svg).width,
      outside: everything.filter((b) => b.left < c.left - 0.5 || b.right > c.right + 0.5).length,
      pageScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

test.describe('true scale barbell @matrix', () => {
  test.beforeEach(() => {
    test.skip(!DEVICES.includes(test.info().project.name), 'SE, Pro Max and the 320 floor');
  });

  test('every check load: shaft ÷ sleeve within 5% of 1310/415, numbers on fat plates, exact math', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    const device = test.info().project.name.replace(/ /g, '-');
    await page.goto('./?dev#/dev/plates');
    await expect(page.getByRole('heading', { level: 1, name: 'Plates' })).toBeVisible();
    // The first time hint would cover the drawing in the screenshots.
    await page.evaluate(() => localStorage.setItem('anygym-hints', JSON.stringify({ plates: true })));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Plates' })).toBeVisible();

    let unit: 'lb' | 'kg' = 'lb';
    const empty = await measure(page);
    for (const { unit: u, load, perSide, faces, math } of LOADS) {
      if (u !== unit) {
        await page.getByRole('button', { name: u, exact: true }).tap();
        unit = u;
      }
      await typeIt(page, String(load));
      await expect(page.getByTestId('plate-math')).toHaveText(math);
      await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(faces.length);
      await page.waitForTimeout(450); // springs settle
      const m = await measure(page);
      const tag = `${load} ${unit} on ${device}`;
      expect(Math.abs(m.ratio / OLYMPIC - 1), `${tag}: ratio ${m.ratio.toFixed(3)}`).toBeLessThan(0.05);
      expect(m.sleevesEqual, tag).toBe(true);
      expect(m.faces, tag).toEqual(faces);
      expect(m.withNumber, tag).toBe(m.plates);
      expect(m.faceOutside, tag).toBe(0);
      expect(m.underRow, tag).toBe(0);
      expect(m.covered, tag).toBe(perSide.length);
      // Fat enough for the number: 24 px on the 320 floor and up.
      expect(m.minPlateWidth, tag).toBeGreaterThanOrEqual(perSide.length ? 23.5 : 0);
      expect(m.minFont, tag).toBeGreaterThanOrEqual(11);
      expect(m.rotated, tag).toBe(0);
      expect(m.outside, tag).toBe(0);
      expect(m.pageScroll, tag).toBe(false);
      // One scale on this width: the drawing never shrinks or grows with the load.
      if (unit === 'lb') expect(m.svgWidth).toBeCloseTo(empty.svgWidth, 1);
      test.info().annotations.push({ type: 'ratio', description: `${tag}: ${m.ratio.toFixed(3)}` });
      await page.screenshot({ path: `reports/shots/2.0b/${load}${unit}-${device}.png` });
    }
    expect(errors).toEqual([]);
  });

  test('overflow and the women\'s bar keep the shaft; a full sleeve blocks the add', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./?dev#/dev/plates?dev&unit=kg&load=140');
    await expect(page.getByTestId('plate-math')).toHaveText('20 bar + 2 × (25 + 25 + 10) = 140 kg');
    const before = await measure(page);
    // Women's bar: 320 mm sleeves, the shaft is 1310/320 of a sleeve.
    await page.getByRole('button', { name: "Women's bar" }).tap();
    await expect(page.getByTestId('plate-math')).toHaveText('15 bar + 2 × (25 + 25 + 10) = 135 kg');
    const w = await measure(page);
    expect(Math.abs(w.ratio / (1310 / 320) - 1)).toBeLessThan(0.05);
    const shaftWidth = () => page.locator('[data-bar-part="shaft"]').evaluate((e) => e.getBoundingClientRect().width);
    const womensShaft = await shaftWidth();
    // Overflow: six 25s fit an Olympic sleeve (384 mm), not a women's one (320 mm). The plates are
    // drawn up to the sleeve end plus the marker; the shaft never shrinks.
    const add25 = page.getByRole('button', { name: 'Add 25 kg plate to each side' });
    await page.getByRole('button', { name: 'Clear' }).tap();
    await page.getByRole('button', { name: "Women's bar" }).tap();
    for (let i = 0; i < 6; i++) await add25.tap();
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveAttribute('data-label', '6×25');
    await page.getByRole('button', { name: "Women's bar" }).tap();
    await expect(page.getByTestId('sleeve-overflow')).toHaveCount(2);
    const right = page.locator('[data-plate][data-side="right"]');
    // Every plate is still accounted for: "5×25" and "+1" where two fat plates fit, else one "+6".
    await expect.poll(() => right.evaluateAll((els) => els.flatMap((e) => e.getAttribute('data-weights')!.split(',')))).toEqual(Array(6).fill('25'));
    await expect(right.last()).toHaveAttribute('data-more', 'true');
    await expect(page.getByTestId('plate-math')).toHaveText('15 bar + 2 × (25 + 25 + 25 + 25 + 25 + 25) = 315 kg');
    expect(await shaftWidth()).toBeCloseTo(womensShaft, 1);
    await page.waitForTimeout(450);
    await page.screenshot({ path: `reports/shots/2.0b/overflow-womens-${test.info().project.name.replace(/ /g, '-')}.png` });
    // Five 25s fill a women's sleeve exactly; the sixth add is blocked.
    await page.getByRole('button', { name: 'Clear' }).tap();
    for (let i = 0; i < 5; i++) await add25.tap();
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveAttribute('data-label', '5×25');
    await add25.tap();
    await expect(page.getByText('Sleeve is full')).toBeVisible();
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveAttribute('data-label', '5×25');
    await expect(page.getByTestId('sleeve-overflow')).toHaveCount(0);
    expect(before.ratio).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
