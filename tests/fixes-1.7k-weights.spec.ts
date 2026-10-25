import { expect, test, type Locator, type Page } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// PLAN 1.7k (Codex 1025 1348 #7): a kettlebell is typed exactly, never picked from the dumbbell
// range. 53 lb is a real kettlebell; the dumbbell range (5 lb steps) has no 53.

const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);

async function logOne(view: Locator) {
  const before = await loggedRows(view).count();
  await view.page().waitForTimeout(400); // past the double tap guard
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}

test('a 53 lb kettlebell is typed exactly, logged as 53 lb, and the next row keeps 53 (never 55) @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, 'kettlebell-goblet-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  await expect(sheet.getByTestId('picker-title')).toHaveText('One weight · both hands');
  await expect(sheet.getByRole('listbox')).toHaveCount(0);
  await expect(sheet.locator('[data-picture="kettlebell"]')).toBeVisible();
  for (const k of ['5', '3']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await expect(sheet.getByTestId('wheel-total')).toHaveText('53lb');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('53');
  await logOne(view);
  expect((await sets(page))[0]!.load).toEqual({ kind: 'single', unit: 'lb', total: 53 });
  await expect(view.getByTestId('weight-cell').first()).toHaveText('53');
  await page.reload();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('53');
  expect(errors).toEqual([]);
});
