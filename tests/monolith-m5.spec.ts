import { expect, test } from './fixtures';
import { bar185, checkCurrent, exerciseView, loggedRows, quickWith, seedFinished } from './workout-helpers';

test('workout rows and finish remain usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-title')).toContainText('Workout saved');
  await expect(page.getByTestId('finish-duration')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
});
