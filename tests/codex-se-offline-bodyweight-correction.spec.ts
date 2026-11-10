import { expect, test, type Locator } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// fixtures supplies the existing console/pageerror/unhandled rejection trap.
// Check before tapping, so Playwright cannot hide a layout failure by scrolling.
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

// SPEC 5.2, 13, 20; completed PLAN 1.6, 1.7c, 1.10e, 2.0c.
// Existing bodyweight specs cover the toggle or unweighted logs; this covers
// removing an already logged add-on without changing the next set's draft.
test('offline SE: correcting a weighted pull-up to bodyweight preserves the next weighted set through Delete Undo and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['wide grip pull', 'Wide Grip Pull Up']]);
  const view = exerciseView(page, 'wide-grip-pull-up');
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
    await exposed(picker.getByRole('button', { name: 'Add weight', exact: true }));
    await picker.getByRole('button', { name: 'Add weight', exact: true }).tap();
    const added = page.getByRole('dialog', { name: 'Add weight', exact: true });
    for (const key of ['2', '5']) {
      await exposed(added.getByRole('button', { name: key, exact: true }));
      await added.getByRole('button', { name: key, exact: true }).tap();
    }
    await exposed(added.getByRole('button', { name: 'Done', exact: true }));
    await added.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(added).toHaveCount(0);
    await expect(picker.getByTestId('bodyweight-added')).toHaveText('+ 25 lb added');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await setTableInFirstScreen(page);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const [original] = await dbAll<WorkoutSet>(page, 'sets');
    expect(original).toMatchObject({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 } });

    await exposed(loggedRows(view).first());
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('bodyweight-added')).toHaveText('+ 25 lb added');
    await exposed(edit.getByRole('button', { name: 'Add weight', exact: true }));
    await edit.getByRole('button', { name: 'Add weight', exact: true }).tap();
    await expect(edit.getByTestId('bodyweight-added')).toHaveText('Just you');
    await exposed(edit.getByRole('button', { name: 'Save', exact: true }));
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const [corrected] = await dbAll<WorkoutSet>(page, 'sets');
    // Same identity, order, reps and metadata; only the actual resistance changed.
    expect(corrected).toEqual({ ...original!, load: { kind: 'bodyweight', unit: 'lb', total: 0 } });

    await setTableInFirstScreen(page);
    for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
    await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const expected = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
    expect(expected[0]).toEqual(corrected);
    expect(expected[1]).toMatchObject({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 } });
    expect(expected[1]!.id).not.toBe(corrected!.id);

    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(2);
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(expected);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    // Count added weight only: no invented body mass, no stale 25 lb on set one.
    await expect(page.getByTestId('finish-total')).toHaveText('200 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('200 lb');
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(expected);
    expect((await dbAll<Session>(page, 'sessions'))[0]!.endedAt).toEqual(expect.any(Number));
    expect(await dbAll(page, 'tombstones')).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
