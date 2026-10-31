import { expect, test, type Locator, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';
import { bar185, checkCurrent, dbAll, exerciseView, fitsOneScreen, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// Assert before any action: automatic scrolling during a tap must not conceal a layout defect.
async function exposed(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      const b = p.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(s.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) return false;
    }
    return [[0.15, 0.15], [0.85, 0.15], [0.5, 0.5], [0.15, 0.85], [0.85, 0.85]].every(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return hit !== null && (hit === el || el.contains(hit));
    });
  })).toBe(true);
}

async function readySquat(page: Page) {
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  return exerciseView(page, 'barbell-back-squat');
}

test('SE: fifth current row and its inline reps stay exposed during rest after four logged sets', async ({ page }) => {
  const errors = watchErrors(page);
  try {
    const view = await readySquat(page);
    await view.getByRole('button', { name: '+ Add set', exact: true }).tap();
    await view.getByRole('button', { name: '+ Add set', exact: true }).tap();
    await expect(view.getByTestId('set-todo')).toHaveCount(5);
    for (let i = 0; i < 4; i++) {
      await exposed(checkCurrent(view));
      // Respect the app's rapid repeat tap guard while performing four distinct sets.
      await page.waitForTimeout(400);
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i + 1);
    }
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(checkCurrent(view)).toHaveAccessibleName(/^Log set 5:/);
    await fitsOneScreen(page);
    await exposed(view.getByRole('heading', { name: 'Barbell Back Squat', exact: true }));
    await exposed(view.getByTestId('set-target'));
    await exposed(view.getByTestId('weight-cell').first());
    await exposed(view.getByTestId('reps-cell').first());
    const reps = Number(await view.getByTestId('reps-cell').first().textContent());
    await view.getByTestId('reps-cell').first().tap();
    for (const control of [view.getByRole('button', { name: 'More reps' }),
      view.getByRole('button', { name: 'Fewer reps' }), view.getByRole('button', { name: 'Done', exact: true }),
      checkCurrent(view), page.getByRole('button', { name: 'Skip', exact: true })]) await exposed(control);
    await fitsOneScreen(page);
    expect(await page.getByRole('main').evaluate((el) => el.scrollTop)).toBe(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await view.getByRole('button', { name: 'More reps' }).tap();
    await view.getByRole('button', { name: 'Done', exact: true }).tap();
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect.poll(async () => (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).length).toBe(5);
    const saved = (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
    expect(saved[4]).toMatchObject({ reps: reps + 1, load: { total: 185, unit: 'lb' } });
    expect(new Set(saved.map((s) => s.id)).size).toBe(5);
  } finally {
    expect(errors).toEqual([]);
  }
});

test('offline: Finish Undo after edit and delete Undo permits another log and preserves both sets through a second Finish', async ({ page, context }) => {
  const errors = watchErrors(page);
  try {
    const view = await readySquat(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect(view).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const sessionId = page.url().split('/').at(-2)!;
    const activeSets = async () => (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.sessionId === sessionId).sort((a, b) => a.order - b.order);
    await context.setOffline(true);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const original = (await activeSets())[0]!;
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set' });
    await edit.getByRole('button', { name: 'More reps' }).tap();
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set' }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const edited = { ...original, reps: original.reps! + 1 };
    expect(await activeSets()).toEqual([edited]);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await page.getByRole('button', { name: 'Done', exact: true }).tap();
    await page.getByRole('status').filter({ hasText: 'Workout saved' }).getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}$`));
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(loggedRows(view)).toHaveCount(1);
    // No reload here: it would conceal a queue left closed by the first Finish.
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const both = await activeSets();
    expect(both[0]).toEqual(edited);
    expect(both[1]).toMatchObject({ load: { total: 185, unit: 'lb' } });
    expect(both[1]!.id).not.toBe(edited.id);
    expect(both[1]!.order).toBeGreaterThan(edited.order);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(2);
    expect(await activeSets()).toEqual(both);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    await expect(page.getByTestId('finish-total')).toHaveText(`${(185 * (both[0]!.reps! + both[1]!.reps!)).toLocaleString('en-US')} lb`);
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    expect(await activeSets()).toEqual(both);
    expect((await dbAll<Session>(page, 'sessions')).find((s) => s.id === sessionId)?.endedAt).toEqual(expect.any(Number));
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});
