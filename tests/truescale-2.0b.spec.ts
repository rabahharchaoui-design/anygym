import { expect, test, type Page } from './fixtures';

// PLAN 2.0b, SPEC 5.6 TRUE SCALE: the bar is drawn to real proportions with one scale. Each check
// load is typed with Type it on the dev harness, then the rendered SVG is measured.

const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
const OLYMPIC = 1310 / 415;

// PLAN 2.0d: every plate drawn on its own (no numbers, no grouping); the math stays exact on data-math.
const LOADS: Array<{ unit: 'lb' | 'kg'; load: number; perSide: number[]; math: string }> = [
  { unit: 'lb', load: 45, perSide: [], math: '45 bar = 45 lb' },
  { unit: 'lb', load: 135, perSide: [45], math: '45 bar + 2 × 45 = 135 lb' },
  { unit: 'lb', load: 225, perSide: [45, 45], math: '45 bar + 2 × (45 + 45) = 225 lb' },
  { unit: 'lb', load: 315, perSide: [45, 45, 45], math: '45 bar + 2 × (45 + 45 + 45) = 315 lb' },
  { unit: 'lb', load: 405, perSide: [45, 45, 45, 45], math: '45 bar + 2 × (45 + 45 + 45 + 45) = 405 lb' },
  { unit: 'kg', load: 60, perSide: [20], math: '20 bar + 2 × 20 = 60 kg' },
  { unit: 'kg', load: 100, perSide: [25, 15], math: '20 bar + 2 × (25 + 15) = 100 kg' },
  { unit: 'kg', load: 140, perSide: [25, 25, 10], math: '20 bar + 2 × (25 + 25 + 10) = 140 kg' },
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
    const shaft = box(svg.querySelector('[data-bar-part="shaft"]')!);
    const sleeves = [...svg.querySelectorAll('[data-bar-part="sleeve"]')].map(box);
    const right = [...svg.querySelectorAll('[data-plate][data-side="right"]')];
    const s = box(svg);
    return {
      ratio: shaft.width / sleeves[0]!.width,
      sleevesEqual: Math.abs(sleeves[0]!.width - sleeves[1]!.width) < 0.5,
      weights: right.map((p) => Number(p.getAttribute('data-weight'))),
      texts: svg.querySelectorAll('text').length,
      svgWidth: s.width,
      // Plates on screen stay inside the drawing (the zoom may crop the bare sleeve ends, never a plate).
      outside: right.map(box).filter((b) => b.left < s.left - 0.5 || b.right > s.right + 0.5).length,
      pageScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

test.describe('true scale barbell @matrix', () => {
  test.beforeEach(() => {
    test.skip(!DEVICES.includes(test.info().project.name), 'SE, Pro Max and the 320 floor');
  });

  test('every check load: shaft ÷ sleeve within 5% of 1310/415 at every zoom, every plate drawn, exact math', async ({ page }) => {
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
    for (const { unit: u, load, perSide, math } of LOADS) {
      if (u !== unit) {
        await page.getByRole('button', { name: u, exact: true }).tap();
        unit = u;
      }
      if (perSide.length) await typeIt(page, String(load));
      await expect(page.getByTestId('plate-total')).toHaveAttribute('data-math', math);
      await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(perSide.length);
      await page.waitForTimeout(450); // springs settle
      const m = await measure(page);
      const tag = `${load} ${unit} on ${device}`;
      expect(Math.abs(m.ratio / OLYMPIC - 1), `${tag}: ratio ${m.ratio.toFixed(3)}`).toBeLessThan(0.05);
      expect(m.sleevesEqual, tag).toBe(true);
      expect(m.weights, tag).toEqual(perSide);
      expect(m.texts, tag).toBe(0);
      expect(m.outside, tag).toBe(0);
      expect(m.pageScroll, tag).toBe(false);
      // The drawing keeps its size; only the camera inside it zooms.
      expect(m.svgWidth).toBeCloseTo(empty.svgWidth, 1);
      test.info().annotations.push({ type: 'ratio', description: `${tag}: ${m.ratio.toFixed(3)}` });
      await page.screenshot({ path: `reports/shots/2.0b/${load}${unit}-${device}.png` });
    }
    expect(errors).toEqual([]);
  });

  test("the women's bar keeps its proportions; past its sleeve every plate is still drawn; a full sleeve blocks the add", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./?dev#/dev/plates?dev&unit=kg&load=140');
    await expect(page.getByTestId('plate-total')).toHaveAttribute('data-math', '20 bar + 2 × (25 + 25 + 10) = 140 kg');
    // Women's bar: 320 mm sleeves, the shaft is 1310/320 of a sleeve.
    await page.getByRole('button', { name: "Women's bar" }).tap();
    await expect(page.getByTestId('plate-total')).toHaveAttribute('data-math', '15 bar + 2 × (25 + 25 + 10) = 135 kg');
    await page.waitForTimeout(450);
    const w = await measure(page);
    expect(Math.abs(w.ratio / (1310 / 320) - 1)).toBeLessThan(0.05);
    // Six 25s fit an Olympic sleeve (384 mm), not a women's one (320 mm): switching bars keeps all six drawn.
    const add25 = page.getByRole('button', { name: 'Add 25 kg plate to each side' });
    await page.getByRole('button', { name: 'Clear' }).tap();
    await page.getByRole('button', { name: "Women's bar" }).tap();
    for (let i = 0; i < 6; i++) await add25.tap();
    await page.getByRole('button', { name: "Women's bar" }).tap();
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(6);
    await expect(page.locator('[data-plate][data-side="left"]')).toHaveCount(6);
    await expect(page.getByTestId('plate-total')).toHaveAttribute('data-math', '15 bar + 2 × (25 + 25 + 25 + 25 + 25 + 25) = 315 kg');
    await page.waitForTimeout(450);
    expect((await measure(page)).outside).toBe(0);
    await page.screenshot({ path: `reports/shots/2.0b/overflow-womens-${test.info().project.name.replace(/ /g, '-')}.png` });
    // Five 25s fill a women's sleeve exactly; the sixth add is blocked.
    await page.getByRole('button', { name: 'Clear' }).tap();
    for (let i = 0; i < 5; i++) await add25.tap();
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(5);
    await add25.tap();
    await expect(page.getByText('Sleeve is full')).toBeVisible();
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(5);
    expect(errors).toEqual([]);
  });
});
