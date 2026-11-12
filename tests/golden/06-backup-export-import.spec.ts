// GOLDEN 6: Back up to a file, wipe the phone's data, restore it, the workouts are back.
import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import { bar185, checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished } from '../workout-helpers';

test.describe.configure({ retries: 0 });

test('golden: back up to a file, wipe, restore with Replace, History is the same', async ({ page }) => {
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

  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  expect(download.suggestedFilename()).toMatch(/^anygym-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = (await download.path())!;
  await expect(page.getByText('Backup saved')).toBeVisible();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.format).toBe('anygym-backup-v1');
  expect(file.tables.sets).toHaveLength(3);

  // Wipe everything the app has stored, as a new phone.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('anygym');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByText('No workouts yet')).toBeVisible();

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
  await page.getByLabel('Back to Today').tap();
  await page.getByRole('link', { name: /History/ }).tap();
  await expect(page.getByTestId('history-row')).toHaveCount(2);
});
