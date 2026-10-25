import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';

// PLAN 1.11 / SPEC 9.3: Settings → Import history → review → Import N sets, on the synthetic
// fixture (invented numbers). Runs on every profile (SE layout included).
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json');

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

async function dbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const c = req.result;
          const tx = c.transaction(name, 'readonly');
          const r = tx.objectStore(name).getAll();
          tx.oncomplete = () => {
            c.close();
            resolve(r.result as T[]);
          };
          tx.onabort = () => {
            c.close();
            reject(tx.error);
          };
        };
      }),
    store,
  );
}

async function openReview(page: Page) {
  await page.goto('./#/settings');
  await expect(page.getByTestId('import-history')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page).toHaveURL(/#\/settings\/import$/);
  await expect(page.getByTestId('import-summary')).toHaveText('16 sets · 4 exercises · lb');
}

/** Answers the two questions: Wide Lunge with dumbbells, the unknown name as Dumbbell Bench Press. */
async function answer(page: Page) {
  const confirm = page.getByTestId('import-confirm');
  await expect(confirm).toHaveText('Answer 2 questions');
  await confirm.tap();
  const kind = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(kind).toBeVisible();
  // Reps are never turned into a timed hold.
  await expect(kind.getByRole('button', { name: /Timed/ })).toHaveCount(0);
  await kind.getByRole('button', { name: /Dumbbells/ }).tap();
  await expect(kind).toHaveCount(0);
  await expect(confirm).toHaveText('Answer 1 question');
  await confirm.tap();
  const pick = page.getByRole('dialog', { name: 'Pick the exercise' });
  await expect(pick).toBeVisible();
  await pick.getByRole('searchbox', { name: 'Search exercises' }).fill('dumbbell bench');
  await pick.getByRole('button', { name: 'Dumbbell Bench Press', exact: true }).tap();
  await expect(pick).toHaveCount(0);
  await expect(confirm).toHaveText('Import 16 sets');
}

test.describe('1.11 import history', () => {
  test('review: grouped by exercise, unsure sets amber with the reason, questions asked, then written in order', async ({ page }) => {
    const errors = watch(page);
    await openReview(page);
    await expect(page.getByTestId('import-exercise')).toHaveCount(4);
    await expect(page.getByTestId('import-set')).toHaveCount(16);
    await expect(page.getByTestId('ask-pick')).toHaveCount(1);
    await expect(page.getByTestId('ask-kind')).toHaveCount(1);
    // Every set as "12 × 50 lb", or reps only when the file has no weight.
    const squat = page.getByRole('region', { name: 'Barbell Back Squat' });
    await expect(squat.getByTestId('import-set').nth(1)).toContainText('8 × 185 lb');
    await expect(squat.getByText('In your file: Squats')).toBeVisible();
    const unsure = page.locator('[data-testid="import-set"][data-uncertain]');
    await expect(unsure.filter({ hasText: 'Hard to read: 6 or 8' })).toHaveCount(1);
    await expect(unsure.filter({ hasText: 'No weight in the file' })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Wide Lunge' }).getByTestId('import-set').nth(2)).toContainText('10 reps');
    // Rows are thumb sized.
    const box = await squat.getByTestId('import-set').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);

    await answer(page);

    // Fix one unsure set inline (Looks right) and skip one set.
    await unsure.filter({ hasText: 'Hard to read' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Check this set' });
    await expect(sheet.getByText('Hard to read: 6 or 8')).toBeVisible();
    await sheet.getByRole('button', { name: 'Looks right' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(unsure.filter({ hasText: 'Hard to read' })).toHaveCount(0);
    await page.getByRole('region', { name: 'Cable Tricep Pushdown' }).getByTestId('import-set').first().tap();
    await sheet.getByRole('button', { name: 'Skip this set' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('import-confirm')).toHaveText('Import 15 sets');

    await page.getByTestId('import-confirm').tap();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('status').filter({ hasText: 'Imported 15 sets' })).toBeVisible();

    const sessions = (await dbAll<Session>(page, 'sessions')).sort((a, b) => a.importSeq! - b.importSeq!);
    const sets = await dbAll<WorkoutSet>(page, 'sets');
    expect(sets).toHaveLength(15);
    expect(sessions.map((s) => [s.imported, s.importSeq, s.startedAt])).toEqual([
      [true, 1, 1],
      [true, 2, 2],
      [true, 3, 3],
      [true, 4, 4],
      [true, 5, 5],
    ]);
    expect(sessions.map((s) => s.exerciseIds)).toEqual([['barbell-back-squat'], ['barbell-back-squat'], ['cable-tricep-pushdown'], ['wide-lunge'], ['dumbbell-bench-press']]);
    // Loads only from the file, in the file's unit; the confirmed set is no longer unsure.
    const of = (i: number) => sets.filter((s) => s.sessionId === sessions[i]!.id).sort((a, b) => a.order - b.order);
    expect(of(1).map((s) => [s.reps, s.load?.total, s.uncertain])).toEqual([
      [8, 185, false],
      [8, 185, false],
      [6, 185, false],
    ]);
    expect(of(2).map((s) => [s.kind, s.load?.total, s.load?.unit])).toEqual([
      ['work', 50, 'lb'],
      ['work', 55, 'lb'],
      ['drop', 30, 'lb'],
      ['work', 20, 'kg'],
    ]);
    expect(of(3).map((s) => [s.load?.total ?? null, s.uncertain])).toEqual([
      [40, false],
      [40, false],
      [null, true],
    ]);

    // History says "Imported" instead of a date.
    await page.goto('./#/history');
    await expect(page.getByTestId('history-row')).toHaveCount(5);
    await expect(page.getByTestId('history-row').first()).toContainText('Imported');
    await page.getByTestId('history-row').filter({ hasText: 'Cable Tricep Pushdown' }).tap();
    await expect(page.getByTestId('history-meta')).toHaveText('Imported · 4 sets');

    // The same file again: nothing new.
    await openReview(page);
    await expect(page.getByTestId('import-already')).toContainText('5 workouts were imported before');
    await expect(page.getByTestId('import-confirm')).toHaveText('Nothing new to import');
    await expect(page.getByTestId('import-confirm')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('Undo deletes exactly the imported sessions', async ({ page }) => {
    const errors = watch(page);
    await openReview(page);
    await answer(page);
    await page.getByTestId('import-confirm').tap();
    const toast = page.getByRole('status').filter({ hasText: 'Imported 16 sets' });
    await expect(toast).toBeVisible();
    expect(await dbAll<WorkoutSet>(page, 'sets')).toHaveLength(16);
    await toast.getByRole('button', { name: 'Undo' }).tap();
    await expect(page.getByRole('status').filter({ hasText: 'Import undone' })).toBeVisible();
    expect(await dbAll<Session>(page, 'sessions')).toHaveLength(0);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('Last time and Next use the imported workouts', async ({ page }) => {
    test.skip(test.info().project.name !== 'iPhone 15 Pro', 'one profile');
    const errors = watch(page);
    await openReview(page);
    await answer(page);
    await page.getByTestId('import-confirm').tap();
    await expect(page.getByRole('status').filter({ hasText: 'Imported 16 sets' })).toBeVisible();
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await expect(page).toHaveURL(/#\/workout\//);
    const sheet = page.getByRole('dialog', { name: 'Add exercise' });
    if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
    // Imported exercises are recent.
    await expect(sheet.getByRole('region', { name: 'Recent' })).toContainText('Barbell Back Squat');
    await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('barbell back squat');
    await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
    await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    const back = page.getByRole('button', { name: 'Back to the list' });
    if (!(await back.isVisible())) await page.getByText('Barbell Back Squat').first().tap();
    // Last time: the newest imported workout (the unsure 6 is left out), labelled Imported, no date.
    await expect(page.getByText(/Last time 8 × 185 · 8 × 185 lb/)).toBeVisible();
    await expect(page.getByText('· Imported')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a file that is not an AnyGym history says so in one sentence', async ({ page }) => {
    const errors = watch(page);
    await page.goto('./#/settings');
    await page.getByTestId('import-file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.getByTestId('import-error')).toHaveText('This is not an AnyGym history file.');
    await expect(page).toHaveURL(/#\/settings$/);
    // A reload of the review screen without a file goes back to Settings.
    await page.goto('./#/settings/import');
    await expect(page).toHaveURL(/#\/settings$/);
    expect(errors).toEqual([]);
  });

  test('layout: nothing wider than the screen, the action always in reach', async ({ page }) => {
    const errors = watch(page);
    await openReview(page);
    const sizes = await page.evaluate(() => ({ w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, h: window.innerHeight }));
    expect(sizes.sw).toBeLessThanOrEqual(sizes.w);
    const dock = await page.getByTestId('import-confirm').boundingBox();
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(sizes.h);
    expect(dock!.height).toBeGreaterThanOrEqual(48);
    for (const el of await page.locator('[data-testid="import-exercise"]').all()) {
      const b = await el.boundingBox();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width).toBeLessThanOrEqual(sizes.w + 0.5);
    }
    expect(errors).toEqual([]);
  });
});
