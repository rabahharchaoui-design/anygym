import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// ./fixtures supplies the console/pageerror/unhandled rejection trap.
// Check visibility and hit testing BEFORE tapping, so auto-scroll cannot mask a failure.
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

// SPEC 0/13/20, completed PLAN 3.8c. Existing effort tests seed Last time;
// without history there is no set-next anchor to protect the table from scrolling.
test('offline SE: first-time completion keeps every set visible and saves the optional list effort through Finish and reload', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['incline bench', 'Barbell Incline Bench Press']]);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-todo')).toHaveCount(3);
  await expect(view.getByTestId('set-next')).toHaveCount(0);
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
    const plate = picker.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true });
    await exposed(plate);
    await plate.tap();
    await expect(picker.getByTestId('plate-total')).toHaveText('95lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    for (let n = 1; n <= 3; n++) {
      await setTableInFirstScreen(page);
      for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(n);
      if (n < 3) await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
    }
    await expect(page.getByTestId('next-chip')).toBeVisible();
    // EffortChip's delayed scroll runs after 150 ms; inspect while the completion
    // chip is still showing, before the normal return to the day list (~2.5 s).
    await page.waitForTimeout(400);
    // Relaxed (SE): EffortChip may scroll the main area by the few points that reveal the Easy/Good/Hard
    // prompt when the guide stays in view (PLAN 3.8b), so scrollTop is not 0 here; every logged set row must
    // still be fully in the first screen and nothing scrolls sideways.
    for (const row of await loggedRows(view).all()) await expect(row).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('workout-title')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('list-effort')).toHaveCount(1);
    const good = page.getByTestId('list-effort-good');
    await expect(good).toBeEnabled();
    await exposed(good);
    expect((await good.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await good.tap();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    await expect.poll(async () => (await dbAll<{ effort: string }>(page, 'efforts')).map((e) => e.effort)).toEqual(['good']);
    const efforts = await dbAll(page, 'efforts');
    const sets = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
    expect(sets).toHaveLength(3);
    for (const set of sets) expect(set).toMatchObject({ reps: 8, exerciseId: 'barbell-back-squat',
      load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } });
    await page.reload();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    expect(await dbAll(page, 'efforts')).toEqual(efforts);
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('3');
    await expect(page.getByTestId('finish-total')).toHaveText('2,280 lb');
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('3');
    await expect(page.getByTestId('finish-total')).toHaveText('2,280 lb');
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(sets);
    expect(await dbAll(page, 'efforts')).toEqual(efforts);
  } finally {
    await context.setOffline(false);
  }
});
