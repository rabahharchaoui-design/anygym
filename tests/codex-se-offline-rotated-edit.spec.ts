import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// ./fixtures supplies the existing console/pageerror/unhandled rejection trap.
// Assert before tapping so Playwright cannot auto-scroll a hidden control into view.
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

// SPEC 0/5/13.4/20; built logger, landscape guard and offline persistence.
// Existing rotation checks do not rotate during an unsaved logged-set correction.
test('offline SE: rotating during a weight and reps correction retains the edit through Save, Delete Undo, Finish and reload', async ({ page, context }) => {
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
    for (const size of [45, 25]) {
      const add = picker.getByRole('button', { name: `Add ${size} lb plate to each side`, exact: true });
      await exposed(add);
      await add.tap();
    }
    await expect(picker.getByTestId('plate-total')).toHaveText('185lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ reps: 8, load: { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] } });
    await setTableInFirstScreen(page);
    await exposed(loggedRows(view).first());
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await edit.getByRole('button', { name: 'Add 5 lb plate to each side', exact: true }).tap();
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await expect(edit.getByTestId('plate-total')).toHaveText('195lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([original]);
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(page.getByTestId('landscape-guard')).toBeVisible();
    await expect(page.getByTestId('landscape-guard')).toContainText('Turn your phone upright');
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByTestId('landscape-guard')).toBeHidden();
    await expect(edit).toBeVisible();
    await expect(edit.getByTestId('plate-total')).toHaveText('195lb');
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = [{ ...original!, reps: 9, load: { ...original!.load!, total: 195, perSide: [45, 25, 5] } }];
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
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
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
    await setTableInFirstScreen(page);
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('1,755 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('1,755 lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
  } finally { await context.setOffline(false); }
});
