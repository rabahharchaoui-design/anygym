// GOLDEN 2: log sets, finish, and the result shows in History.
import { expect, test } from '../fixtures';
import { bar185, checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished } from '../workout-helpers';

test.describe.configure({ retries: 0 });

test('golden: log three sets, Finish, and the workout is in History', async ({ page }, info) => {
  // PLAN 4.4a: this journey once left the workout for Today on the slow CI runner with no reload and no
  // Finish. Every route change is recorded with its caller and attached when the test fails.
  await page.addInitScript(() => {
    const w = window as unknown as { __navLog: string[] };
    w.__navLog = [];
    const note = (kind: string, url: unknown) => w.__navLog.push(`${Math.round(performance.now())} ${kind} ${String(url)} ${(new Error().stack ?? '').split('\n').slice(2, 7).join(' < ')}`);
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (d, t, u) => (note('push', u), push(d, t, u));
    history.replaceState = (d, t, u) => (note('replace', u), replace(d, t, u));
    addEventListener('hashchange', () => note('hash', location.hash));
  });
  try {
    await journey(page);
  } catch (err) {
    const log = await page.evaluate(() => (window as unknown as { __navLog?: string[] }).__navLog ?? []).catch(() => ['(page gone)']);
    await info.attach('route-log', { body: log.join('\n'), contentType: 'text/plain' });
    console.log(`ROUTE LOG\n${log.join('\n')}`);
    throw err;
  }
});

async function journey(page: import('@playwright/test').Page) {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  for (let n = 1; n <= 3; n++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(n);
  }
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-sets')).toHaveText('3');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);

  await page.getByRole('link', { name: /History/ }).tap();
  // The seeded older workout and the one just finished.
  await expect(page.getByTestId('history-row')).toHaveCount(2);
  await expect(page.getByTestId('history-row').first()).toContainText('3 sets');
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByText('Barbell Incline Bench Press').first()).toBeVisible();
  const sets = await dbAll<{ exerciseId: string; reps?: number; load: { total: number } }>(page, 'sets');
  expect(sets).toHaveLength(4); // the seeded set and the three just logged
  expect(new Set(sets.map((s) => s.exerciseId))).toEqual(new Set(['barbell-incline-bench-press']));
}
