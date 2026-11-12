import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// ./fixtures installs the console/pageerror/unhandled rejection trap.
// Check before taps so Playwright cannot scroll hidden lifting controls into view.
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

// SPEC 0/5/13/20; completed PLAN 1.7c/1.7h/2.0c. Existing lifecycle
// specs save every edit: this checks that dismissing one never commits it or
// leaks its local plates/reps into the next opening or into the unlogged rows.
test('offline SE: dismissing a changed edit preserves the lift; a later saved edit survives Delete Undo and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
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
    await picker.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
    await expect(picker.getByTestId('plate-total')).toHaveText('135lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await exposed(checkCurrent(view));
    expect((await checkCurrent(view).boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ reps: 8, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45], collars: 0 } });

    await exposed(loggedRows(view).first());
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await edit.getByRole('button', { name: 'Add 5 lb plate to each side', exact: true }).tap();
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await expect(edit.getByTestId('plate-total')).toHaveText('145lb');
    await exposed(edit.getByRole('button', { name: 'Close', exact: true }));
    await edit.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([original]);
    expect(await dbAll(page, 'journal')).toEqual([]);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([original]);
    await expect(view.getByTestId('weight-cell')).toHaveText(['135', '135']);
    await expect(view.getByTestId('reps-cell')).toHaveText(['8', '8']);

    await loggedRows(view).first().tap();
    await expect(edit.getByTestId('plate-total')).toHaveText('135lb');
    await expect(edit.getByTestId('stepper-reps')).toHaveText('8');
    await edit.getByRole('button', { name: 'Add 2.5 lb plate to each side', exact: true }).tap();
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = [{ ...original!, reps: 9, load: { ...original!.load!, total: 140, perSide: [45, 2.5] } }];
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
    await loggedRows(view).first().tap();
    await exposed(edit.getByRole('button', { name: 'Delete set', exact: true }));
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    const undo = page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true });
    await exposed(undo);
    await undo.tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('1,260 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('1,260 lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
  } finally { await context.setOffline(false); }
});
