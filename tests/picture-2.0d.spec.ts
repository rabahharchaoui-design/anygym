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
    const leftBoxes = side('left').map((p) => p.getBoundingClientRect());
    return {
      right: right.map((p) => Number(p.getAttribute('data-weight'))),
      left: side('left').map((p) => Number(p.getAttribute('data-weight'))),
      colors: right.map((p) => p.getAttribute('data-color')),
      zoom: Number(svg.getAttribute('data-zoom')),
      label: svg.getAttribute('aria-label'),
      // Every plate on screen, inside the drawing, and touching the next one.
      inside: [...boxes, ...leftBoxes].every((b) => b.left >= s.left - 0.5 && b.right <= s.right + 0.5 && b.width > 1),
      // Symmetric: the outermost plates are as far from each edge.
      sym: boxes.length ? Math.abs(boxes[boxes.length - 1]!.right - s.left - (s.right - leftBoxes[leftBoxes.length - 1]!.left)) : 0,
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
      expect(d.sym, `${tag}: symmetric`).toBeLessThan(1.5);
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

// ---------------------------------------------------------------- 2.0d critic round

import { quickWith } from './workout-helpers';

const ONE_ROW = ['iPhone SE', 'iPhone 15', '320 floor'];

/** Screen box of a part of the drawing. */
const part = (page: Page, sel: string) => page.locator(`[data-testid="plate-svg"] ${sel}`).first().evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { left: r.left, right: r.right, width: r.width };
});

