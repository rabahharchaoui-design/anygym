import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// ./fixtures installs the console/pageerror/unhandled rejection trap.
// Inspect before tapping so actionability cannot scroll a covered control into view.
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

// SPEC 0/5/13/20; completed PLAN 1.7c/2.0c/2.0k. Existing tests change
// Loaded with before logging. Here a plates-only set already exists when
// the user changes to a pin machine: Edit must still use the saved set's input.
test('offline SE: changing a logged machine from plates to pin preserves both load kinds through edit, Undo and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['leg press', 'Leg Press']]);
  const view = exerciseView(page, 'leg-press');
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
    await picker.getByRole('button', { name: /Set starting weight/ }).tap();
    await page.getByRole('dialog', { name: 'Starting weight', exact: true })
      .getByRole('button', { name: 'Plates only', exact: true }).tap();
    await picker.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
    await expect(picker.getByTestId('plate-total')).toHaveText('90lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ reps: 8, load: { kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], collars: 0 } });

    await exposed(view.getByRole('button', { name: 'More for Leg Press', exact: true }));
    await view.getByRole('button', { name: 'More for Leg Press', exact: true }).tap();
    await page.getByRole('dialog', { name: 'Leg Press options', exact: true })
      .getByRole('button', { name: /Loaded with/ }).tap();
    await page.getByRole('dialog', { name: 'How do you load this?', exact: true })
      .getByRole('button', { name: /Machine with a pin/ }).tap();
    await expect(checkCurrent(view)).toBeDisabled(); // Old plates must never become a pin selection.
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([original]);
    await exposed(view.getByTestId('weight-cell').first());
    await view.getByTestId('weight-cell').first().tap();
    await picker.getByRole('radio', { name: 'Pin at 15 lb', exact: true }).tap();
    await expect(picker.getByTestId('stack-total')).toHaveText('15lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const saved = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
    expect(saved[0]).toEqual(original);
    expect(saved[1]).toMatchObject({ reps: 8, load: { kind: 'stack', unit: 'lb', total: 15, stackValue: 15 } });
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));

    await exposed(loggedRows(view).first());
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('plate-total')).toHaveText('90lb');
    await expect(edit.getByTestId('stack-total')).toHaveCount(0);
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = [{ ...original!, reps: 9 }, saved[1]!];
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(expected);
    await loggedRows(view).first().tap();
    await exposed(edit.getByRole('button', { name: 'Delete set', exact: true }));
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const undo = page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true });
    await exposed(undo);
    await undo.tap();
    await expect(loggedRows(view)).toHaveCount(2);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(2);
    await setTableInFirstScreen(page);
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(expected);
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    await expect(page.getByTestId('finish-total')).toHaveText('930 lb'); // 90 × 9 + 15 × 8.
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('930 lb');
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(expected);
  } finally { await context.setOffline(false); }
});
