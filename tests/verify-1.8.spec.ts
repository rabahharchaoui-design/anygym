import { expect, test, type Page } from './fixtures';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';
import type { Gym, Profile, Session, WorkoutSet } from '../src/db/types';

const DAY = 86_400_000;
// A v6 backup carries every table (PLAN 1.8 fix: a missing table is refused as damaged).
const ALL_EMPTY = Object.fromEntries(['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones'].map((t) => [t, [] as unknown[]]));
const shot = (page: Page, name: string) => page.screenshot({ path: `reports/shots/1.8/v-${name}-${test.info().project.name.replace(/ /g, '-')}.png` });

const capture = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; text: string } };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: async (d: { files: File[] }) => { w.__shared = { name: d.files[0]!.name, text: await d.files[0]!.text() }; },
      configurable: true,
    });
  });
const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
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
const localDate = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

test('share capture: name has local date; wipe, restore Replace with double tap restores once; gym active; bogus; active-workout refusal', async ({ page }) => {
  const errors = watchErrors(page);
  await capture(page);
  await logWorkout(page);
  const gymsBefore = await dbAll<Gym>(page, 'gyms');
  const sessionsBefore = (await dbAll<Session>(page, 'sessions')).length;
  await page.goto('./#/settings');
  await page.waitForTimeout(800);
  await shot(page, 'settings');
  expect((await page.getByTestId('backup').boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect((await page.getByTestId('restore').boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.getByTestId('backup').dblclick().catch(() => {});
  await expect(page.getByText('Backup ready').first()).toBeVisible();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared);
  expect(shared.name).toBe(`anygym-backup-${localDate()}.json`);
  const file = JSON.parse(shared.text);
  expect(file.tables.sets).toHaveLength(3);

  await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res(); }));
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByText('No workouts yet')).toBeVisible();
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles({ name: shared.name, mimeType: 'application/json', buffer: Buffer.from(shared.text) });
  await expect(page.getByTestId('restore-summary')).toContainText(`${sessionsBefore} workouts, 3 sets`);
  await shot(page, 'sheet');
  const replace = page.getByTestId('restore-replace');
  await replace.tap();
  expect((await dbAll(page, 'sets')).length).toBe(0); // first tap changes nothing
  await replace.dblclick().catch(() => {});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect((await dbAll(page, 'sets')).length).toBe(3);
  expect((await dbAll(page, 'sessions')).length).toBe(sessionsBefore);
  const gyms = await dbAll<Gym>(page, 'gyms');
  expect(gyms.filter((g) => g.isActive).map((g) => g.id)).toEqual(gymsBefore.filter((g) => g.isActive).map((g) => g.id));
  expect(gyms).toHaveLength(gymsBefore.length);
  await page.reload();
  await page.getByRole('link', { name: /History/ }).tap();
  await expect(page.getByTestId('history-row')).toHaveCount(sessionsBefore);
  await expect(page.getByTestId('history-row').first()).toContainText('2 sets');
  await page.goto('./#/settings');

  // merge same adds nothing
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(shared.text) });
  await page.getByTestId('restore-merge').tap();
  await expect(page.getByText('Nothing new. Every workout is already here.')).toBeVisible();
  expect((await dbAll(page, 'sets')).length).toBe(3);

  // bogus
  await page.getByTestId('restore-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.getByTestId('import-error')).toBeVisible();
  await shot(page, 'bogus');
  // active workout
  const gym = gyms.find((g) => g.isActive)!;
  await dbPut(page, { sessions: [{ id: 'live', gymId: gym.id, startedAt: Date.now(), imported: false }] });
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(shared.text) });
  await expect(page.getByTestId('import-error')).toContainText('Finish your workout first');
  expect((await dbAll(page, 'sets')).length).toBe(3);
  expect(errors).toEqual([]);
});

test('active workout appears mid sheet: Replace refuses and keeps everything', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await page.goto('./#/settings');
  const gym = (await dbAll<Gym>(page, 'gyms'))[0]!;
  const text = JSON.stringify({ format: 'anygym-backup-v1', schemaVersion: 6, appVersion: '1', exportedAt: Date.now(), tables: { ...ALL_EMPTY, gyms: [gym] } });
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await dbPut(page, { sessions: [{ id: 'live', gymId: gym.id, startedAt: Date.now(), imported: false }] });
  await page.getByTestId('restore-replace').tap();
  await page.getByTestId('restore-replace').tap();
  await expect(page.getByTestId('restore-error')).toContainText('Finish your workout first');
  expect((await dbAll(page, 'sessions')).length).toBe(2);
  expect((await dbAll<WorkoutSet>(page, 'sets')).length).toBe(1);
  expect(errors).toEqual([]);
});

test('reminder card, layout, never mid workout, 130% sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await noShare(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Gym>(page, 'gyms'))[0]!;
  const now = Date.now();
  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, gymId: gym.id, startedAt: now - (30 - i) * DAY, endedAt: now - (30 - i) * DAY + 3_600_000, imported: false, exerciseIds: ['x'] }));
  const sets = sessions.map((s, i) => ({ id: `t${i}`, sessionId: s.id, exerciseId: 'barbell-incline-bench-press', order: 0, kind: 'work', reps: 8, load: bar185, uncertain: false }));
  await dbPut(page, { sessions, sets, profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, lastBackupAt: now - 20 * DAY }] });
  await page.reload();
  const card = page.getByTestId('backup-reminder');
  await expect(card).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'reminder');
  const tb = await page.getByTestId('reminder-backup').boundingBox();
  const tl = await page.getByTestId('reminder-later').boundingBox();
  expect(tb!.height).toBeGreaterThanOrEqual(48);
  expect(tl!.height).toBeGreaterThanOrEqual(48);
  expect(tb!.width).toBeGreaterThanOrEqual(48);
  expect(tl!.width).toBeGreaterThanOrEqual(48);
  await page.getByTestId('reminder-later').dblclick().catch(() => {});
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await expect(card).toHaveCount(0);
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, lastBackupAt: now - 20 * DAY }] });
  await page.reload();
  await expect(card).toBeVisible();
  await page.getByTestId('reminder-backup').dblclick().catch(() => {});
  await expect(card).toHaveCount(0);
  expect((await dbAll<Profile>(page, 'profile'))[0]!.lastBackupAt!).toBeGreaterThan(now - 5000);
  // mid workout
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, lastBackupAt: now - 20 * DAY }], sessions: [{ id: 'live', gymId: gym.id, startedAt: Date.now(), imported: false }] });
  await page.reload();
  await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
  await expect(card).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('130% text on the restore sheet and settings: nothing clipped', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await page.goto('./#/settings');
  const gym = (await dbAll<Gym>(page, 'gyms'))[0]!;
  const text = JSON.stringify({ format: 'anygym-backup-v1', schemaVersion: 6, appVersion: '1', exportedAt: Date.now(), tables: { ...ALL_EMPTY, gyms: [gym] } });
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('restore-merge')).toBeVisible();
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of els) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(400);
  await shot(page, 'sheet-130');
  await page.getByTestId('restore-replace').tap();
  await page.waitForTimeout(300);
  await shot(page, 'sheet-130-armed');
  for (const id of ['restore-merge', 'restore-replace']) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.y + b!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(b!.x + b!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
