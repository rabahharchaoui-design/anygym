import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// fixtures automatically traps console errors, page errors and unhandled rejections.
// Check geometry before tapping, so Playwright cannot hide a defect by scrolling.
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

test('offline SE: a timed set keeps edited seconds through delete Undo, reload and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['plank', 'Elbow Plank']]);
  const view = exerciseView(page, 'elbow-plank');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await setTableInFirstScreen(page);
    await exposed(view.getByRole('button', { name: 'Start timer', exact: true }));
    await view.getByRole('button', { name: 'Start timer', exact: true }).tap();
    await page.waitForTimeout(1500);
    await exposed(view.getByRole('button', { name: 'Stop timer', exact: true }));
    await view.getByRole('button', { name: 'Stop timer', exact: true }).tap();
    await expect(checkCurrent(view)).toBeEnabled();
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original!.seconds).toBeGreaterThan(0);
    expect(original!.reps).toBeUndefined();
    expect(original!.load).toEqual({ kind: 'timed', unit: 'lb', total: 0 });
    await setTableInFirstScreen(page);
    await exposed(loggedRows(view).first());
    await exposed(view.getByRole('button', { name: 'Start timer', exact: true }));
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));

    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('stepper-seconds')).toHaveText(String(original!.seconds));
    await edit.getByRole('button', { name: 'More seconds', exact: true }).tap();
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = { ...original!, seconds: original!.seconds! + 1 };
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([expected]);
    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([expected]);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([expected]);
  } finally {
    await context.setOffline(false);
  }
});
