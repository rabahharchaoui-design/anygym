import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// ./fixtures provides the automatic console, pageerror and unhandled rejection trap,
// including the existing resource-specific exception for intentional offline requests.
async function exposed(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 0.999 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.2, 0.2], [0.5, 0.5], [0.8, 0.8]].every(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return hit !== null && (hit === el || el.contains(hit));
    });
  })).toBe(true);
}

// PLAN 3.8's existing first-timer spec stops when the coach first fills the rows.
// Exercise the derived number and its source set through an offline restart and corrections.
test('offline SE: first-timer number survives reload and its source set survives edit, delete Undo and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: 'new' } }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-guide')).toHaveText("Start light: 10 easy reps, then we'll set your number");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await setTableInFirstScreen(page);
    await exposed(view.getByTestId('weight-cell').first());
    await view.getByTestId('weight-cell').first().tap();
    const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await exposed(picker.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }));
    await picker.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }).tap();
    await expect(picker.getByTestId('plate-total')).toHaveAttribute('data-math', '45 bar + 2 × 25 = 95 lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await expect(view.getByTestId('coach-number')).toHaveText('Your number: 105 lb for the rest of your sets');
    await expect(view.getByTestId('set-todo').getByTestId('weight-cell')).toHaveText(['105', '105']);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ kind: 'work', reps: 10, load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } });

    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    await expect(view.getByTestId('set-todo').getByTestId('weight-cell')).toHaveText(['105', '105']);
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await exposed(edit.getByRole('button', { name: 'More reps', exact: true }));
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const corrected = [{ ...original!, reps: 11 }];
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(corrected);
    await loggedRows(view).first().tap();
    await exposed(edit.getByRole('button', { name: 'Delete set', exact: true }));
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    const undo = page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true });
    await exposed(undo);
    await undo.tap();
    await expect(loggedRows(view)).toHaveCount(1);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(corrected);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(corrected);
    // Finish with the corrected test set alone: an unlogged recommendation contributes nothing.
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('1,045 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('1,045 lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(corrected);
  } finally {
    await context.setOffline(false);
  }
});
