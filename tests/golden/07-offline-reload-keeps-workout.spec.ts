// GOLDEN 7: no signal. The app reloads from its own copy and the workout in progress is still there.
import { expect, test } from '../fixtures';
import { bar185, checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished } from '../workout-helpers';

test.describe.configure({ retries: 0 });

test('golden: reload with no connection keeps the active workout and its logged set', async ({ page, context }) => {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  // The app's files are saved on the phone once the service worker controls the page.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(view).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(view).toBeVisible();
    await expect(loggedRows(view)).toHaveCount(1);
    // And it keeps working: another set logs with no signal.
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const sets = await dbAll<{ sessionId: string }>(page, 'sets');
    expect(sets).toHaveLength(3); // the seeded one and two logged
    const open = (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).filter((s) => s.endedAt === undefined);
    expect(open).toHaveLength(1);
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
