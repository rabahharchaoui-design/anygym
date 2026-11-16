// PLAN 3.6j (audit A5): a day kept up next by the 60% rule stays "Day 1 again" after Coach tips →
// Apply all → Use this plan (the plan becomes its coach tuned copy). Today never changes its mind
// without saying why.
import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';
import { seedWorkingSets } from './helpers/planSeed';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, usePlan, watchErrors } from './workout-helpers';

test.describe.configure({ retries: 0 });

async function logOne(page: Page) {
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  if (!(await checkCurrent(view).isEnabled())) {
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
  }
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
}
async function todaySaysDayOneAgain(page: Page, logged: number, planned: number) {
  await expect(page.getByTestId('day-card-title')).toContainText('Next up: Day 1');
  await expect(page.getByTestId('coach-line')).toHaveText(`Coach: Day 1 again. You did ${logged} of ${planned} sets last time, so it stays up next and starts from the top.`);
}

test('A5: Day 1 kept half done stays "Day 1 again" after Apply all and Use this plan', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one phone is enough for these words');
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  // A flexible schedule (the audit's hotel intake): Today picks the day, and the 48 hour rule could move it.
  const [me] = await dbAll<Record<string, unknown>>(page, 'profile');
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, ...me, intake: { scheduleStyle: 'flexible' } }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await logOne(page);
  await seedWorkingSets(page, 4);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const why = (await page.getByTestId('finish-next-why').textContent()) ?? '';
  const [, logged, planned] = /you did (\d+) of (\d+) sets/.exec(why)!.map(Number);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await todaySaysDayOneAgain(page, logged!, planned!);

  await page.goto('./#/plans/five-day-split');
  await page.getByTestId('coach-tips-toggle').tap();
  await page.getByTestId('apply-all').tap();
  await expect(page.getByTestId('tuned-copy')).toBeVisible();
  await page.getByRole('button', { name: 'Use this plan', exact: true }).tap();
  await expect.poll(async () => (await dbAll<{ planId: string }>(page, 'planState'))[0]?.planId).toMatch(/^five-day-split~coach-/);
  await page.goto('./');
  await todaySaysDayOneAgain(page, logged!, planned!);
  expect(errors).toEqual([]);
});
