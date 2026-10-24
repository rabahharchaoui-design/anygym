import { expect, test } from './fixtures';
import { bar185, checkCurrent, dbAll, exerciseView, fitsOneScreen, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';

// "Last time" and the targets in the set table from the progression engine (PLAN 1.9, SPEC 6),
// in the 1.7c exercise view.

const shot = async (page: import('./fixtures').Page, name: string) => {
  await page.waitForTimeout(450); // let springs settle
  await page.screenshot({ path: `reports/shots/1.9/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

test('last time and next: rows prefilled from the last workout, one tap to log', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  // Last time every set hit the top of 8 to 12 at 185: today steps up (SPEC 6 rule 2).
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 12, load: bar185 }, { reps: 12, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-guide')).toContainText('Last time 12 × 185 · 12 × 185 lb');
  await expect(view.getByTestId('set-next')).toHaveText('Next 8 to 12 × 190 lb · All sets hit 12. Time to go up');
  await expect(view.getByTestId('weight-cell')).toHaveText(['190', '190', '190']);
  await expect(view.getByTestId('reps-cell')).toHaveText(['8', '8', '8']);
  // Each row shows exactly what that set was last time.
  await expect(view.getByRole('button', { name: /^Last time 12 × 185\. Copy into set 1/ })).toBeVisible();
  for (const id of ['set-guide', 'set-next']) {
    expect((await view.getByTestId(id).boundingBox())!.height).toBeLessThanOrEqual(38);
  }
  await fitsOneScreen(page);
  await shot(page, 'last-time-next');

  // One tap logs the target.
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const set = (await dbAll<{ id: string; reps: number; load: { total: number } }>(page, 'sets')).find((s) => !s.id.startsWith('seed-'))!;
  expect(set).toMatchObject({ reps: 8, load: { total: 190 } });
  // The lines stay put after logging: no layout shift.
  await expect(view.getByTestId('set-guide')).toContainText('Last time 12 × 185 · 12 × 185 lb');
  await expect(view.getByTestId('set-next')).toBeVisible();
  await fitsOneScreen(page);
  await expect(checkCurrent(view)).toBeInViewport({ ratio: 1 });
  await shot(page, 'after-log');
  expect(errors).toEqual([]);
});

test('first time: honest advice and no weight until one is picked; next workout beats the reps', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  let view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-guide')).toHaveText('First time: pick a weight you could lift 2 more reps with');
  await expect(view.getByTestId('set-next')).toHaveCount(0);
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(view.getByTestId('set-guide')).toHaveCount(0);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);

  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-guide')).toHaveText('Last time 8 × 185 · 8 × 185 lb · today');
  // Rule 4: same weight, one more rep on the first set that missed the top.
  await expect(view.getByTestId('weight-cell')).toHaveText(['185', '185', '185']);
  await expect(view.getByTestId('reps-cell')).toHaveText(['9', '8', '8']);
  expect(errors).toEqual([]);
});
