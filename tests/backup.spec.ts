import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, shotOn, watchErrors } from './workout-helpers';
import type { Profile, Session, WorkoutSet } from '../src/db/types';

// PLAN 1.8 (SPEC 9.1, 9.2): Back up through the share sheet or a download, Restore with Merge or
// Replace everything (second tap), and the gentle reminder on Today. Runs on every profile.

const DAY = 86_400_000;

/** WebKit headless may or may not offer navigator.share: take it away so Back up downloads. */
const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });

/** A share sheet stand in that keeps the shared file's name and text. */
const captureShare = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; text: string } };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: async (d: { files: File[] }) => {
        w.__shared = { name: d.files[0]!.name, text: await d.files[0]!.text() };
      },
      configurable: true,
    });
  });

async function logWorkout(page: Page) {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
}

async function backUpToFile(page: Page): Promise<string> {
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  expect(download.suggestedFilename()).toMatch(/^anygym-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  await expect(page.getByText('Backup saved')).toBeVisible();
  return path;
}

async function wipe(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('anygym');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByText('No workouts yet')).toBeVisible();
}

test('back up, wipe, restore with Replace: History shows the same workouts and sets; Merge adds nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await noShare(page);
  await logWorkout(page);
  const sessions = (await dbAll<Session>(page, 'sessions')).sort((a, b) => a.startedAt - b.startedAt);
  const sets = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.id.localeCompare(b.id));
  expect(sessions).toHaveLength(2);
  expect(sets).toHaveLength(3);

  const path = await backUpToFile(page);
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.format).toBe('anygym-backup-v1');
  expect(file.tables.sets).toHaveLength(3);
  expect(file.tables.submissions).toEqual([]);
  expect(file.drafts).toEqual({});
  expect((await dbAll<Profile>(page, 'profile'))[0]!.lastBackupAt).toEqual(expect.any(Number));

  await wipe(page);
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  const sheet = page.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toBeVisible();
  const date = new Date(file.exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  await expect(page.getByTestId('restore-summary')).toHaveText(`This backup has 2 workouts, 3 sets, 1 gym, from ${date}.`);
  for (const id of ['restore-merge', 'restore-replace']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await shotOn(page, '1.8', 'restore-sheet');

  const replace = page.getByTestId('restore-replace');
  await expect(replace).toHaveAccessibleName(/^Replace everything/);
  const before = await replace.evaluate((el) => (el as HTMLElement).offsetHeight);
  await replace.tap();
  // The second tap is asked for in place: same card, same size.
  await expect(replace).toHaveAccessibleName(/^Replace Tap again/);
  await expect(replace.getByText('Tap again', { exact: false })).toBeVisible();
  await expect(replace.getByText('Deletes what', { exact: false })).toBeHidden();
  expect(await replace.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(before);
  expect((await dbAll(page, 'sets')).length).toBe(0);
  await shotOn(page, '1.8', 'restore-replace-armed');
  await replace.tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Restored 2 workouts')).toBeVisible();

  expect((await dbAll<Session>(page, 'sessions')).sort((a, b) => a.startedAt - b.startedAt)).toEqual(sessions);
  expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.id.localeCompare(b.id))).toEqual(sets);

  // History reads the restored workouts live, without a reload.
  await page.getByLabel('Back to Today').tap();
  await page.getByRole('link', { name: /History/ }).tap();
  await expect(page.getByTestId('history-row')).toHaveCount(2);
  await expect(page.getByTestId('history-row').first()).toContainText('2 sets');
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByText('Barbell Incline Bench Press').first()).toBeVisible();

  // Merge with the same file adds nothing.
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  await page.getByTestId('restore-merge').tap();
  await expect(page.getByText('Nothing new. Every workout is already here.')).toBeVisible();
  expect((await dbAll<WorkoutSet>(page, 'sets')).length).toBe(3);
  expect((await dbAll<Session>(page, 'sessions')).length).toBe(2);
  expect(errors).toEqual([]);
});

test('Back up opens the share sheet when the phone can share files', async ({ page }) => {
  const errors = watchErrors(page);
  await captureShare(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 8, load: bar185 }] });
  await page.goto('./#/settings');
  await page.getByTestId('backup').tap();
  await expect(page.getByText('Backup ready')).toBeVisible();
  const shared = await page.evaluate(() => (window as unknown as { __shared?: { name: string; text: string } }).__shared);
  expect(shared!.name).toMatch(/^anygym-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(shared!.text);
  expect(file.tables.sets[0].load).toEqual(bar185);
  expect(errors).toEqual([]);
});

