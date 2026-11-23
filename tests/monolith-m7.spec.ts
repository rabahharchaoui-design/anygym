import { expect, test } from './fixtures';
import { usePlan } from './workout-helpers';

test('the workout and its weight sheet have no backdrop blur', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  const blurred = await page.locator('body *').evaluateAll((elements) => elements.filter((el) => {
    const style = getComputedStyle(el);
    const filter = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
    return el.getBoundingClientRect().width > 0 && Boolean(filter) && filter !== 'none';
  }).map((el) => el.tagName + '.' + el.className));
  expect(blurred).toEqual([]);
});
