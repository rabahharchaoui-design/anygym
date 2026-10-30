import { expect, test, type Page } from './fixtures';
import { solvePlates } from '../src/lib/load';
import { plateColor } from '../src/lib/plateColors';

// PLAN 2.0d, picture first: colour coded plates with no numbers, every plate drawn, the camera
// zooms out as plates go on, one quiet "Each side" chips line, no math line. Each check load is
// typed with Type it on the dev harness; the drawing is checked against the solver.

const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
const LB_INV = [45, 35, 25, 10, 5, 2.5];
const KG_INV = [25, 20, 15, 10, 5, 2.5, 1.25];
const LOADS: Array<{ unit: 'lb' | 'kg'; load: number }> = [
  ...[45, 135, 225, 315, 400, 495, 700].map((load) => ({ unit: 'lb' as const, load })),
  ...[60, 100, 140, 220].map((load) => ({ unit: 'kg' as const, load })),
];

const perSideFor = (unit: 'lb' | 'kg', load: number): number[] => {
  const r = solvePlates(load, { bar: unit === 'lb' ? 45 : 20, inventory: unit === 'lb' ? LB_INV : KG_INV, collars: 'none', unit });
  if (!r.exact) throw new Error(`${load} ${unit} is not exact`);
  return r.perSide;
};

/** "45 ×2", "10": the chips the line should show. */
const chipsFor = (perSide: number[]) => {
  const out: string[] = [];
  for (const w of [...new Set(perSide)]) {
    const n = perSide.filter((x) => x === w).length;
    out.push(n > 1 ? `${w} ×${n}` : String(w));
  }
  return out;
};

const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''));

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

const openHarness = async (page: Page) => {
  await page.goto('./?dev#/dev/plates');
  await expect(page.getByRole('heading', { level: 1, name: 'Plates' })).toBeVisible();
  // The first time hint would cover the drawing in the screenshots.
  await page.evaluate(() => localStorage.setItem('anygym-hints', JSON.stringify({ plates: true })));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Plates' })).toBeVisible();
};

