import { expect, test, type Page } from './fixtures';

const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
const LOADS: Array<[number, 'lb' | 'kg']> = [[45, 'lb'], [135, 'lb'], [225, 'lb'], [315, 'lb'], [405, 'lb'], [60, 'kg'], [100, 'kg'], [140, 'kg']];

const audit = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-testid="plate-svg"]')!;
    const b = (e: Element) => e.getBoundingClientRect();
    const side = (s: string) => [...svg.querySelectorAll(`[data-plate][data-side="${s}"]`)].map((p) => ({ w: p.getAttribute('data-weight'), h: b(p).height, x: b(p).left }));
    // 2.0b fat numbered plates: the numbers live on the plates (data-label), no row under them.
    const labels = [...svg.querySelectorAll('[data-plate][data-side="right"]')].map((l) => l.getAttribute('data-label'));
    const labelsL = [...svg.querySelectorAll('[data-plate][data-side="left"]')].map((l) => l.getAttribute('data-label'));
    const shaft = b(svg.querySelector('[data-bar-part="shaft"]')!);
    const sl = [...svg.querySelectorAll('[data-bar-part="sleeve"]')].map(b);
    const card = b(svg.closest('section')!);
    const out = [...svg.querySelectorAll('rect,path,text')].map(b).filter((r) => r.width > 0 && (r.left < card.left - 0.5 || r.right > card.right + 0.5)).length;
    const onPlateText = [...svg.querySelectorAll('[data-plate] text')].map((t) => t.textContent);
    return {
      math: document.querySelector('[data-testid="plate-math"]')?.textContent,
      total: document.querySelector('[data-testid="plate-total"]')?.textContent?.replace(/\s+/g, ' '),
      right: side('right'), left: side('left'), labels, labelsL, onPlateText,
      ratio: shaft.width / sl[0]!.width, ratio2: shaft.width / sl[1]!.width, shaftW: shaft.width, out,
      plate45h: Math.max(0, ...side('right').filter((p) => p.w === '45' || p.w === '20' || p.w === '25').map((p) => p.h)),
      scroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

test.describe('verify 2.0b', () => {
  test('plate count audit @matrix', async ({ page }) => {
    test.skip(!DEVICES.includes(test.info().project.name));
    test.setTimeout(120_000);
    const errs: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    page.on('pageerror', (e) => errs.push(String(e)));
    const dev = test.info().project.name.replace(/ /g, '-');
    const shafts: number[] = [];
    for (const [load, unit] of LOADS) {
      await page.goto(`./?dev#/dev/plates?dev&unit=${unit}&load=${load}&nohint`);
      await page.reload();
      await expect(page.getByTestId('plate-math')).toBeVisible();
      await page.waitForTimeout(700);
      const a = await audit(page);
      shafts.push(a.shaftW);
      await page.screenshot({ path: `reports/shots/2.0b/v/${load}${unit}-${dev}.png` });
      console.log(`AUDIT ${dev} ${load}${unit} R=${a.right.map((p) => p.w).join(',')} L=${a.left.map((p) => p.w).join(',')} labels=${a.labels.join('|')} labelsL=${a.labelsL.join('|')} onPlate=${a.onPlateText.join(',')} ratio=${a.ratio.toFixed(3)}/${a.ratio2.toFixed(3)} out=${a.out} h=${a.plate45h.toFixed(0)} math="${a.math}" total="${a.total}" scroll=${a.scroll}`);
      expect(Math.abs(a.ratio / (1310 / 415) - 1)).toBeLessThan(0.05);
      expect(a.out).toBe(0);
      expect(a.onPlateText.length).toBeGreaterThanOrEqual(a.right.length);
      expect(await page.locator('[data-under-label]').count()).toBe(0);
    }
    expect(Math.max(...shafts) - Math.min(...shafts)).toBeLessThan(0.5);
    expect(errs).toEqual([]);
  });
});
