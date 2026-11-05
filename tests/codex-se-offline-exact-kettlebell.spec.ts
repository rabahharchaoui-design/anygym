import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// The fixtures automatically fail on console errors, page errors and unhandled rejections.
// Check BEFORE taps, so Playwright cannot scroll a hidden control into view for us.
async function exposed(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 0.999 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  })).toBe(true);
}

// Completed PLAN 1.7k: exact single weights never snap to the dumbbell range or
// double as a pair. Existing kettlebell coverage stops at the picker/row.
// CODEX FOUND BUG: Edit set clips the Save button at 375×667 (only 56% visible), violating SPEC 13.4–13.5 primary-action reachability.
test.skip('offline SE: an exact fractional kettlebell survives weight edit, Delete, Undo, Finish and reload', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, 'kettlebell-goblet-squat');
  await expect(view).toBeVisible();
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
    await expect(picker.getByTestId('picker-title')).toHaveText('One weight · both hands');
    for (const key of ['5', '3', 'Decimal point', '5']) {
      const button = picker.getByRole('button', { name: key, exact: true });
      await exposed(button);
      await button.tap();
    }
    await expect(picker.getByTestId('wheel-total')).toHaveText('53.5lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ reps: 8, load: { kind: 'single', unit: 'lb', total: 53.5 } });
    await setTableInFirstScreen(page);
    await exposed(loggedRows(view).first());
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('wheel-total')).toHaveText('53.5lb');
    // Change only the last digit: 53.5 → 53.7, neither a dumbbell tick nor a pair.
    await edit.getByRole('button', { name: 'Delete', exact: true }).tap();
    await edit.getByRole('button', { name: '7', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = { ...original!, load: { kind: 'single', unit: 'lb', total: 53.7 } };
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([expected]);
    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    const undo = page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true });
    await exposed(undo);
    await undo.tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([expected]);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('429.6 lb'); // 53.7 × 8, once.
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('429.6 lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([expected]);
  } finally {
    await context.setOffline(false);
  }
});
