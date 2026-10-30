import { expect, test } from './fixtures';
import { mathSide, readDrawing } from './helpers/plateAudit';

// 2.0b plate count audit, updated for PLAN 2.0d: every plate drawn (data-weight per side) equals
// the exact math kept on the total, loaded from the dev presets.
const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];
const LOADS: Array<[number, 'lb' | 'kg']> = [[45, 'lb'], [135, 'lb'], [225, 'lb'], [315, 'lb'], [405, 'lb'], [60, 'kg'], [100, 'kg'], [140, 'kg']];

test.describe('verify 2.0b', () => {
  test('plate count audit @matrix', async ({ page }) => {
    test.skip(!DEVICES.includes(test.info().project.name));
    test.setTimeout(120_000);
    const errs: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    page.on('pageerror', (e) => errs.push(String(e)));
    const dev = test.info().project.name.replace(/ /g, '-');
    for (const [load, unit] of LOADS) {
      await page.goto(`./?dev#/dev/plates?dev&unit=${unit}&load=${load}&nohint`);
      await page.reload();
      await expect(page.getByTestId('plate-total')).toHaveText(`${load}${unit}`);
      await page.waitForTimeout(500);
      const a = await readDrawing(page);
      await page.screenshot({ path: `reports/shots/2.0b/v/${load}${unit}-${dev}.png` });
      expect(a.math).toMatch(new RegExp(`= ${load} ${unit}$`));
      expect(a.right).toEqual(mathSide(a.math));
      expect(a.left).toEqual(a.right);
      expect(Math.abs(a.ratio / (1310 / 415) - 1)).toBeLessThan(0.05);
      expect(a.outside).toBe(0);
      expect(a.svgText).toBe(0);
      expect(await page.locator('[data-under-label]').count()).toBe(0);
    }
    expect(errs).toEqual([]);
  });
});
