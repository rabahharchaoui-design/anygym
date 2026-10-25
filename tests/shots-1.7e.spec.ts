import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { bar185, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7e report: before and after screenshots of every screen on SE and 17 Pro Max (SPEC 23.4).
// Runs only on demand, so a normal run never overwrites the before set:
//   SHOTS_17E=before npx playwright test tests/shots-1.7e.spec.ts
//   SHOTS_17E=after  npx playwright test tests/shots-1.7e.spec.ts
const PHASE = process.env.SHOTS_17E;
const PROFILES = ['iPhone SE', 'iPhone 17 Pro Max'];

async function shot(page: Page, name: string) {
  const project = test.info().project.name.replace(/ /g, '-');
  const dir = `reports/shots/1.7e/${PHASE}`;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(650); // let springs settle
  await page.screenshot({ path: `${dir}/${name}-${project}.png` });
}

test('1.7e every screen', async ({ page }) => {
  test.skip(!PHASE || !PROFILES.includes(test.info().project.name), 'report run only');
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await shot(page, 'today');

  await page.getByRole('link', { name: 'Plans' }).tap();
  await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
  await shot(page, 'plans');
  await page.getByTestId('plan-five-day-split').tap();
  await expect(page.getByRole('button', { name: 'Go to Today' })).toBeVisible();
  await shot(page, 'plan-viewer');

  await page.getByRole('link', { name: 'Today' }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await shot(page, 'day-list');
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await shot(page, 'exercise-rest');
  await view.getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(weight).toBeVisible();
  await shot(page, 'weight-sheet');
  await weight.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(weight).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, 'finish');
  await page.getByRole('button', { name: 'Done' }).tap();

  await page.getByRole('link', { name: 'History' }).tap();
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  await shot(page, 'history');
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByTestId('history-meta')).toBeVisible();
  await shot(page, 'history-detail');

  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible();
  await shot(page, 'settings');

  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const add = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(add).toBeVisible();
  await shot(page, 'picker');
  await add.getByRole('searchbox', { name: 'Search exercises' }).fill('leg press');
  await add.getByRole('button', { name: 'Leg Press', exact: true }).tap();
  await add.getByRole('button', { name: 'Add 1' }).tap();
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Set starting weight' }).tap();
  await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
  await expect(page.getByRole('dialog', { name: 'Plate loaded machine' })).toBeVisible();
  await shot(page, 'info-sheet');
  expect(errors).toEqual([]);
});
