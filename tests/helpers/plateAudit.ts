import { expect, type Page } from '../fixtures';

// PLAN 2.0d audit: the drawing has no printed numbers, so the plates are read from data-side /
// data-weight and from the screen reader label, and checked against the exact math kept on the
// total (data-math, the old math line, never shown).

export type AuditCase = { unit: 'lb' | 'kg'; name: string; taps: number[] };

export const AUDIT_CASES: AuditCase[] = [
  { unit: 'lb', name: '45', taps: [] },
  { unit: 'lb', name: '135', taps: [45] },
  { unit: 'lb', name: '225', taps: [45, 45] },
  { unit: 'lb', name: '315', taps: [45, 45, 45] },
  { unit: 'lb', name: '405', taps: [45, 45, 45, 45] },
  { unit: 'lb', name: '205', taps: [45, 25, 10] },
  { unit: 'lb', name: '185', taps: [45, 25] },
  { unit: 'lb', name: 'mixed-many', taps: [45, 45, 35, 25, 10, 5, 2.5] },
  { unit: 'kg', name: '60', taps: [20] },
  { unit: 'kg', name: '100', taps: [25, 15] },
  { unit: 'kg', name: '140', taps: [25, 25, 10] },
  { unit: 'kg', name: '102.5', taps: [25, 15, 1.25] },
  { unit: 'kg', name: 'mixed-many', taps: [25, 25, 20, 15, 10, 5, 2.5, 1.25] },
];

/** One side's plates from the hidden math ("45 bar + 2 × (45 + 25) = 185 lb"). */
export function mathSide(math: string): number[] {
  const m = math.match(/2 × \(([^)]*)\)/) ?? math.match(/2 × ([\d.]+)/);
  if (!m) return [];
  return m[1]!.split('+').map((s) => Number(s.trim()));
}

export async function loadByTaps(page: Page, c: AuditCase) {
  await page.goto(`./?dev#/dev/plates?dev&unit=${c.unit}&nohint`);
  await page.reload();
  await expect(page.getByTestId('plate-total')).toBeVisible();
  for (const w of c.taps) {
    await page.locator(`button[data-weight="${w}"]`).first().dispatchEvent('click');
    await page.waitForTimeout(60);
  }
  await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(c.taps.length);
  await page.waitForTimeout(500);
}

export const readDrawing = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const b = (e: Element) => e.getBoundingClientRect();
    const side = (s: string) => [...svg.querySelectorAll(`[data-plate][data-side="${s}"]`)];
    const shaft = b(svg.querySelector('[data-bar-part="shaft"]')!);
    const sl = [...svg.querySelectorAll('[data-bar-part="sleeve"]')].map(b);
    const s = b(svg);
    const right = side('right');
    return {
      math: document.querySelector('[data-testid="plate-total"]')?.getAttribute('data-math') ?? '',
      total: (document.querySelector('[data-testid="plate-total"]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      right: right.map((p) => Number(p.getAttribute('data-weight'))),
      left: side('left').map((p) => Number(p.getAttribute('data-weight'))),
      label: svg.getAttribute('aria-label') ?? '',
      ratio: shaft.width / sl[0]!.width,
      ratio2: shaft.width / sl[1]!.width,
      // Every plate on screen inside the drawing, none overlapping the next.
      outside: right.map(b).filter((r) => r.left < s.left - 0.5 || r.right > s.right + 0.5).length,
      lefts: right.map((p) => [b(p.querySelector('rect')!).left, b(p.querySelector('rect')!).right]),
      svgText: [...svg.querySelectorAll('text')].length,
      scroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

/** Every case of a unit: drawn plates == the hidden math, both sides, in the aria list, true scale. */
export async function runPlateAudit(page: Page, unit: 'lb' | 'kg', shots: string, dev: string) {
  for (const c of AUDIT_CASES.filter((x) => x.unit === unit)) {
    await loadByTaps(page, c);
    const a = await readDrawing(page);
    await page.screenshot({ path: `${shots}/${c.name}${c.unit}-${dev}.png` });
    const expected = mathSide(a.math).sort((x, y) => y - x);
    expect(a.right, `${c.name} right == math`).toEqual(expected);
    expect(a.left, `${c.name} left == math`).toEqual(expected);
    expect(a.label, c.name).toContain(expected.length ? `: ${expected.length > 1 ? `${expected.slice(0, -1).join(', ')} and ${expected[expected.length - 1]}` : expected[0]} ${unit}` : 'empty');
    expect(a.svgText).toBe(0);
    expect(Math.abs(a.ratio / (1310 / 415) - 1)).toBeLessThan(0.05);
    expect(Math.abs(a.ratio2 / (1310 / 415) - 1)).toBeLessThan(0.05);
    expect(a.outside).toBe(0);
    expect(a.scroll).toBe(false);
    for (let i = 1; i < a.lefts.length; i++) expect(a.lefts[i]![0]!).toBeGreaterThanOrEqual(a.lefts[i - 1]![1]! - 0.6);
  }
}
