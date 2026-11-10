import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { bar185, checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// fixtures supplies the console/pageerror/unhandled rejection trap.
// Inspect before tapping so auto-scroll cannot make a hidden control pass.
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

// SPEC 0/5/6/13/20; completed PLAN 1.7j/2.0c. Last time copy must solve
// the old total on TODAY'S bar, then survive the whole offline lifecycle.
test('offline SE: copying a 185 lb lift onto a 35 lb bar preserves resistance through edit, Delete Undo and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [10, 9, 8].map((reps) => ({ reps, load: bar185 })) });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const currentSets = async () => (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-'));
  const history = (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.id.startsWith('seed-'));
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
    await picker.getByTestId('bar-link').tap();
    const bars = page.getByRole('dialog', { name: 'Which bar?' });
    await bars.getByRole('button', { name: /^Women's bar/ }).tap();
    await expect(bars).toHaveCount(0);
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    const copy = view.getByRole('button', { name: 'Last time 185 × 10. Copy into set 1', exact: true });
    await exposed(copy);
    await copy.tap();
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
    await expect(view.getByTestId('reps-cell').first()).toHaveText('10');
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    expect((await checkCurrent(view).boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
    const [original] = await currentSets();
    expect(original).toMatchObject({ reps: 10, load: { kind: 'barbell', unit: 'lb', total: 185, barWeight: 35, barId: 'womens', collars: 0 } });
    expect(35 + 2 * original!.load!.perSide!.reduce((a, b) => a + b, 0)).toBe(185);
    await exposed(loggedRows(view).first());
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = [{ ...original!, reps: 11 }];
    expect(await currentSets()).toEqual(expected);
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
    expect(await currentSets()).toEqual(expected);
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('2,035 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('2,035 lb');
    expect(await currentSets()).toEqual(expected);
    expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.id.startsWith('seed-'))).toEqual(history);
  } finally {
    await context.setOffline(false);
  }
});
