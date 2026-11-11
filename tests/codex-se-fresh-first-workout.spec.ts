import { expect, test, type Locator } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, setTableInFirstScreen } from './workout-helpers';

test.use({ intake: 'fresh', viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// fixtures supplies the existing console/pageerror/unhandled rejection trap.
// Inspect BEFORE tapping: auto-scrolling must not make a hidden control pass.
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

// SPEC 13.3's uninterrupted fresh-user walkthrough. Existing intake tests stop
// at Start Day 1; established-user logger tests bypass this setup entirely.
test('fresh SE: complete intake, log three exact squat sets offline without scrolling, Finish and reload History', async ({ page, context }) => {
  test.setTimeout(90_000);
  let taps = 0;
  const tap = async (control: Locator) => { taps++; await control.tap(); };
  const step = (name: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', name);
  const pick = (screen: string, value: string) => tap(page.getByTestId(`q-${screen}-${value}`));
  const next = () => tap(page.getByTestId('intake-cta').locator('button[data-variant="primary"]'));
  const skip = () => tap(page.getByTestId('skip'));
  await page.goto('./');
  await step('goal');
  expect(await dbAll(page, 'sets')).toEqual([]);
  await pick('goal', 'muscle');
  await next();
  await step('units');
  await tap(page.getByTestId('units-weight').getByRole('radio', { name: 'lb', exact: true }));
  await next();
  await step('focus');
  await pick('focus', 'balance');
  await next();
  // 3.5u: win, when and bodyweight are hidden until their features exist.
  await step('experience');
  await pick('experience', '3y');
  await step('days');
  await pick('days', '5');
  await step('weekdays');
  await skip();
  await step('minutes');
  await pick('minutes', '60');
  await step('place');
  await pick('place', 'full');
  await step('equipment');
  await next();
  await step('style');
  await pick('style', 'mix');
  await step('cardio');
  await pick('cardio', 'little');
  await next();
  await step('easyOn');
  await skip();
  await step('exercises');
  await skip();
  await step('about');
  await skip();
  await step('reveal');
  await expect(page.getByTestId('reveal-card')).toContainText('Classic 5 Day Split');
  // 3.5u: Looks good lands on Today (no workout starts); Start on the day card begins Day 1.
  await tap(page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }));
  await expect(page).toHaveURL(/#\/$/);
  expect(await dbAll(page, 'sessions')).toEqual([]);
  await tap(page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }));
  expect(taps).toBe(20); // 3.5u: the 18-tap path, explicitly choosing pounds, then Start on Today.
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await tap(page.getByTestId('row-barbell-back-squat'));
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await setTableInFirstScreen(page);
    await exposed(view.getByTestId('weight-cell').first());
    await tap(view.getByTestId('weight-cell').first());
    const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    const plate = picker.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true });
    await exposed(plate);
    await tap(plate);
    await expect(picker.getByTestId('plate-total')).toHaveText('95lb');
    await expect(picker.getByTestId('plate-total')).toHaveAttribute('data-math', '45 bar + 2 × 25 = 95 lb');
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await tap(picker.getByRole('button', { name: 'Done', exact: true }));
    const beforeLogging = taps;
    for (let n = 1; n <= 3; n++) {
      await setTableInFirstScreen(page);
      for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) await exposed(control);
      await tap(checkCurrent(view));
      await expect(loggedRows(view)).toHaveCount(n);
      await expect(page.getByTestId('rest-timer')).toBeVisible();
      await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
    }
    expect(taps - beforeLogging).toBe(3);
    await setTableInFirstScreen(page);
    const saved = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
    expect(saved).toHaveLength(3);
    expect(new Set(saved.map((s) => s.id)).size).toBe(3);
    expect(saved.map((s) => ({ order: s.order, exerciseId: s.exerciseId, kind: s.kind, reps: s.reps, load: s.load })))
      .toEqual([0, 1, 2].map((order) => ({ order, exerciseId: 'barbell-back-squat', kind: 'work', reps: 8,
        load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25], collars: 0, barId: 'olympic' } })));
    await exposed(page.getByRole('button', { name: 'Finish', exact: true }));
    await tap(page.getByRole('button', { name: 'Finish', exact: true }));
    await expect(page.getByTestId('finish-sets')).toHaveText('3');
    await expect(page.getByTestId('finish-total')).toHaveText('2,280 lb');
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText('2,280 lb');
    const sessions = await dbAll<Session>(page, 'sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ planId: 'five-day-split', endedAt: expect.any(Number) });
    await page.goto('./#/history');
    await page.reload();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row')).toContainText('3 sets');
    expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(saved);
    test.info().annotations.push({ type: 'taps', description: `${taps} total; 3 taps for 3 sets` });
  } finally {
    await context.setOffline(false);
  }
});