test.describe('2.0d critic round @matrix', () => {
  test('machine horn: its own camera (empty horn fills most of the width), the start asked up front, "+ start"', async ({ page }) => {
    test.skip(!DEVICES.includes(test.info().project.name), 'SE, Pro Max and the 320 floor');
    const errors = watchErrors(page);
    const device = test.info().project.name.replace(/ /g, '-');
    await quickWith(page, [['leg press', 'Leg Press']]);
    await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    // The first use question is right on top, like the Smith bar; no link under the plates.
    const q = sheet.getByTestId('start-question');
    await expect(q).toBeVisible();
    await expect(q.getByRole('button', { name: 'Plates only', exact: true })).toBeVisible();
    await expect(q.getByRole('button', { name: 'Set starting weight' })).toBeVisible();
    // Empty horn: frame to cap end fills at least 60% of the drawing's width.
    const svg = await part(page, '');
    const frame = await part(page, '[data-bar-part="frame"]');
    const cap = await part(page, '[data-bar-part="cap"]');
    const svgBox = (await page.getByTestId('plate-svg').boundingBox())!;
    // At least 60% of the width (45% on the 320 x 568 floor, where the drawing shrinks while the question is open).
    const short = page.viewportSize()!.height < 600;
    expect((cap.right - frame.left) / svgBox.width, `horn ${frame.left}..${cap.right} of ${svgBox.width}`).toBeGreaterThanOrEqual(short ? 0.45 : 0.6);
    expect(frame.left).toBeGreaterThanOrEqual(svgBox.x - 0.5);
    expect(cap.right).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.5);
    void svg;
    await page.screenshot({ path: `reports/shots/2.0d/critic-horn-empty-${device}.png` });
    // Four 45s: an honest number, never "—": both horns' plates and "+ start".
    // Adding plates never scrolls the sheet (tray and Done fit with the question open).
    const top = () => sheet.evaluate((d) => d.querySelector('[data-scroll="true"] > div')?.parentElement?.scrollTop ?? 0);
    const top0 = await top();
    const tray45 = sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
    for (let i = 0; i < 4; i++) await tray45.dispatchEvent('click');
    expect(await top()).toBe(top0);
    // Both horns' plates, "+ start" under it (answering only takes "+ start" away).
    await expect(sheet.getByTestId('plate-total')).toHaveText('360lb');
    await expect(sheet.getByTestId('plate-total')).toHaveAttribute('aria-label', "360 lb of plates plus the machine's start, total not known yet");
    await expect(sheet.getByTestId('plate-note')).toHaveText('+ start');
    await page.waitForTimeout(450);
    // Every plate inside the drawing; the camera pulled back, never cut a plate.
    const box180 = (await page.getByTestId('plate-svg').boundingBox())!;
    const plates = await page.locator('[data-plate]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right, r.top, r.bottom]));
    expect(plates).toHaveLength(4);
    for (const [l, r, t, b] of plates) {
      expect(l!).toBeGreaterThanOrEqual(box180.x - 0.5);
      expect(r!).toBeLessThanOrEqual(box180.x + box180.width + 0.5);
      expect(t!).toBeGreaterThanOrEqual(box180.y - 0.5);
      expect(b!).toBeLessThanOrEqual(box180.y + box180.height + 0.5);
    }
    await page.screenshot({ path: `reports/shots/2.0d/critic-horn-180-${device}.png` });
    // Answer "Plates only": the question goes, the total is known.
    await q.getByRole('button', { name: 'Plates only', exact: true }).tap();
    await expect(sheet.getByTestId('start-question')).toHaveCount(0);
    await expect(sheet.getByTestId('plate-total')).toHaveText('360lb');
    await expect(sheet.getByTestId('plate-note')).toHaveText('Plates only');
    await expect(sheet.getByRole('button', { name: 'Plates only · Change' })).toBeVisible();
    await page.screenshot({ path: `reports/shots/2.0d/critic-horn-plates-only-${device}.png` });
    expect(errors).toEqual([]);
  });

  test('kg tray: seven plate sizes in one row, at least 40 pt wide and 48 pt tall, no sideways scroll', async ({ page }) => {
    test.skip(!ONE_ROW.includes(test.info().project.name), 'SE, 15 and the 320 floor');
    const errors = watchErrors(page);
    const device = test.info().project.name.replace(/ /g, '-');
    await page.goto('./?dev#/dev/plates?dev&unit=kg&load=140&nohint');
    await expect(page.getByTestId('plate-total')).toHaveText('140kg');
    const tray = page.getByRole('group', { name: 'Plates' });
    const m = await tray.evaluate((t) => ({
      scroll: t.scrollWidth - t.clientWidth,
      page: document.documentElement.scrollWidth - innerWidth,
      tiles: [...t.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { top: Math.round(r.top), w: r.width, h: r.height, left: r.left, right: r.right };
      }),
      vw: innerWidth,
    }));
    expect(m.tiles).toHaveLength(7);
    expect(new Set(m.tiles.map((t) => t.top)).size, 'one row').toBe(1);
    expect(m.scroll, 'tray scrolls sideways').toBeLessThanOrEqual(0);
    expect(m.page, 'page scrolls sideways').toBeLessThanOrEqual(0);
    for (const t of m.tiles) {
      expect(t.w).toBeGreaterThanOrEqual(m.vw <= 340 ? 40 : 44);
      expect(t.h).toBeGreaterThanOrEqual(48);
      expect(t.left).toBeGreaterThanOrEqual(0);
      expect(t.right).toBeLessThanOrEqual(m.vw);
    }
    await page.screenshot({ path: `reports/shots/2.0d/critic-kg-tray-${device}.png` });
    expect(errors).toEqual([]);
  });

  test('small plates read: lb 5 and 2.5 two distinct grays with a light edge, kg 2.5 with a light edge, chip dots ringed', async ({ page }) => {
    test.skip(test.info().project.name !== 'iPhone SE', 'one profile');
    await page.goto('./?dev#/dev/plates?dev&unit=lb&load=400&nohint');
    await expect(page.getByTestId('plate-total')).toHaveText('400lb');
    const fill = (w: number) => page.locator(`[data-plate][data-side="right"][data-weight="${w}"] rect`).first().evaluate((r) => getComputedStyle(r).fill);
    const five = await fill(5);
    const small = await fill(2.5);
    expect(five).not.toBe(small);
    for (const w of [5, 2.5]) await expect(page.locator(`[data-plate][data-side="right"][data-weight="${w}"] [data-edge]`)).toHaveCount(1);
    await expect(page.locator('[data-plate][data-side="right"][data-weight="45"] [data-edge]')).toHaveCount(0);
    // Chip dots wear a hairline ring.
    const rings = await page.locator('[data-testid="plate-chips"] [data-chip] span').evaluateAll((els) => els.map((e) => getComputedStyle(e).boxShadow));
    for (const r of rings) expect(r).toMatch(/0px 0px 0px 1px/);
    // The sleeve hides behind the plates: one hub, on the outermost face only.
    await expect(page.locator('[data-plate][data-side="right"] [data-hub]')).toHaveCount(1);
    await expect(page.locator('[data-plate][data-side="right"]').last().locator('[data-hub]')).toHaveCount(1);
    await page.getByRole('button', { name: 'kg', exact: true }).tap();
    await page.getByRole('button', { name: '102.5 kg', exact: true }).tap();
    await expect(page.locator('[data-plate][data-side="right"][data-weight="2.5"] [data-edge]')).toHaveCount(1);
  });

  test('first time hint: under the bar, gone with a tap, shown once; a machine gets its own words once', async ({ page }) => {
    test.skip(!ONE_ROW.includes(test.info().project.name), 'SE, 15 and the 320 floor');
    const errors = watchErrors(page);
    await page.goto('./?dev#/dev/plates?dev');
    const hint = page.getByTestId('hint');
    await expect(hint).toHaveText('Tap plates to load the bar. Tap a sleeve to take one off.');
    const h = (await hint.boundingBox())!;
    // Just above the tray, never over a tile.
    const tiles = await page.getByRole('group', { name: 'Plates' }).getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(h.y + h.height).toBeLessThanOrEqual(Math.min(...tiles) + 0.5);
    await page.getByRole('heading', { name: 'Plates' }).tap();
    await expect(hint).toHaveCount(0);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('anygym-hints')))!)).toMatchObject({ plates: true });
    await page.reload();
    await expect(page.getByTestId('plate-svg')).toBeVisible();
    await page.waitForTimeout(700);
    await expect(page.getByTestId('hint')).toHaveCount(0);
    // A plate loaded machine: not the bar's words, its own, once.
    await page.goto('./?dev#/dev/loads');
    const machine = page.getByTestId('section-plate-machine');
    // Not while the start question is open.
    await page.waitForTimeout(700);
    await expect(page.locator('[data-hint="machine"]')).toHaveCount(0);
    await machine.getByRole('button', { name: 'Plates only', exact: true }).tap();
    await expect(machine.getByTestId('plate-total')).toHaveText('0lb');
    await expect(page.locator('[data-hint="plates"]')).toHaveCount(0);
    await expect(page.locator('[data-hint="machine"]')).toHaveText('Tap plates to load the machine. Tap the horn to take one off.');
    // The first plate takes it away for good.
    await machine.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
    await expect(page.locator('[data-hint="machine"]')).toHaveCount(0);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('anygym-hints')))!)).toMatchObject({ machine: true });
    expect(errors).toEqual([]);
  });

  test('a sleeve tap answers at once (pressed wash) and a plate slides off outward; reduced motion is read live', async ({ page }) => {
    test.skip(test.info().project.name !== 'iPhone SE', 'one profile');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('./?dev#/dev/plates?dev&unit=lb&load=700&nohint');
    await expect(page.getByTestId('plate-total')).toHaveText('700lb');
    await expect(page.getByTestId('plate-svg')).not.toHaveAttribute('data-reduce', 'true');
    const hit = page.getByTestId('remove-right');
    const box = (await hit.boundingBox())!;
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await page.mouse.down();
    await expect(hit).toHaveAttribute('data-pressed', 'true');
    await page.mouse.up();
    await expect(page.getByTestId('plate-total')).toHaveText('695lb');
    await expect(hit).not.toHaveAttribute('data-pressed', 'true');
    // Taking a plate off never zooms in (no camera jump after a tap at one end).
    await page.getByRole('button', { name: '400 lb', exact: true }).tap();
    await expect(page.getByTestId('plate-total')).toHaveText('400lb');
    const z400 = Number(await page.getByTestId('plate-svg').getAttribute('data-zoom'));
    await page.getByTestId('remove-left').tap();
    await expect(page.getByTestId('plate-total')).toHaveText('395lb');
    expect(Number(await page.getByTestId('plate-svg').getAttribute('data-zoom'))).toBeCloseTo(z400, 6);
    // Live: switch reduced motion on with the sheet open, no reload; a change crossfades the old
    // drawing over the new one (both there for a moment), never through black.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByTestId('plate-svg')).toHaveAttribute('data-reduce', 'true');
    await page.getByRole('button', { name: 'Add 10 lb plate to each side', exact: true }).tap();
    await expect(page.locator('svg[data-ghost]')).toHaveCount(1);
    await expect(page.locator('svg[data-ghost]')).toHaveCount(0);
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(6);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.getByTestId('plate-svg')).not.toHaveAttribute('data-reduce', 'true');
  });

  test('"Sleeve is full": a short message above the tray, the chips stay, gone at once on a removal', async ({ page }) => {
    test.skip(!ONE_ROW.includes(test.info().project.name), 'SE, 15 and the 320 floor');
    await page.goto('./?dev#/dev/plates?dev&unit=lb&load=700&nohint');
    await expect(page.getByTestId('plate-total')).toHaveText('700lb');
    const chips = page.getByTestId('plate-chips');
    const h0 = (await chips.boundingBox())!.height;
    const trayTop = () => page.getByRole('group', { name: 'Plates' }).evaluate((e) => e.getBoundingClientRect().top + scrollY);
    const tray0 = await trayTop();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).dispatchEvent('click');
    const full = page.getByTestId('sleeve-full');
    await expect(full).toHaveText('Sleeve is full');
    await expect(chips).toBeVisible();
    expect(await chips.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    const fBottom = await full.evaluate((e) => e.getBoundingClientRect().bottom + scrollY);
    expect(fBottom).toBeLessThanOrEqual(tray0 + 0.5);
    // One line, nothing moved.
    expect((await chips.boundingBox())!.height).toBe(h0);
    expect(await trayTop()).toBe(tray0);
    expect(await chips.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5)).toBe(true);
    await page.getByTestId('remove-right').dispatchEvent('click');
    await expect(full).toHaveText('');
    // On its own after about 1.5 s.
    const add45 = page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
    await add45.dispatchEvent('click');
    await add45.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    const shown = Date.now();
    await expect(full).toHaveText('', { timeout: 3000 });
    expect(Date.now() - shown).toBeGreaterThan(1000);
    // At once on a successful add, and on Clear.
    await add45.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    await page.getByRole('button', { name: 'Add 2.5 lb plate to each side', exact: true }).dispatchEvent('click');
    await expect(full).toHaveText('');
    await add45.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    await page.getByRole('button', { name: 'Clear', exact: true }).dispatchEvent('click');
    await expect(full).toHaveText('');
  });

  test('Smith "Count plates only": "Plates only" under 0 lb; at 320 the five weights go 3 + 2', async ({ page }) => {
    test.skip(!['iPhone SE', '320 floor'].includes(test.info().project.name), 'SE and the 320 floor');
    const errors = watchErrors(page);
    const device = test.info().project.name.replace(/ /g, '-');
    await quickWith(page, [['smith', 'Smith Machine Upright Row']]);
    await page.locator('[data-testid^="exercise-"]').getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    const q = sheet.getByTestId('bar-question');
    await expect(q).toBeVisible();
    await expect(sheet).toHaveAttribute('data-state', 'open');
    await page.waitForTimeout(300);
    const rows = await q.getByRole('group', { name: 'Bar weight' }).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const counts = [...rows.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<number, number>()).values()];
    expect(counts).toEqual(test.info().project.name === '320 floor' ? [3, 2] : [5]);
    await page.screenshot({ path: `reports/shots/2.0d/critic-smith-question-${device}.png` });
    await q.getByRole('button', { name: 'Count plates only' }).tap();
    await expect(sheet.getByTestId('plate-total')).toHaveText('0lb');
    await expect(sheet.getByTestId('plate-note')).toHaveText('Plates only');
    await page.screenshot({ path: `reports/shots/2.0d/critic-smith-plates-only-${device}.png` });
    expect(errors).toEqual([]);
  });
});

