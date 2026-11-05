import { expect, test, type Locator } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// The fixtures' automatic trap checks console errors and unhandled rejections,
// with the existing exact-resource exception for deliberately offline requests.
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

test('offline SE: removing a whole exercise and Undo preserves both edited sets, order and weights through Finish and reload', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['plank', 'Elbow Plank']]);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  // Row taps decode the thumbnail before navigating; let navigation finish before reload.
  await expect(page).toHaveURL(/#\/workout\/[^/]+\/barbell-back-squat$/);
  await expect(view).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await view.getByTestId('weight-cell').first().tap();
    const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await picker.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const saved = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
    expect(saved.map((s) => s.reps)).toEqual([9, 8]);
    expect(saved.map((s) => s.load)).toMatchObject([
      { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] },
      { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] },
    ]);
    // Test before interacting: taps must not auto-scroll hidden lifting controls into view.
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));

    await view.getByRole('button', { name: 'More for Barbell Back Squat', exact: true }).tap();
    await page.getByRole('dialog', { name: 'Barbell Back Squat options', exact: true }).getByRole('button', { name: /^Remove/ }).tap();
    await expect(page.getByTestId('row-barbell-back-squat')).toHaveCount(0);
    await expect.poll(async () => (await dbAll(page, 'sets')).length).toBe(0);
    const undo = page.getByRole('status').filter({ hasText: 'Removed · Barbell Back Squat' }).getByRole('button', { name: 'Undo', exact: true });
    await exposed(undo);
    await undo.tap();
    await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
    // Finish immediately; it must wait for the entire group restore, not save a partial group.
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    await expect(page.getByTestId('finish-total')).toHaveText('2,295 lb');
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(saved);
    const [session] = await dbAll<Session>(page, 'sessions');
    expect(session!.exerciseIds).toEqual(['barbell-back-squat', 'elbow-plank']);
    expect(session!.endedAt).toEqual(expect.any(Number));
    expect(await dbAll(page, 'tombstones')).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
