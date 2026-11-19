import { expect, test, type Page } from './fixtures';
import { holdFor, move, runRow, startRun, wake } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { dbAll, dbPut, seedFinished, watchErrors } from './workout-helpers';

// PLAN 4.6a: review fixes for 4.6 and 4.4b that show on screen. Each test failed before its fix.

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

const DAY = 86_400_000;

/** Opens the app once (it makes its database), then writes the runs. */
async function seedRuns(page: Page, runs: unknown[]) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  await dbPut(page, { runs });
}

/**
 * TEST ONLY: while `window.__failRunsRead` is true, every read only transaction on the runs store
 * fails (writes still land), so a runs read can fail while the workouts read works.
 */
function failRunsReads() {
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: string | string[], mode?: IDBTransactionMode, opts?: IDBTransactionOptions) {
    const names = typeof stores === 'string' ? [stores] : [...stores];
    if ((window as unknown as { __failRunsRead?: boolean }).__failRunsRead && names.includes('runs') && mode !== 'readwrite') throw new DOMException('runs read failed', 'UnknownError');
    return original.call(this, stores, mode, opts);
  } as typeof IDBDatabase.prototype.transaction;
}
const setFailRuns = (page: Page, on: boolean) => page.evaluate((v) => ((window as unknown as { __failRunsRead?: boolean }).__failRunsRead = v), on);

test.describe('4.6a review fixes on screen', () => {
  test('(1) a kept run under 50 m says it was too short, not that there was no GPS', async ({ page }) => {
    const errors = watchErrors(page);
    await seedRuns(page, [runRow('short-run', 30, Date.now() - DAY)]);
    await page.goto('./#/history/run/short-run');
    const plain = page.getByTestId('run-detail-plain');
    await expect(plain).toHaveText('Under 50 m was recorded. That is too little for an honest distance or pace.');
    await expect(plain).not.toContainText('no GPS');
    expect(errors).toEqual([]);
  });

  test('(2) History: a failed runs read says so with Try again, never a list without runs', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(failRunsReads);
    await seedRuns(page, [runRow('kept-run', 2000, Date.now() - DAY)]);
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } }] });
    await setFailRuns(page, true);
    await page.getByRole('link', { name: 'History' }).tap();
    const error = page.getByTestId('load-error');
    await expect(error).toHaveText('Could not load runsTry again');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByText('No workouts yet')).toHaveCount(0);
    await setFailRuns(page, false);
    await error.getByRole('button', { name: 'Try again' }).tap();
    await expect(error).toHaveCount(0);
    await expect(page.getByTestId('history-run-row')).toHaveCount(1);
    await expect(page.getByTestId('history-runs-link')).toBeVisible();
    expect(errors.filter((e) => !e.includes('runs read failed'))).toEqual([]);
  });

  test('(2) History with only runs: a failed runs read is never "No workouts yet"', async ({ page }) => {
    await page.addInitScript(failRunsReads);
    await seedRuns(page, [runRow('kept-run', 2000, Date.now() - DAY)]);
    await setFailRuns(page, true);
    await page.getByRole('link', { name: 'History' }).tap();
    await expect(page.getByTestId('load-error')).toHaveText('Could not load runsTry again');
    await expect(page.getByText('No workouts yet')).toHaveCount(0);
  });

  test('(2) finish screen: a failed runs read says the records could not be loaded', async ({ page, context }) => {
    await stubTiles(page);
    await page.addInitScript(failRunsReads);
    const r = await startRun(page, context);
    await move(r, 30);
    await wake(page);
    await setFailRuns(page, true);
    await holdFor(page, page.getByTestId('live-end'), 1250);
    await expect(page.getByTestId('run-summary')).toHaveAttribute('data-verdict', 'ok');
    const error = page.getByTestId('run-summary').getByTestId('load-error');
    await expect(error).toHaveText('Could not load your run recordsTry again');
    await setFailRuns(page, false);
    await error.getByRole('button', { name: 'Try again' }).tap();
    await expect(error).toHaveCount(0);
    await expect(page.getByTestId('run-summary')).toContainText('Longest run');
  });

  test('(5) Worked lately names front delts after an overhead press, never front and side delts', async ({ page }) => {
    await page.goto('./');
    await seedFinished(page, { 'overhead-press': [{ reps: 5, load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } }] }, 0.1);
    await page.reload();
    const card = page.getByTestId('fresh-muscles');
    const stage = card.getByRole('img');
    await expect(stage).toHaveAttribute('aria-label', /front delts/);
    await expect(stage).not.toHaveAttribute('aria-label', /side delts/);
  });

  test('(8) the share picture is named by what is on it', async ({ page }) => {
    await stubTiles(page);
    await seedRuns(page, [runRow('share-run', 2000, Date.now() - DAY)]);
    await page.goto('./#/history/run/share-run');
    await page.getByTestId('run-share-card').tap();
    const card = page.getByTestId('run-share-preview');
    await expect(card).toHaveAttribute('aria-label', /^Share card with your route: 2\.00 km, 11:05, \d+:\d\d \/km\. Start and end hidden$/);
    await expect(page.getByRole('img', { name: /2\.00 km/ })).toBeVisible();
  });
});