test('a file that is not a backup shows one plain sentence, and a workout in progress blocks restore', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/settings');
  await expect(page.getByTestId('restore')).toBeVisible();
  await page.getByTestId('restore-file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByTestId('import-error')).toHaveText('This file is not an AnyGym backup.');
  await page.getByTestId('restore-file').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'anygym-backup-v1', schemaVersion: 99, appVersion: '9', exportedAt: 1, tables: {} })) });
  await expect(page.getByTestId('import-error')).toHaveText('This backup is from a newer version. Update AnyGym, then try again.');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const gym = (await dbAll<{ id: string }>(page, 'gyms'))[0]!;
  await dbPut(page, { sessions: [{ id: 'live', gymId: gym.id, startedAt: Date.now(), imported: false }] });
  const tables = Object.fromEntries(['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones'].map((t) => [t, []]));
  const good = JSON.stringify({ format: 'anygym-backup-v1', schemaVersion: 6, appVersion: '0.1.0', exportedAt: 1, tables, drafts: {} });
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(good) });
  await expect(page.getByTestId('import-error')).toHaveText('Finish your workout first, then restore.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function seedSix(page: Page, lastBackupAt?: number) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string }>(page, 'gyms'))[0]!;
  const now = Date.now();
  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `old-${i}`, gymId: gym.id, startedAt: now - (30 - i) * DAY, endedAt: now - (30 - i) * DAY + 3_600_000, imported: false, exerciseIds: ['barbell-incline-bench-press'] }));
  const sets = sessions.map((s, i) => ({ id: `set-${i}`, sessionId: s.id, exerciseId: 'barbell-incline-bench-press', order: 0, kind: 'work', reps: 8, load: bar185, uncertain: false }));
  await dbPut(page, { sessions, sets, profile: [{ id: 'me', defaultUnit: 'lb', createdAt: now - 60 * DAY, ...(lastBackupAt ? { lastBackupAt } : {}) }] });
  await page.reload();
}

test('the reminder shows with 6 workouts and an old backup, and goes away after Not now or Back up', async ({ page }) => {
  const errors = watchErrors(page);
  await noShare(page);
  await seedSix(page, Date.now() - 20 * DAY);
  const card = page.getByTestId('backup-reminder');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Back up your workouts');
  // One line, and thumb sized buttons.
  const text = card.getByText('Back up your workouts');
  const lines = await text.evaluate((el) => {
    const s = getComputedStyle(el);
    return (el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight);
  });
  expect(lines).toBeLessThan(1.5);
  // The pill sits as far from the right edge as the words from the left.
  const inset = await card.evaluate((el) => {
    const c = el.getBoundingClientRect();
    const words = el.firstElementChild!.getBoundingClientRect();
    const pill = el.querySelector('[data-testid="reminder-backup"]')!.getBoundingClientRect();
    return { left: words.left - c.left, right: c.right - pill.right };
  });
  expect(Math.abs(inset.left - inset.right)).toBeLessThanOrEqual(1);
  for (const id of ['reminder-backup', 'reminder-later']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await shotOn(page, '1.8', 'today-reminder');

  await page.getByTestId('reminder-later').tap();
  await expect(card).toHaveCount(0);
  const snoozed = (await dbAll<Profile>(page, 'profile'))[0]!.backupSnoozeUntil!;
  expect(snoozed - Date.now()).toBeGreaterThan(6.9 * DAY);
  expect(snoozed - Date.now()).toBeLessThanOrEqual(7 * DAY);
  await page.reload();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await expect(card).toHaveCount(0);

  // Snooze over: it is back; Back up saves the file and it goes away.
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, lastBackupAt: Date.now() - 20 * DAY, backupSnoozeUntil: Date.now() - 1 }] });
  await page.reload();
  await expect(card).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('reminder-backup').tap()]);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).tables.sessions).toHaveLength(6);
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Backup saved')).toBeVisible();
  expect(errors).toEqual([]);
});

test('no reminder with a recent backup, with 5 workouts, or during a workout', async ({ page }) => {
  const errors = watchErrors(page);
  await seedSix(page, Date.now() - 3 * DAY);
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  // Never backed up, 6 workouts, but a workout in progress.
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1 }] });
  const gym = (await dbAll<{ id: string }>(page, 'gyms'))[0]!;
  await dbPut(page, { sessions: [{ id: 'live', gymId: gym.id, startedAt: Date.now(), imported: false }] });
  await page.reload();
  await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  expect(errors).toEqual([]);
});