// The import editor (2.0d critic): reps on their own line, the big total, the same small picture
// with the chips line, an editable weight, no "5 × 45" math. Synthetic numbers.
const IMPORT_FILE = JSON.stringify({
  format: 'anygym-import-v1',
  unit: 'lb',
  exercises: [
    {
      name: 'Squats',
      planExercise: 'Barbell Back Squat',
      loadType: 'barbell_per_side',
      sessions: [{ sets: [{ reps: 5, weight: 45, uncertain: true, why: 'Hard to read' }] }],
    },
  ],
});

test.describe('2.0d critic: import editor @matrix', () => {
  for (const gymUnit of ['lb', 'kg'] as const) {
    test(`a barbell set in a ${gymUnit} gym: reps, total and chips, no × math`, async ({ page }) => {
      test.skip(!['iPhone SE', 'iPhone 15', '320 floor'].includes(test.info().project.name), 'SE, 15 and the 320 floor');
      const errors = watchErrors(page);
      const device = test.info().project.name.replace(/ /g, '-');
      await page.goto('./#/settings');
      if (gymUnit === 'kg') {
        await page.getByRole('radio', { name: 'kg', exact: true }).tap();
        await expect(page.getByRole('radio', { name: 'kg', exact: true })).toBeChecked();
      }
      await expect(page.getByTestId('import-history')).toBeVisible();
      await page.getByTestId('import-file').setInputFiles({ name: 'synthetic-squat.json', mimeType: 'application/json', buffer: Buffer.from(IMPORT_FILE) });
      await expect(page).toHaveURL(/#\/settings\/import$/);
      await page.getByTestId('import-set').first().tap();
      const sheet = page.getByRole('dialog', { name: 'Check this set' });
      await expect(sheet).toHaveAttribute('data-state', 'open');
      await expect(sheet.getByTestId('import-file-reps')).toHaveText('In your file: 5 reps · 45 lb per side');
      // What is seen: the screen reader only math (aria-describedby on the total) is set aside.
      const visible = () =>
        sheet.evaluate((d) => {
          const sr = [...d.querySelectorAll<HTMLElement>('[data-sr-math]')];
          sr.forEach((e) => (e.style.display = 'none'));
          const t = (d as HTMLElement).innerText;
          sr.forEach((e) => (e.style.display = ''));
          return t.replace(/\n/g, ' ');
        });
      if (gymUnit === 'lb') {
        // The normal picker: big total, the picture, the chips line, the tray to edit.
        await expect(sheet.getByTestId('plate-total')).toHaveText('135lb');
        await expect(sheet.getByTestId('plate-chips')).toHaveText('Each side45');
        await expect(sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true })).toBeVisible();
      } else {
        // Another unit: kept as in the file, shown the same way, with a way to pick another weight.
        await expect(sheet.getByTestId('import-file-total')).toHaveText('135lb');
        await expect(sheet.getByTestId('bar-picture').getByTestId('plate-chips')).toHaveText('Each side45');
        await expect(sheet.getByTestId('bar-picture').locator('[data-plate]')).toHaveCount(2);
        await expect(sheet.getByRole('button', { name: 'Pick another weight' })).toBeVisible();
      }
      // Reps sit above the drawing; reps and the tray end above the pinned footer.
      const reps = (await sheet.getByRole('group', { name: 'Reps' }).boundingBox())!;
      const pic = (await sheet.locator('[data-testid="plate-svg"]').first().boundingBox())!;
      expect(reps.y).toBeLessThan(pic.y);
      const footerTop = (await sheet.getByRole('button', { name: /^(Save|Looks right)$/ }).boundingBox())!.y;
      expect(reps.y + reps.height).toBeLessThanOrEqual(footerTop);
      if (gymUnit === 'lb') {
        const tray = (await sheet.getByRole('group', { name: 'Plates' }).boundingBox())!;
        expect(tray.y + tray.height, 'tray above Looks right').toBeLessThanOrEqual(footerTop);
      }
      const text = await visible();
      expect(text).not.toMatch(/\d\s*×\s*\d/);
      expect(text).not.toContain('Weight stays');
      // The header band: rounded, the sheet's colour family, pinned on top.
      const band = await sheet.getByTestId('import-context').evaluate((e) => ({ r: getComputedStyle(e).borderTopLeftRadius, pos: getComputedStyle(e).position }));
      expect(parseFloat(band.r)).toBeGreaterThanOrEqual(12);
      expect(band.pos).toBe('sticky');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `reports/shots/2.0d/critic-import-${gymUnit}-${device}.png` });
      if (gymUnit === 'kg') {
        await sheet.getByRole('button', { name: 'Pick another weight' }).tap();
        // The nearest loadable kg to the file's 135 lb (61.2 kg), not an empty 20 kg bar.
        await expect(sheet.getByTestId('plate-total')).toHaveText('60kg');
        await sheet.getByRole('button', { name: 'Add 2.5 kg plate to each side', exact: true }).tap();
        await expect(sheet.getByTestId('plate-total')).toHaveText('65kg');
        await page.screenshot({ path: `reports/shots/2.0d/critic-import-kg-picked-${device}.png` });
      }
      expect(errors).toEqual([]);
    });
  }
});

