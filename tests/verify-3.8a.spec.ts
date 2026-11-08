import { expect, test, type Page } from './fixtures';
import { watchErrors } from './workout-helpers';
import { card, DUMBBELLS, longPress, pastIntake } from './helpers/quick';

const dir = 'reports/shots/3.8a-verify';
const eyebrow = (page: Page) => card(page).locator('p').first();
async function measure(page: Page) {
  return page.evaluate(() => {
    const h = document.querySelector<HTMLElement>('[data-testid="deck-hint"]')!;
    const t = h.querySelector<HTMLElement>('span')!;
    const u = h.querySelector<HTMLElement>('button')!;
    const ub = u.getBoundingClientRect(), hb = h.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return { clipped: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1 || h.scrollWidth > h.clientWidth + 1,
      undoH: ub.height, undoVisible: ub.width > 0 && ub.right <= innerWidth && ub.left >= 0 && ub.bottom <= innerHeight, hintRight: hb.right, vw: innerWidth,
      overlap: ub.left < tb.right - 1 && ub.right > tb.left + 1 && ub.top < tb.bottom - 1 && ub.bottom > tb.top + 1, docScroll: document.documentElement.scrollWidth > innerWidth };
  });
}
for (const scale of [100, 130]) {
  test.describe(`text ${scale}%`, () => {
    test(`never show with a replacement names it @matrix`, async ({ page }) => {
      test.skip(!['iPhone SE', 'iPhone 15'].includes(test.info().project.name));
      const errors = watchErrors(page);
      await pastIntake(page);
      await page.getByTestId('build-card').tap();
      await page.locator('[data-concept]').first().tap();
      await expect(card(page)).toBeVisible();
      if (scale !== 100) await page.evaluate((s) => { document.documentElement.style.fontSize = s + "%"; }, scale);
      const name = (await page.getByTestId('deck-name').textContent())!;
      const id = (await card(page).getAttribute('data-exercise'))!;
      await longPress(page);
      const hint = page.getByTestId('deck-hint');
      await expect(hint).toContainText(`${name} hidden`);
      expect((await hint.textContent())!).not.toContain('No replacement');
      const m = await measure(page);
      expect(m.clipped).toBe(false); expect(m.undoH).toBeGreaterThanOrEqual(48); expect(m.undoVisible).toBe(true); expect(m.overlap).toBe(false); expect(m.docScroll).toBe(false);
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${dir}/replace-${scale}-${test.info().project.name.replace(/ /g, '-')}.png` });
      await page.getByRole('button', { name: 'Undo' }).tap();
      await expect(card(page)).toHaveAttribute('data-exercise', id);
      expect(errors).toEqual([]);
    });
    test(`never show with no replacement shows header minutes @matrix`, async ({ page }) => {
      test.skip(!['iPhone SE', 'iPhone 15'].includes(test.info().project.name));
      const errors = watchErrors(page);
      await pastIntake(page, DUMBBELLS);
      await page.getByTestId('build-card').tap();
      await page.locator('[data-concept="push"]').tap();
      const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
      const NAME = 'Dumbbell Single Arm Overhead Tricep Extension';
      for (let i = 0; i < total; i++) {
        await expect(eyebrow(page)).toContainText(`${i + 1} of`);
        if ((await page.getByTestId('deck-name').textContent()) === NAME) break;
        await page.getByTestId('deck-keep').tap();
      }
      await expect(page.getByTestId('deck-name')).toHaveText(NAME);
      if (scale !== 100) await page.evaluate((s) => { document.documentElement.style.fontSize = s + "%"; }, scale);
      await page.getByTestId("deck-swap").tap();
      await expect(page.getByTestId("swap-label")).toHaveText("No other option here");
      await expect(page.getByTestId("swap-label")).toHaveText("Swap", { timeout: 4000 });
      await page.getByTestId('deck-never').tap();
      const hint = page.getByTestId('deck-hint');
      await expect(hint).toContainText(new RegExp(`^${NAME} hidden\\. No replacement available\\. Workout now ~\\d+ min\\.`));
      const n = Number((await hint.textContent())!.match(/~(\d+) min/)![1]);
      await expect(page.getByTestId('curate-meta')).toContainText(`~${n} min`);
      const m = await measure(page);
      expect(m.clipped).toBe(false); expect(m.undoH).toBeGreaterThanOrEqual(48); expect(m.undoVisible).toBe(true); expect(m.overlap).toBe(false); expect(m.docScroll).toBe(false);
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${dir}/none-${scale}-${test.info().project.name.replace(/ /g, '-')}.png` });
      await page.getByRole('button', { name: 'Undo' }).tap();
      await expect(page.getByTestId('deck-name')).toHaveText(NAME);
      expect(errors).toEqual([]);
    });
  });
}
