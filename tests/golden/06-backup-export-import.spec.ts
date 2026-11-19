// GOLDEN 6: Back up to a file, wipe the phone's data, restore it, the workouts and runs are back exactly
// (PLAN M8: the reinstall for the new icon depends on it).
import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import { runRow } from '../helpers/run';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished } from '../workout-helpers';

test.describe.configure({ retries: 0 });

test('golden: back up to a file, wipe, restore with Replace, History and runs are the same', async ({ page }) => {
  // The share sheet is taken away so Back up downloads a file.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  for (let n = 1; n <= 2; n++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(n);
  }
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const sessions = (await dbAll<{ id: string }>(page, 'sessions')).sort((a, b) => a.id.localeCompare(b.id));
  const sets = (await dbAll<{ id: string }>(page, 'sets')).sort((a, b) => a.id.localeCompare(b.id));
  expect(sessions).toHaveLength(2);
  expect(sets).toHaveLength(3);
  // Two finished runs, every field and GPS point of which must come back unchanged.
  await dbPut(page, { runs: [runRow('golden-run-a', 3000, Date.now() - 3 * 86_400_000), runRow('golden-run-b', 1200, Date.now() - 86_400_000)] });
  const runs = (await dbAll<{ id: string }>(page, 'runs')).sort((a, b) => a.id.localeCompare(b.id));
  expect(runs).toHaveLength(2);

  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  expect(download.suggestedFilename()).toMatch(/^anygym-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = (await download.path())!;
  await expect(page.getByText('Backup saved')).toBeVisible();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.format).toBe('anygym-backup-v1');
  expect(file.tables.sets).toHaveLength(3);
  expect(file.tables.runs).toHaveLength(2);

  // Wipe everything the app has stored, as a new phone.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('anygym');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByText('No workouts yet')).toBeVisible();
  expect(await dbAll(page, 'runs')).toEqual([]);

  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  await expect(page.getByRole('dialog', { name: 'Restore backup' })).toBeVisible();
  await expect(page.getByTestId('restore-summary')).toContainText('2 workouts, 3 sets');
  const replace = page.getByTestId('restore-replace');
  await replace.tap();
  await expect(replace).toHaveAccessibleName(/^Replace Tap again/);
  await replace.tap();
  await expect(page.getByText('Restored 2 workouts')).toBeVisible();

  expect((await dbAll<{ id: string }>(page, 'sessions')).sort((a, b) => a.id.localeCompare(b.id))).toEqual(sessions);
  expect((await dbAll<{ id: string }>(page, 'sets')).sort((a, b) => a.id.localeCompare(b.id))).toEqual(sets);
  expect((await dbAll<{ id: string }>(page, 'runs')).sort((a, b) => a.id.localeCompare(b.id))).toEqual(runs);
  await page.getByLabel('Back to Today').tap();
  await page.getByRole('link', { name: /History/ }).tap();
  await expect(page.getByTestId('history-row')).toHaveCount(2);
});