// 2.0d critic r3: at 320 x 568 nothing in these sheets scrolls (the tray's bottom is never cut).
const bodyFits = (page: Page) =>
  page.evaluate(() => {
    const body = [...document.querySelectorAll<HTMLElement>('[role="dialog"] [class*="scrollBody"]')].pop();
    return body ? { scroll: body.scrollHeight, client: body.clientHeight } : { scroll: 0, client: 0 };
  });

test.describe('2.0d critic r3: 320 x 568 sheets fit @matrix', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== '320 floor', 'the 320 x 568 floor'));

  test('horn (question open and answered), Smith question, barbell: the sheet body never scrolls', async ({ page }) => {
    const errors = watchErrors(page);
    const check = async (tag: string) => {
      await page.waitForTimeout(400);
      const b = await bodyFits(page);
      await page.screenshot({ path: `reports/shots/2.0d/r3-fit-${tag}.png` });
      expect(b.scroll, `${tag}: ${b.scroll} in ${b.client}`).toBeLessThanOrEqual(b.client + 1);
    };
    await quickWith(page, [['leg press', 'Leg Press'], ['smith', 'Smith Machine Upright Row'], ['back squat', 'Barbell Back Squat']]);
    const open = async (id: string) => {
      await page.getByTestId(`exercise-${id}`).getByTestId('weight-cell').first().tap();
      const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
      await expect(sheet).toHaveAttribute('data-state', 'open');
      return sheet;
    };
    const close = async () => {
      await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: 'Pick the weight' })).toHaveCount(0);
    };
    const toRow = async (name: string) => {
      const back = page.getByRole('button', { name: 'Back to the list' });
      if (await back.isVisible()) await back.tap();
      await page.getByText(name, { exact: true }).first().tap();
    };
    await toRow('Leg Press');
    let sheet = await open('leg-press');
    await expect(sheet.getByTestId('start-question')).toBeVisible();
    await check('horn-question');
    for (let i = 0; i < 4; i++) await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).dispatchEvent('click');
    await expect(sheet.getByTestId('plate-total')).toHaveText('360lb');
    await expect(sheet.getByTestId('plate-note')).toHaveText('+ start');
    await expect(sheet.getByTestId('plate-note')).toBeVisible();
    await check('horn-question-plates');
    await sheet.getByTestId('start-question').getByRole('button', { name: 'Plates only', exact: true }).tap();
    // Answering only takes "+ start" away: the number stays.
    await expect(sheet.getByTestId('plate-total')).toHaveText('360lb');
    await check('horn-answered');
    await close();
    await toRow('Smith Machine Upright Row');
    sheet = await open('smith-machine-upright-row');
    await expect(sheet.getByTestId('bar-question')).toBeVisible();
    await check('smith-question');
    await close();
    await toRow('Barbell Back Squat');
    sheet = await open('barbell-back-squat');
    await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).dispatchEvent('click');
    await check('barbell');
    // The bar link says what it does, then which bar.
    await expect(sheet.getByRole('button', { name: 'Change bar, Olympic 45 lb', exact: true })).toBeVisible();
    // 320: the chips keep a short label, on one line.
    const chips = sheet.getByTestId('plate-chips');
    expect(await chips.evaluate((e) => getComputedStyle(e.querySelector('[class*="label"]')!, '::before').content + getComputedStyle(e.querySelector('[class*="label"]')!).fontSize)).toMatch(/Each|px/);
    expect(errors).toEqual([]);
  });

  // Every kind of set the import editor can show (synthetic numbers), in an lb and a kg gym.
  const ALL_KINDS = JSON.stringify({
    format: 'anygym-import-v1',
    unit: 'lb',
    exercises: [
      { name: 'Squats', planExercise: 'Barbell Back Squat', loadType: 'barbell_per_side', sessions: [{ sets: [{ reps: 5, weight: 45 }] }] },
      { name: 'Smith row', planExercise: 'Smith Machine Upright Row', loadType: 'smith_per_side', sessions: [{ sets: [{ reps: 10, weight: 25 }] }] },
      { name: 'Leg press', planExercise: 'Leg Press', loadType: 'plate_machine_per_side', sessions: [{ sets: [{ reps: 10, weight: 90 }] }] },
      { name: 'Curl', planExercise: 'Barbell Bicep Curl', loadType: 'fixed_bar_total', sessions: [{ sets: [{ reps: 8, weight: 85 }] }] },
      { name: 'Pulldown', planExercise: 'Lat Machine Wide Grip Pulldown', loadType: 'stack', sessions: [{ sets: [{ reps: 12, weight: 100 }] }] },
      { name: 'DB press', planExercise: 'Dumbbell Bench Press', loadType: 'dumbbell_each', sessions: [{ sets: [{ reps: 10, weight: 40 }] }] },
      { name: 'Goblets', planExercise: 'Kettlebell Goblet Squat', loadType: 'single_weight', sessions: [{ sets: [{ reps: 10, weight: 53 }] }] },
      { name: 'Pull ups', planExercise: 'Wide Grip Pull Up', loadType: 'bodyweight', sessions: [{ sets: [{ reps: 8, weight: 25 }] }] },
    ],
  });

  for (const unit of ['lb', 'kg'] as const) {
    test(`import editor: the body never scrolls for any kind of set, ${unit} gym`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors = watchErrors(page);
      await page.goto('./#/settings');
      if (unit === 'kg') {
        await page.getByRole('radio', { name: 'kg', exact: true }).tap();
        await expect(page.getByRole('radio', { name: 'kg', exact: true })).toBeChecked();
      }
      await expect(page.getByTestId('import-history')).toBeVisible();
      await page.getByTestId('import-file').setInputFiles({ name: 'synthetic-all.json', mimeType: 'application/json', buffer: Buffer.from(ALL_KINDS) });
      await expect(page).toHaveURL(/#\/settings\/import$/);
      const rows = page.getByTestId('import-set');
      await expect(rows.first()).toBeVisible();
      const n = await rows.count();
      const seen: string[] = [];
      const sheet = page.getByRole('dialog', { name: 'Check this set' });
      const fit = async (tag: string) => {
        await page.waitForTimeout(450);
        const b = await bodyFits(page);
        await page.screenshot({ path: `reports/shots/2.0d/r3-fit-import-${unit}-${seen.length}.png` });
        expect(b.scroll, `${unit} ${tag}: ${b.scroll} in ${b.client}`).toBeLessThanOrEqual(b.client + 1);
      };
      for (let i = 0; i < n; i++) {
        if (await rows.nth(i).isDisabled()) continue;
        await rows.nth(i).tap();
        await expect(sheet).toHaveAttribute('data-state', 'open');
        const line = (await sheet.getByTestId('import-file-reps').innerText()).replace(/\s+/g, ' ');
        // The file line and the reps stepper are always there.
        expect(line).toMatch(/^In your file: \d+ reps?/);
        await expect(sheet.getByRole('group', { name: 'Reps' })).toBeVisible();
        seen.push(line);
        await fit(line);
        // A plate machine: answered too (the question goes, the number stays).
        const q = sheet.getByTestId('start-question');
        if (await q.isVisible()) {
          await q.getByRole('button', { name: 'Plates only', exact: true }).tap();
          await expect(q).toHaveCount(0);
          seen.push(`${line} answered`);
          await fit(`${line} answered`);
        }
        await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
        await expect(sheet).toHaveCount(0);
      }
      console.log(`IMPORT KINDS ${unit}`, JSON.stringify(seen));
      for (const want of ['45 lb per side', '25 lb per side', '90 lb per side', '85 lb total', '100 lb', '40 lb each', '53 lb', 'Bodyweight + 25 lb']) {
        expect(seen.some((l) => l.endsWith(want) || l.includes(`${want} `) || l.includes(want)), `${unit}: ${want} in ${seen}`).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  }
});