/** What is drawn, on screen. */
const drawing = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const s = svg.getBoundingClientRect();
    const side = (name: string) => [...svg.querySelectorAll(`[data-plate][data-side="${name}"]`)];
    const right = side('right');
    const boxes = right.map((p) => p.getBoundingClientRect());
    return {
      right: right.map((p) => Number(p.getAttribute('data-weight'))),
      left: side('left').map((p) => Number(p.getAttribute('data-weight'))),
      colors: right.map((p) => p.getAttribute('data-color')),
      zoom: Number(svg.getAttribute('data-zoom')),
      label: svg.getAttribute('aria-label'),
      // Every plate on screen, inside the drawing, and touching the next one.
      inside: boxes.every((b) => b.left >= s.left - 0.5 && b.right <= s.right + 0.5 && b.width > 1),
      gaps: boxes.slice(1).map((b, i) => Math.abs(b.left - boxes[i]!.right)),
      text: [...svg.querySelectorAll('text')].map((t) => t.textContent).join(''),
      // What is seen: the screen reader only math (aria-describedby) is set aside for this read.
      bodyText: (() => {
        const sr = [...document.querySelectorAll<HTMLElement>('[data-sr-math]')];
        sr.forEach((e) => (e.style.display = 'none'));
        const t = document.body.innerText;
        sr.forEach((e) => (e.style.display = ''));
        return t;
      })(),
      described: (() => {
        const total = document.querySelector('[data-testid="plate-total"]')!;
        const el = document.getElementById(total.getAttribute('aria-describedby') ?? '');
        return { text: el?.textContent ?? null, w: el?.getBoundingClientRect().width ?? 0 };
      })(),
      scroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

test.describe('picture first plate diagram @matrix', () => {
  test.beforeEach(() => {
    test.skip(!DEVICES.includes(test.info().project.name), 'SE, Pro Max and the 320 floor');
  });

  test('every check load: every plate drawn in its colour, chips line exact, no math line, the camera zooms out', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    const device = test.info().project.name.replace(/ /g, '-');
    await openHarness(page);
    let unit: 'lb' | 'kg' = 'lb';
    let lastZoom = Infinity;
    const zooms: string[] = [];
    for (const { unit: u, load } of LOADS) {
      if (u !== unit) {
        await page.getByRole('button', { name: u, exact: true }).tap();
        unit = u;
        lastZoom = Infinity;
      }
      const perSide = perSideFor(unit, load);
      const tag = `${load} ${unit} on ${device}`;
      if (perSide.length || load !== 45) await typeIt(page, String(load));
      await expect(page.getByTestId('plate-total')).toHaveText(`${load}${unit}`);
      // The math stays exact underneath, never on screen.
      const math = (await page.getByTestId('plate-total').getAttribute('data-math'))!;
      expect(math, tag).toMatch(new RegExp(`= ${load} ${unit}$`));
      await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(perSide.length);
      await expect(page.locator('[data-plate][data-side="left"]')).toHaveCount(perSide.length);
      await page.waitForTimeout(450); // springs settle
      const d = await drawing(page);
      expect(d.right, tag).toEqual(perSide);
      expect(d.left, tag).toEqual(perSide);
      expect(d.colors, tag).toEqual(perSide.map((w) => plateColor(w, unit)));
      expect(d.inside, tag).toBe(true);
      for (const g of d.gaps) expect(g, `${tag}: plates touch`).toBeLessThan(1);
      // No numbers on the plates, no math line anywhere in the page text.
      expect(d.text, tag).toBe('');
      expect(d.bodyText, tag).not.toContain(math);
      // ...but screen readers still get the exact breakdown, described by the total, never seen.
      expect(d.described.text, tag).toBe(math);
      expect(d.described.w, tag).toBeLessThanOrEqual(1);
      expect(d.bodyText, tag).not.toMatch(/\d bar \+|\+ bar|=\s*\d/);
      expect(d.scroll, tag).toBe(false);
      // The camera only ever zooms out as the weight goes up.
      expect(d.zoom, tag).toBeLessThanOrEqual(lastZoom + 1e-6);
      expect(d.zoom, tag).toBeGreaterThanOrEqual(1);
      lastZoom = d.zoom;
      zooms.push(`${load}${unit}=${d.zoom.toFixed(3)}`);
      // The chips line is the side, grouped, heaviest first, each chip in its plate's colour.
      const chips = page.locator('[data-testid="plate-chips"] [data-chip]');
      await expect(chips).toHaveText(chipsFor(perSide));
      expect(await chips.evaluateAll((els) => els.map((e) => e.getAttribute('data-color')))).toEqual([...new Set(perSide)].map((w) => plateColor(w, unit)));
      await expect(page.getByTestId('plate-chips')).toHaveText(perSide.length ? `Each side${chipsFor(perSide).join('')}` : '');
      // Screen readers still hear every plate on a side (SPEC 0).
      expect(d.label, tag).toBe(perSide.length ? `Barbell. Each side: ${andList(perSide.map(String))} ${unit}` : 'Barbell, empty');
      await page.screenshot({ path: `reports/shots/2.0d/${load}${unit}-${device}.png` });
    }
    test.info().annotations.push({ type: 'zoom', description: zooms.join(' ') });
    // Lighter loads are closer: 45 lb (empty bar) > 135 > 400 > 700 (the whole bar).
    const z = Object.fromEntries(zooms.map((s) => s.split('=')).map(([k, v]) => [k, Number(v)]));
    expect(z['45lb']).toBeGreaterThan(z['135lb']!);
    expect(z['135lb']).toBeGreaterThan(z['400lb']!);
    expect(z['700lb']).toBe(1);
    expect(errors).toEqual([]);
  });

  test('a tap on a sleeve takes the outermost pair off; the hit area is at least 44 pt', async ({ page }) => {
    const errors = watchErrors(page);
    await openHarness(page);
    await typeIt(page, '400');
    await expect(page.getByTestId('plate-total')).toHaveText('400lb');
    for (const side of ['right', 'left'] as const) {
      const box = (await page.getByTestId(`remove-${side}`).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('remove-right').tap();
    await expect(page.getByTestId('plate-total')).toHaveText('395lb');
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(5);
    await expect(page.locator('[data-plate][data-side="left"]')).toHaveCount(5);
    // Anywhere on the side: near the outer edge of the left side too.
    const left = (await page.getByTestId('remove-left').boundingBox())!;
    await page.touchscreen.tap(left.x + 8, left.y + left.height / 2);
    await expect(page.getByTestId('plate-total')).toHaveText('385lb');
    await expect(page.locator('[data-testid="plate-chips"] [data-chip]')).toHaveText(['45 ×3', '35']);
    expect(errors).toEqual([]);
  });
});
