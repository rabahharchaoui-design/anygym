// PLAN 2.2e (SPEC 23.4): the main flow recorded on iPhone SE and iPhone 17 Pro Max for the critic.
// Runs only when asked: RECORD=1 npx playwright test tests/video-2.2e.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"
import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { bar185, checkCurrent, exerciseView, fillReps, loggedRows, navIdle, seedFinished, watchErrors } from './workout-helpers';

test.skip(!process.env.RECORD, 'recording only (RECORD=1)');
test.use({ video: 'on' });

test('2.2e flow: Today, Plans, plan, day list, exercise, a PR set, finish, a tab switch', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
  await page.reload();
  await page.waitForTimeout(800);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Plans' }).tap();
  await page.waitForTimeout(700);
  await page.getByTestId('plan-five-day-split').tap();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForTimeout(1200);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await page.waitForTimeout(900);
  const cell = view.getByTestId('weight-cell').first();
  if ((await cell.innerText()).trim() !== '185') {
    await cell.tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
    await page.waitForTimeout(400);
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await page.waitForTimeout(500);
  }
  await fillReps(view, view.getByTestId('set-todo').first(), 6);
  await page.waitForTimeout(500);
  await checkCurrent(view).tap();
  await expect(loggedRows(view).first().getByTestId('pr-badge')).toBeVisible();
  await page.waitForTimeout(1200);
  await loggedRows(view).first().getByTestId('pr-badge').tap();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible()) await skip.tap();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Finish' }).tap();
  const sure = page.getByRole('button', { name: /^Finish/ }).last();
  if (!/\/done$/.test(page.url())) {
    await page.waitForTimeout(400);
    if (await page.getByRole('dialog').count()) await sure.tap();
  }
  await expect(page).toHaveURL(/\/done$/);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await page.waitForTimeout(1500);
  await navIdle(page);
  await nav.getByRole('link', { name: 'History' }).tap();
  await page.waitForTimeout(900);
  await nav.getByRole('link', { name: 'Plans' }).tap();
  await page.waitForTimeout(900);
  await nav.getByRole('link', { name: 'Today' }).tap();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
  const path = await page.video()!.path();
  await page.close();
  mkdirSync('reports/videos/2.2e', { recursive: true });
  copyFileSync(path, `reports/videos/2.2e/2.2e-${info.project.name.replace(/ /g, '-')}-flow.webm`);
});
