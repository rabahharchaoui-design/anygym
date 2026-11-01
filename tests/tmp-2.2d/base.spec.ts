import { expect, test } from '../fixtures';
import { navIdle, usePlan } from '../workout-helpers';
test('base @matrix', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.screenshot({ path: `test-results/base-list-${test.info().project.name}.png` });
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(page.getByTestId('exercise-barbell-back-squat')).toBeVisible();
  await page.waitForTimeout(600); await navIdle(page);
  await page.screenshot({ path: `test-results/base-ex-${test.info().project.name}.png`, fullPage: false });
  const info = await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s)?.getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-testid="set-todo"]')].map(e => e.getBoundingClientRect());
    const add = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Add set'))?.getBoundingClientRect();
    return { rows: rows.map(r => [r.top, r.bottom]), add: add && [add.top, add.bottom], muscle: q('[data-testid="muscle-card"]')?.top, vh: innerHeight };
  });
  console.log(test.info().project.name, JSON.stringify(info));
  await page.getByRole('main').evaluate((el) => el.scrollTo(0, 400));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/base-ex2-${test.info().project.name}.png` });
  await page.getByRole('main').evaluate((el) => el.scrollTo(0, 99999));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/base-ex3-${test.info().project.name}.png` });
});
