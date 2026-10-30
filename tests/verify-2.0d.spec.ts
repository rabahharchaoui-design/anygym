import { expect, test, type Page } from './fixtures';
import { solvePlates, formatMathLine } from '../src/lib/load';
import { barSpec } from '../src/lib/plates';
import { enabledPlates } from '../src/lib/load';
import { defaultPlateInventory } from '../src/db/gyms';

// Tester audit for PLAN 2.0d: independent of the builder's spec. Rendered fills, chips, no math text.
const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
const FILL: Record<string, Record<number, string>> = {
  kg: { 25: '#D7322C', 20: '#2D63D8', 15: '#EFC12F', 10: '#2E9E4F', 5: '#E8E8EB', 2.5: '#232327', 1.25: '#B4B9C1' },
  lb: { 55: '#D7322C', 45: '#2D63D8', 35: '#EFC12F', 25: '#2E9E4F', 10: '#E8E8EB', 5: '#55585F', 2.5: '#55585F' },
};
const LOADS = { lb: [45, 135, 225, 315, 400, 495, 700], kg: [60, 100, 140, 220] } as const;

const hex = (c: string) => {
  const m = c.match(/\d+/g)!.map(Number);
  return '#' + m.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
};

async function read(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const plates = (s: string) => [...svg.querySelectorAll(`[data-plate][data-side="${s}"]`)];
    const scene = svg.querySelector('[data-scene]')!;
    const tr = scene.getAttribute('transform') ?? '';
    const sc = Number(tr.match(/scale\(([\d.]+)\)/)?.[1] ?? NaN);
    const shaft = svg.querySelector('[data-bar-part="shaft"]')!.getBoundingClientRect();
    const sl = svg.querySelector('[data-bar-part="sleeve"]')!.getBoundingClientRect();
    const r = plates('right');
    const first = (p: Element) => getComputedStyle(p.querySelector('rect')!).fill;
    const chips = [...document.querySelectorAll('[data-testid="plate-chips"] [data-chip]')];
    const dots = chips.map((c) => getComputedStyle(c.querySelector('span')!).backgroundColor);
    // What is seen: the screen reader only math (aria-describedby on the total) is set aside.
    const sr = [...document.querySelectorAll<HTMLElement>('[data-sr-math]')];
    sr.forEach((e) => (e.style.display = 'none'));
    const body = document.body.innerText;
    sr.forEach((e) => (e.style.display = ''));
    const vp = r.map((p) => p.getBoundingClientRect());
    const s = svg.getBoundingClientRect();
    return {
      right: r.map((p) => Number(p.getAttribute('data-weight'))),
      left: plates('left').map((p) => Number(p.getAttribute('data-weight'))),
      fills: r.map(first),
      chipTexts: chips.map((c) => (c.textContent ?? '').trim()),
      chipWeights: chips.map((c) => Number(c.getAttribute('data-weight'))),
      dots,
      line: document.querySelector('[data-testid="plate-chips"]')?.textContent ?? '',
      math: document.querySelector('[data-testid="plate-total"]')!.getAttribute('data-math')!,
      total: document.querySelector('[data-testid="plate-total"]')!.textContent!.replace(/\s/g, ''),
      label: svg.getAttribute('aria-label')!,
      sc,
      ratio: shaft.width / sl.width,
      hasBarPlus: /bar \+/.test(body) || /= /.test(body) || /×\(/.test(body),
      ovf: !!document.querySelector('[data-overflow],[data-testid*="overflow"]'),
      hidden: vp.filter((b) => b.width < 1 || b.right > s.right + 0.5 || b.left < s.left - 0.5).length,
      overlap: vp.slice(1).filter((b, i) => b.left < vp[i]!.right - 1).length,
      text: svg.querySelectorAll('text').length,
      scroll: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

test.describe('2.0d tester audit @matrix', () => {
  test.beforeEach(() => test.skip(!DEVICES.includes(test.info().project.name), 'audit devices'));

  for (const mode of ['default', 'color'] as const) {
    test(`plate audit presets, ${mode} plate mode`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      const dev = test.info().project.name.replace(/ /g, '-');
      await page.goto('./?dev#/settings');
      if (mode === 'color') {
        const sw = page.getByRole('switch', { name: /Colored plates/ });
        await expect(sw).toBeEnabled();
        if ((await sw.getAttribute('aria-checked')) !== 'true') await page.getByText('Colored plates', { exact: true }).tap();
        await page.waitForTimeout(400);
      }
      await page.goto('./?dev#/dev/plates?dev&nohint');
      await page.reload();
      const issues: string[] = [];
      for (const unit of ['lb', 'kg'] as const) {
        await page.getByRole('button', { name: unit, exact: true }).tap();
        let last = Infinity;
        for (const load of LOADS[unit]) {
          await page.getByRole('button', { name: `${load} ${unit}`, exact: true }).tap();
          await page.waitForTimeout(600);
          const a = await read(page);
          const tag = `${mode} ${load}${unit} ${dev}`;
          const inv = enabledPlates(defaultPlateInventory(unit));
          const bar = unit === 'lb' ? 45 : 20;
          const solved = solvePlates(load, { bar, inventory: inv, collars: 'none', unit, sleeveLength: barSpec('olympic', unit).sleeve });
          const want = solved.exact ? solved.perSide : [];
          const note = (ok: boolean, what: string) => ok || issues.push(`${tag}: ${what}`);
          note(JSON.stringify(a.right) === JSON.stringify(want) && JSON.stringify(a.left) === JSON.stringify(want), `plates ${a.right} vs solver ${want}`);
          note(a.math === formatMathLine(bar, want, 'none', unit), `data-math ${a.math}`);
          note(a.total === `${load}${unit}`, `total ${a.total}`);
          // lb gyms default to the colour table too (2.0d follow up).
          const wantFill = want.map((w) => FILL[unit]![w]);
          const gotFill = a.fills.map(hex);
          note(JSON.stringify(gotFill) === JSON.stringify(wantFill), `fills ${gotFill} want ${wantFill}`);
          // chips: descending multiset
          const counts = new Map<number, number>();
          want.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));
          const wantChips = [...counts.entries()].sort((x, y) => y[0] - x[0]).map(([w, n]) => (n > 1 ? `${w} ×${n}` : `${w}`));
          note(JSON.stringify(a.chipTexts) === JSON.stringify(wantChips), `chips ${a.chipTexts} want ${wantChips}`);
          const wantDots = [...counts.keys()].sort((x, y) => y - x).map((w) => FILL[unit]![w]);
          note(JSON.stringify(a.dots.map(hex)) === JSON.stringify(wantDots), `chip dots ${a.dots.map(hex)} want ${wantDots}`);
          note(!/[=+]/.test(a.line), `chips line has = or +: ${a.line}`);
          note(!a.hasBarPlus, 'math text visible on page');
          note(!a.ovf && a.hidden === 0 && a.overlap === 0 && a.text === 0, `ovf ${a.ovf} hidden ${a.hidden} overlap ${a.overlap} text ${a.text}`);
          note(Math.abs(a.ratio / (1310 / 415) - 1) < 0.05, `ratio ${a.ratio}`);
          note(a.sc <= last + 1e-6, `zoom grew ${a.sc} > ${last}`);
          last = a.sc;
          const names = [...want].map(String);
          note(want.every((w) => a.label.includes(String(w))) && a.label.split(',').length + a.label.split(' and ').length - 1 >= want.length, `label ${a.label}`);
          note(!a.scroll, 'sideways scroll');
          if (load === 700 || load === 400 || load === 220) console.log(`${tag} perSide=${JSON.stringify(want)} zoom=${a.sc} fills=${[...new Set(gotFill)]}`);
          await page.screenshot({ path: `reports/shots/2.0d/audit-${mode}-${load}${unit}-${dev}.png` });
          void names;
        }
      }
      console.log('ISSUES', JSON.stringify([...new Set(issues)].slice(0, 12)), issues.length);
      expect(issues).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

import { exerciseView, quickWith } from './workout-helpers';

test.describe('2.0d tester: sheet and hit areas @matrix', () => {
  test('workout weight sheet: parts in view, sleeve hit area, zoom per plate, reduced motion, women bar full', async ({ page }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    const dev = test.info().project.name.replace(/ /g, '-');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const zooms: number[] = [];
    const zoom = () => page.getByTestId('plate-svg').evaluate((e) => Number(e.getAttribute('data-zoom')));
    zooms.push(await zoom());
    for (const w of [45, 45, 45, 35, 25, 10, 5, 2.5]) {
      await sheet.getByRole('button', { name: `Add ${w} lb plate to each side`, exact: true }).tap();
      await page.waitForTimeout(120);
      zooms.push(await zoom());
    }
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!, `zoom ${zooms}`).toBeLessThanOrEqual(zooms[i - 1]! + 1e-6);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `reports/shots/2.0d/audit-sheet-${dev}.png` });
    // Parts in view, none clipped by the viewport.
    const vh = page.viewportSize()!.height;
    for (const [n, loc] of [
      ['Change bar', sheet.getByRole('button', { name: /Change bar|Bar:/ })],
      ['Type it', sheet.getByRole('button', { name: 'Type it' })],
      ['Clear', sheet.getByRole('button', { name: 'Clear' })],
      ['Done', sheet.getByRole('button', { name: 'Done', exact: true })],
      ['chips', page.getByTestId('plate-chips')],
      ['tray', sheet.getByRole('group', { name: 'Plates' })],
    ] as const) {
      const b = await loc.first().boundingBox();
      expect(b, n).not.toBeNull();
      expect(b!.y, n).toBeGreaterThanOrEqual(0);
      expect(b!.y + b!.height, `${n} bottom ${b!.y + b!.height} vh ${vh}`).toBeLessThanOrEqual(vh + 0.5);
    }
    // Tray tiles 48 pt with a stripe.
    const tiles = await sheet.getByRole('group', { name: 'Plates' }).getByRole('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    for (const [w, h] of tiles) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(48); }
    // Hit area: along the sleeve, elementFromPoint lands in the remove target, height >= 44.
    for (const side of ['right', 'left']) {
      const hit = (await page.getByTestId(`remove-${side}`).boundingBox())!;
      expect(hit.height).toBeGreaterThanOrEqual(44);
      expect(hit.width).toBeGreaterThanOrEqual(44);
      const miss = await page.evaluate(({ x, y, w, h, side }) => {
        let bad = 0;
        for (let i = 1; i < 12; i++) {
          for (const yy of [y + h / 2, y + h * 0.3, y + h * 0.7]) {
            const el = document.elementFromPoint(x + (w * i) / 12, yy);
            if (!el?.closest(`[data-testid="remove-${side}"]`)) bad++;
          }
        }
        return bad;
      }, { x: hit.x, y: hit.y, w: hit.width, h: hit.height, side });
      expect(miss, `${side} sleeve hit misses`).toBe(0);
    }
    // Remove by tapping the sleeve: outermost pair goes, one per tap.
    const n0 = await page.locator('[data-plate][data-side="right"]').count();
    const hr = (await page.getByTestId('remove-right').boundingBox())!;
    await page.touchscreen.tap(hr.x + hr.width - 10, hr.y + hr.height / 2);
    await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(n0 - 1);
    await expect(page.locator('[data-plate][data-side="left"]')).toHaveCount(n0 - 1);
    // Reduced motion: still works, no errors.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sheet.getByRole('button', { name: 'Add 5 lb plate to each side', exact: true }).tap();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `reports/shots/2.0d/audit-sheet-reduced-${dev}.png` });
    // Sleeve is full on the women's bar (320 mm sleeve): keep adding 45s until it blocks.
    await sheet.getByRole('button', { name: 'Clear' }).tap();
    const barBtn = sheet.getByRole('button', { name: /^Bar:/ });
    if (await barBtn.count()) {
      await barBtn.tap();
      await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Women's bar/ }).tap();
      await page.waitForTimeout(300);
    }
    let full = false;
    for (let i = 0; i < 12 && !full; i++) {
      await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
      await page.waitForTimeout(80);
      full = (await page.getByRole('status').filter({ hasText: 'Sleeve is full' }).count()) > 0;
    }
    console.log('women bar plates at full', await page.locator('[data-plate][data-side="right"]').count(), 'full', full, dev);
    expect(full).toBe(true);
    await page.screenshot({ path: `reports/shots/2.0d/audit-womens-full-${dev}.png` });
    expect(errors).toEqual([]);
  });
});
