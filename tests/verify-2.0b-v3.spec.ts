import { expect, test, type Page } from './fixtures';

// Tester audit, round 2: the plates the drawing represents vs the math line.
const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
type Case = { unit: 'lb' | 'kg'; name: string; taps: number[] };
const CASES: Case[] = [
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

async function load(page: Page, c: Case) {
  await page.goto(`./?dev#/dev/plates?dev&unit=${c.unit}&nohint`);
  await page.reload();
  await expect(page.getByTestId('plate-math')).toBeVisible();
  for (const w of c.taps) {
    await page.locator(`button[data-weight="${w}"]`).first().dispatchEvent('click');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(700);
}

const read = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const b = (e: Element) => e.getBoundingClientRect();
    const side = (s: string) =>
      [...svg.querySelectorAll(`[data-plate][data-side="${s}"]`)].map((p) => ({
        face: p.querySelector('[data-face]')?.textContent ?? '',
        badge: p.querySelector('[data-badge]')?.textContent ?? '',
        aria: p.getAttribute('aria-label') ?? '',
        more: p.hasAttribute('data-more'),
        lines: (p.getAttribute('data-lines') ?? '').split('|').filter(Boolean),
        weights: (p.getAttribute('data-weights') ?? '').split(',').map(Number),
        w: b(p.querySelector('rect')!).width,
        h: b(p.querySelector('rect')!).height,
        left: b(p.querySelector('rect')!).left,
        right: b(p.querySelector('rect')!).right,
        top: b(p.querySelector('rect')!).top,
        bottom: b(p.querySelector('rect')!).bottom,
        textInside: [...p.querySelectorAll('text')].every((t) => { const tb = b(t), r = b(p.querySelector('rect')!); return tb.left >= r.left - 0.5 && tb.right <= r.right + 0.5 && tb.top >= r.top - 0.5 && tb.bottom <= r.bottom + 0.5; }),
        fs: parseFloat(getComputedStyle(p.querySelector('text')!).fontSize),
      }));
    const shaft = b(svg.querySelector('[data-bar-part="shaft"]')!);
    const sl = [...svg.querySelectorAll('[data-bar-part="sleeve"]')].map(b);
    const card = b(svg.closest('section')!);
    const all = [...svg.querySelectorAll('rect,path,text')].map(b).filter((r) => r.width > 0);
    const sleeveEnd = Math.max(...sl.map((r) => r.right));
    return {
      math: document.querySelector('[data-testid="plate-math"]')?.textContent ?? '',
      total: (document.querySelector('[data-testid="plate-total"]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      right: side('right'), left: side('left'),
      ratio: shaft.width / sl[0]!.width, ratio2: shaft.width / sl[1]!.width, shaftW: shaft.width,
      out: all.filter((r) => r.left < card.left - 0.5 || r.right > card.right + 0.5).length,
      overflowMarker: !!svg.querySelector('[data-testid="sleeve-overflow"]'),
      svgText: [...svg.querySelectorAll('text')].map((t) => t.textContent),
      sleeveEnd, vw: window.innerWidth, scroll: document.documentElement.scrollWidth > window.innerWidth,
      html: svg.closest('section')!.innerText,
      breakdown: document.querySelector('[data-testid="plate-breakdown"]')?.textContent ?? '',
    };
  });

function runToWeights(t: string): number[] {
  const m = t.match(/^(\d+)×(.+)$/);
  return m ? Array(Number(m[1])).fill(Number(m[2])) : [Number(t)];
}
// What the drawing shows for one side, from visible text only: plate faces x group counts,
// marker face lines, and (for "+N") the breakdown line under the bar.
function shown(side: Array<{ face: string; badge: string; more: boolean; lines: string[] }>, breakdown: string): { list: number[]; plusOk: boolean } {
  const out: number[] = [];
  let plusOk = true;
  for (const p of side) {
    if (!p.more) {
      if (/^\d+×/.test(p.face)) out.push(...runToWeights(p.face));
      else out.push(...Array(p.badge ? Number(p.badge.replace('×', '')) : 1).fill(Number(p.face)));
      continue;
    }
    const explicit = p.lines.filter((l) => !l.startsWith('+')).flatMap(runToWeights);
    const plus = p.lines.find((l) => l.startsWith('+'));
    if (!plus) { out.push(...explicit); continue; }
    // "+N": the breakdown names every plate on the marker; it must contain the explicit ones first, then N more.
    const bd = breakdown.replace(/^then\s*/, '').split('·').map((x) => x.trim()).filter(Boolean).flatMap(runToWeights);
    plusOk = bd.length === explicit.length + Number(plus.slice(1)) && JSON.stringify(bd.slice(0, explicit.length)) === JSON.stringify(explicit);
    out.push(...bd);
  }
  return { list: out, plusOk };
}

function mathSide(math: string): number[] {
  const m = math.match(/2 × (.*?) =/);
  if (!m) return [];
  return m[1]!.replace(/[()]/g, '').split('+').map((s) => Number(s.trim()));
}

test.describe('verify 2.0b v3', () => {
  for (const unit of ['lb', 'kg'] as const) {
    test(`plate audit ${unit} @matrix`, async ({ page }) => {
      test.skip(!DEVICES.includes(test.info().project.name));
      test.setTimeout(180_000);
      const errs: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      page.on('pageerror', (e) => errs.push(String(e)));
      const dev = test.info().project.name.replace(/ /g, '-');
      const shafts: number[] = [];
      for (const c of CASES.filter((x) => x.unit === unit)) {
        await load(page, c);
        const a = await read(page);
        shafts.push(a.shaftW);
        await page.screenshot({ path: `reports/shots/2.0b/v3/${c.name}${c.unit}-${dev}.png` });
        const ms = mathSide(a.math).filter((n) => !Number.isNaN(n));
        const fmt = (side: typeof a.right) => side.map((p) => (p.more ? `[${p.lines.join('/')} aria="${p.aria}"]` : `${p.face}${p.badge ? ' ' + p.badge : ''}`)).join(' | ');
        const expectedSorted = [...ms].sort((x, y) => y - x);
        const check = (side: typeof a.right) => {
          const sh = shown(side, a.breakdown);
          const list = [...sh.list].sort((x, y) => y - x);
          return { ok: JSON.stringify(list) === JSON.stringify(expectedSorted) && sh.plusOk, list, hasMore: side.some((p) => p.more), hiddenInternal: [] as number[] };
        };
        const R = check(a.right), L = check(a.left);
        console.log(`AUDIT ${dev} ${c.name}${c.unit} math="${a.math}" total="${a.total}" | R: ${fmt(a.right)} | L: ${fmt(a.left)} | okR=${R.ok} okL=${L.ok} more=${R.hasMore} hiddenInternal=${R.hiddenInternal.join(',')} ratio=${a.ratio.toFixed(3)}/${a.ratio2.toFixed(3)} shaft=${a.shaftW.toFixed(1)} out=${a.out} scroll=${a.scroll} minW=${Math.min(...a.right.map((p) => p.w), 99).toFixed(1)} fs=${a.right.map((p) => p.fs).join(',')} textInside=${a.right.every((p) => p.textInside)} ovf=${a.overflowMarker} bd="${a.breakdown}" shownR=${R.list.join(',')}`);
        expect(JSON.stringify(a.right.map((p) => [p.face, p.badge, p.lines])), 'sides identical').toBe(JSON.stringify(a.left.map((p) => [p.face, p.badge, p.lines])));
        expect(R.ok, `${c.name} right represented == math`).toBe(true);
        expect(L.ok).toBe(true);
        expect(Math.abs(a.ratio / (1310 / 415) - 1)).toBeLessThan(0.05);
        expect(Math.abs(a.ratio2 / (1310 / 415) - 1)).toBeLessThan(0.05);
        expect(a.out).toBe(0);
        expect(a.scroll).toBe(false);
        // plates do not overlap each other
        const rs = [...a.right].sort((x, y) => x.left - y.left);
        for (let i = 1; i < rs.length; i++) expect(rs[i]!.left).toBeGreaterThanOrEqual(rs[i - 1]!.right - 0.6);
      }
      expect(Math.max(...shafts) - Math.min(...shafts)).toBeLessThan(0.5);
      expect(errs).toEqual([]);
    });
  }
});
