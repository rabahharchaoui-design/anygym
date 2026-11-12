import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// ./fixtures supplies the existing console/pageerror/unhandled rejection trap.
// Check before taps, so Playwright scrolling cannot hide a lifting-layout failure.
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

// SPEC 0/5.5/13/20; completed PLAN 1.7c/1.7h/2.0c.
// Delete an EARLIER set while a different weight is picked for a later row.
// Neither Undo nor reload may shift that choice into one of the saved sets.
test('offline SE: deleting and restoring an earlier dumbbell set preserves the later draft and counts both hands at Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await seedFinished(page, { 'dumbbell-bench-press': [10, 9, 8].map((reps) => ({
    reps, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 },
  })) });
  await quickWith(page, [['dumbbell bench', 'Dumbbell Bench Press']]);
  const view = exerciseView(page, 'dumbbell-bench-press');
  const ownSets = async () => (await dbAll<WorkoutSet>(page, 'sets'))
    .filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
  const history = (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.id.startsWith('seed-'));
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await setTableInFirstScreen(page);
    // Literal Last time copy bypasses any coach raise and sets known reps/weight.
    const copy = view.getByRole('button', { name: 'Last time 30 × 10. Copy into set 1', exact: true });
    await exposed(copy);
    await copy.tap();
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);

    // Weight cells here belong to the not-yet-logged rows, as in workout.spec.ts.
    await exposed(view.getByTestId('weight-cell').first());
    await view.getByTestId('weight-cell').first().tap();
    const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await picker.getByRole('option', { name: '35 lb', exact: true }).tap();
    await expect(picker.getByTestId('wheel-total')).toHaveText('35lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const saved = await ownSets();
    expect(saved.map((s) => s.load)).toEqual([
      { kind: 'dumbbell_each', unit: 'lb', total: 60 },
      { kind: 'dumbbell_each', unit: 'lb', total: 70 },
    ]);
    await setTableInFirstScreen(page);
    await view.getByTestId('weight-cell').first().tap();
    await picker.getByRole('option', { name: '40 lb', exact: true }).tap();
    await expect(picker.getByTestId('wheel-total')).toHaveText('40lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(view.getByTestId('weight-cell')).toHaveText(['40']);

    await exposed(loggedRows(view).first());
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = [{ ...saved[0]!, reps: 11 }, saved[1]!];
    expect(await ownSets()).toEqual(expected);
    await loggedRows(view).first().tap();
    await exposed(edit.getByRole('button', { name: 'Delete set', exact: true }));
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const undo = page.getByRole('status').filter({ hasText: 'Set deleted' })
      .getByRole('button', { name: 'Undo', exact: true });
    await exposed(undo);
    await undo.tap();
    await expect(loggedRows(view)).toHaveCount(2);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(2);
    await setTableInFirstScreen(page);
    await expect(view.getByTestId('weight-cell')).toHaveText(['40']);
    expect(await ownSets()).toEqual(expected);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    expect((await checkCurrent(view).boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    // 30 in EACH hand × 11 + 35 in EACH hand × saved reps. Unlogged 40s count zero.
    const total = 660 + 70 * saved[1]!.reps!;
    await expect(page.getByTestId('finish-total')).toHaveText(`${total.toLocaleString('en-US')} lb`);
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    await expect(page.getByTestId('finish-total')).toHaveText(`${total.toLocaleString('en-US')} lb`);
    expect(await ownSets()).toEqual(expected);
    expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.id.startsWith('seed-'))).toEqual(history);
  } finally { await context.setOffline(false); }
});
