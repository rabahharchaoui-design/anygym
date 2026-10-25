import { expect, test, type Locator, type Page } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { bar185, checkCurrent, dbAll, exerciseView, fitsOneScreen, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });

// Check before tapping: Playwright's automatic scroll must not hide a layout failure.
async function exposed(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.15, 0.15], [0.85, 0.15], [0.5, 0.5], [0.15, 0.85], [0.85, 0.85]].every(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return hit !== null && (hit === el || el.contains(hit));
    });
  })).toBe(true);
}

async function offlineReady(page: Page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('SE: five-row workout keeps inline reps controls and current check exposed during rest without scrolling', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(5);
  const firstReps = Number(await view.getByTestId('reps-cell').first().textContent());
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  const secondReps = Number(await view.getByTestId('reps-cell').first().textContent());
  await exposed(view.getByTestId('reps-cell').first());
  await view.getByTestId('reps-cell').first().tap();
  await fitsOneScreen(page);
  for (const control of [
    view.getByRole('button', { name: 'More reps' }),
    view.getByRole('button', { name: 'Fewer reps' }),
    view.getByRole('button', { name: 'Done', exact: true }),
    checkCurrent(view),
    page.getByRole('button', { name: 'Skip', exact: true }),
  ]) await exposed(control);
  expect(await page.getByRole('main').evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await exposed(checkCurrent(view));
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  const active = (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
  expect(active.map((s) => s.reps)).toEqual([firstReps, secondReps + 1]);
  expect(active.map((s) => s.load?.total)).toEqual([185, 185]);
  expect(errors).toEqual([]);
});

test('offline machine edit: plate add/remove retains the old starting resistance while a newer set keeps its own total', async ({ page, context }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['angled', 'Angled Machine Leg Press']]);
  const view = exerciseView(page, 'angled-machine-leg-press');
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await view.getByTestId('weight-cell').first().tap();
  await picker.getByRole('button', { name: 'Set starting weight' }).tap();
  await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'Plates only', exact: true }).tap();
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await view.getByTestId('weight-cell').first().tap();
  await picker.getByRole('button', { name: 'Plates only · Change' }).tap();
  const start = page.getByRole('dialog', { name: 'Starting weight' });
  for (const digit of '50') await start.getByRole('button', { name: digit, exact: true }).tap();
  await start.getByRole('button', { name: 'Save starting weight' }).tap();
  await expect(picker.getByTestId('plate-total')).toHaveText('140lb');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  const original = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
  expect(original.map((s) => s.load?.total)).toEqual([90, 140]);
  await offlineReady(page);
  await expect(loggedRows(view)).toHaveCount(2);
  await context.setOffline(true);
  try {
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set' });
    await expect(edit.getByTestId('plate-total')).toHaveText('90lb');
    await edit.getByRole('button', { name: 'Add 2.5 lb plate to each side' }).tap();
    await expect(edit.getByTestId('plate-total')).toHaveText('95lb');
    await edit.getByRole('button', { name: 'Remove outermost 2.5 lb plate' }).first().tap();
    await expect(edit.getByTestId('plate-total')).toHaveText('90lb');
    await edit.getByRole('button', { name: 'More reps' }).tap();
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(2);
    const saved = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
    expect(saved).toEqual([{ ...original[0], reps: original[0]!.reps! + 1 }, original[1]]);
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    const total = 90 * saved[0]!.reps! + 140 * saved[1]!.reps!;
    await expect(page.getByTestId('finish-total')).toHaveText(`${total.toLocaleString('en-US')} lb`);
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});

test('Finish read failure offers retry and Done, then recovers the exact saved workout after an offline reload', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-sets')).toHaveText('1');
  const before = await dbAll<WorkoutSet>(page, 'sets');
  const activeSet = before.find((s) => !s.id.startsWith('seed-'))!;
  const expectedTotal = `${(185 * activeSet.reps!).toLocaleString('en-US')} lb`;
  await offlineReady(page);
  // Existing test seam fails live reads without corrupting IndexedDB or emitting console errors.
  await page.addInitScript(() => { (window as unknown as { __anygymFailReads: boolean }).__anygymFailReads = true; });
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByTestId('load-error')).toContainText('Could not load this workout');
    const done = page.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeEnabled();
    await exposed(done);
    await page.evaluate(() => { (window as unknown as { __anygymFailReads: boolean }).__anygymFailReads = false; });
    await page.getByRole('button', { name: 'Try again', exact: true }).tap();
    await expect(page.getByTestId('load-error')).toHaveCount(0);
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText(expectedTotal);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(before);
    await done.tap();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});
