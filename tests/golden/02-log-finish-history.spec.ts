// GOLDEN 2: log sets, finish, and the result shows in History.
import { expect, test } from '../fixtures';
import { bar185, checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished } from '../workout-helpers';

test.describe.configure({ retries: 0 });

test('golden: log three sets, Finish, and the workout is in History', async ({ page }) => {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  for (let n = 1; n <= 3; n++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(n);
  }
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-sets')).toHaveText('3');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);

  await page.getByRole('link', { name: /History/ }).tap();
  // The seeded older workout and the one just finished.
  await expect(page.getByTestId('history-row')).toHaveCount(2);
  await expect(page.getByTestId('history-row').first()).toContainText('3 sets');
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByText('Barbell Incline Bench Press').first()).toBeVisible();
  const sets = await dbAll<{ exerciseId: string; reps?: number; load: { total: number } }>(page, 'sets');
  expect(sets).toHaveLength(4); // the seeded set and the three just logged
  expect(new Set(sets.map((s) => s.exerciseId))).toEqual(new Set(['barbell-incline-bench-press']));
});
