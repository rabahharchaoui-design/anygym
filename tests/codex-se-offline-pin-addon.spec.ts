import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// fixtures supplies the existing console/pageerror/unhandled rejection trap, including
// its exact-resource allowance for intentionally offline requests.
async function exposed(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 0.999 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]].every(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return hit !== null && (hit === el || el.contains(hit));
    });
  })).toBe(true);
}

// PLAN 1.6, 1.10e, 1.7h: the existing pin tests stop at selection or a plain pin.
// Keep a fractional add-on distinct from the pin across the entire offline lifecycle.
test('offline SE: fractional pin add-on survives edit, Delete Undo, Finish and reload with exposed lifting controls', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['finger roll', 'Forearm Finger Roll']]);
  const ask = page.getByRole('dialog', { name: 'How do you load this?', exact: true });
  await ask.getByRole('button', { name: /Machine with a pin/ }).tap();
  const view = exerciseView(page, 'forearm-finger-roll');
  await expect(view.getByTestId('set-todo')).toHaveCount(3);
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
    // The third pin is in the initial viewport; no setup scroll is needed.
    await picker.getByRole('radio', { name: 'Pin at 15 lb', exact: true }).tap();
    await exposed(picker.getByRole('button', { name: 'Add weight', exact: true }));
    await picker.getByRole('button', { name: 'Add weight', exact: true }).tap();
    const added = page.getByRole('dialog', { name: 'Add weight', exact: true });
    for (const key of ['2', 'Decimal point', '5']) {
      const button = added.getByRole('button', { name: key, exact: true });
      await exposed(button);
      await button.tap();
    }
    await exposed(added.getByRole('button', { name: 'Done', exact: true }));
    await added.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(added).toHaveCount(0);
    await expect(picker.getByTestId('stack-total')).toHaveText('17.5lb');
    await expect(picker.getByTestId('stack-sub')).toHaveText('15 pin + 2.5 added');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ reps: 8, load: { kind: 'stack', unit: 'lb', total: 17.5, stackValue: 15, added: 2.5 } });
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('stack-total')).toHaveText('17.5lb');
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const expected = [{ ...original!, reps: 9 }];
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('157.5 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('157.5 lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(expected);
  } finally {
    await context.setOffline(false);
  }
});
