// GOLDEN 1: a brand new phone. The intake, Today, then the first workout with a first set logged.
import { expect, test, type Locator } from '../fixtures';
import { checkCurrent, dbAll, exerciseView, loggedRows } from '../workout-helpers';

test.describe.configure({ retries: 0 });
test.use({ intake: 'fresh' });

test('golden: fresh intake to Today, then the first workout and its first set', async ({ page }) => {
  const tap = (control: Locator) => control.tap();
  const step = (name: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', name);
  const pick = (screen: string, value: string) => tap(page.getByTestId(`q-${screen}-${value}`));
  const next = () => tap(page.getByTestId('intake-cta').locator('button[data-variant="primary"]'));
  const skip = () => tap(page.getByTestId('skip'));

  await page.goto('./');
  await step('goal');
  await pick('goal', 'muscle');
  await next();
  await step('units');
  await tap(page.getByTestId('units-weight').getByRole('radio', { name: 'lb', exact: true }));
  await next();
  await step('focus');
  await pick('focus', 'balance');
  await next();
  await step('experience');
  await pick('experience', '3y');
  await step('days');
  await pick('days', '5');
  await step('weekdays');
  await skip();
  await step('minutes');
  await pick('minutes', '60');
  await step('place');
  await pick('place', 'full');
  await step('equipment');
  await next();
  await step('style');
  await pick('style', 'mix');
  await step('cardio');
  await pick('cardio', 'little');
  await next();
  await step('easyOn');
  await skip();
  await step('exercises');
  await skip();
  await step('about');
  await skip();
  await step('reveal');
  await expect(page.getByTestId('reveal-card')).toContainText('Classic 5 Day Split');
  await tap(page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }));

  // Today, with the plan's first day waiting and nothing started yet.
  await expect(page).toHaveURL(/#\/$/);
  expect(await dbAll(page, 'sessions')).toEqual([]);
  await tap(page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }));
  await expect(page.getByTestId('workout-title')).toBeVisible();

  // The first workout: open the squat, log a set.
  await tap(page.getByTestId('row-barbell-back-squat'));
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await tap(view.getByTestId('weight-cell').first());
  const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
  await tap(picker.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }));
  await expect(picker.getByTestId('plate-total')).toHaveText('95lb');
  await tap(picker.getByRole('button', { name: 'Done', exact: true }));
  await tap(checkCurrent(view));
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  const sets = await dbAll<{ exerciseId: string; reps: number; load: { total: number } }>(page, 'sets');
  expect(sets).toHaveLength(1);
  expect(sets[0]).toMatchObject({ exerciseId: 'barbell-back-squat', reps: 8, load: { total: 95 } });
  expect(await dbAll(page, 'sessions')).toHaveLength(1);
});
