import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { bar185, seedFinished, shotOn, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7c report: screenshots (SE and 17 Pro Max) and a short screen recording of the main flow
// (SPEC 23.4): open the list → tap a row → check 2 sets → the rest bar.
const PROFILES = ['iPhone SE', 'iPhone 17 Pro Max'];
test.use({ video: { mode: 'on', size: { width: 440, height: 956 } } });

test('1.7c shots and video: day list, exercise view with 2 sets and rest, picker, finish', async ({ page }) => {
  const project = test.info().project.name;
  test.skip(!PROFILES.includes(project), 'report profiles only');
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await page.waitForTimeout(700);
  await shotOn(page, '1.7c', 'day-list', PROFILES);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await page.waitForTimeout(600);
  await view.getByTestId('check-current').tap();
  await page.waitForTimeout(700);
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(1200);
  await shotOn(page, '1.7c', 'exercise-2-checked-rest', PROFILES);
  await view.getByTestId('weight-cell').first().tap();
  await shotOn(page, '1.7c', 'weight-sheet', PROFILES);
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await shotOn(page, '1.7c', 'finish-screen', PROFILES);
  await page.getByRole('button', { name: 'Done' }).tap();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page.getByRole('dialog', { name: 'Add exercise' })).toBeVisible();
  await shotOn(page, '1.7c', 'exercise-picker', PROFILES);
  expect(errors).toEqual([]);
  const video = page.video();
  await page.close();
  if (video) {
    mkdirSync('reports/videos', { recursive: true });
    copyFileSync(await video.path(), `reports/videos/1.7c-${project.replace(/ /g, '-')}.webm`);
  }
});
