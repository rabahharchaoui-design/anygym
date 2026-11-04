import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';

// PLAN 3.2 / SPEC 9.3 and 4.3: imported names matched to plan and catalog exercises (exact names
// only, never a guess), the quiet match line, Change from a search of plan and catalog exercises,
// Keep as its own name, and the mapping written with every set. Synthetic fixture, invented numbers.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-mapping-v1.json');
const SHOTS = join(HERE, '..', 'reports', 'shots', '3.2');

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
  await expect(page.getByTestId('import-summary')).toHaveText('15 sets · 8 exercises · lb');
}

const shot = async (page: Page, name: string, project: string) => {
  mkdirSync(SHOTS, { recursive: true });
  // Pushes and sheets settled: no mid transition frames.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(SHOTS, `${name}-${project.replace(/\s+/g, '-')}.png`) });
};

test.describe('3.2 import: catalog mapping', () => {
  test('match lines, honest unmapped names, change and keep as name, mapping written with every set @matrix', async ({ page }, info) => {
    test.setTimeout(60_000);
    const errors = watch(page);
    await openReview(page);
    const region = (name: string) => page.getByRole('region', { name, exact: true });

    // Grouped by exercise, every set.
    await expect(page.getByTestId('import-exercise')).toHaveCount(8);
    await expect(page.getByTestId('import-set')).toHaveCount(15);

    // Exact names only: plan names, and catalog names; the map says exact, variant or none.
    await expect(region('Barbell Back Squat').getByTestId('import-match')).toContainText('Matched: Barbell Squat (a close variant)');
    await expect(region('Barbell Back Squat').getByText('In your file: Squats')).toBeVisible();
    await expect(region('Cable Tricep Pushdown').getByTestId('import-match')).toContainText('Matched: Triceps Pushdown');
    await expect(region('Barbell Curl').getByTestId('import-match')).toContainText('Matched: Barbell Curl');
    await expect(region('Leg Extensions').getByTestId('import-match')).toContainText('Matched: Leg Extensions');
    await expect(region('28 Method Squat').getByTestId('import-match')).toContainText('Not in the catalog yet');
    // Names that match nothing exactly are asked, never guessed.
    for (const n of ['Moon press', 'Bench', 'Mystery machine']) {
      const r = region(`${n} (not matched)`);
      await expect(r.getByTestId('ask-pick')).toBeVisible();
      await expect(r.getByTestId('import-match')).toHaveCount(0);
    }
    await expect(region('Mystery machine (not matched)').getByTestId('ask-kind')).toBeVisible();
    // Uncertain sets are amber with the reason.
    const unsure = page.locator('[data-testid="import-set"][data-uncertain]');
    await expect(unsure.filter({ hasText: 'Hard to read: 6 or 8' })).toHaveCount(1);
    await expect(unsure.filter({ hasText: 'Weight not written down' })).toHaveCount(1);
    await shot(page, 'review-top', info.project.name);

    const confirm = page.getByTestId('import-confirm');
    await expect(confirm).toHaveText('Answer 3 questions');

    // Moon press: kept by its own name.
    const pick = page.getByRole('dialog', { name: 'Pick the exercise' });
    await region('Moon press (not matched)').getByRole('button', { name: 'Pick the exercise' }).tap();
    await expect(pick).toBeVisible();
    await expect(pick.getByRole('heading', { name: 'In your plans' })).toBeVisible();
    await expect(pick.getByText('In your file: “Moon press”')).toBeVisible();
    await shot(page, 'pick-sheet', info.project.name);
    await pick.getByTestId('pick-keep-name').tap();
    await expect(pick).toHaveCount(0);
    await expect(region('Moon press').getByTestId('import-match')).toContainText('Not in the catalog yet · picked by you');
    await expect(confirm).toHaveText('Answer 2 questions');

    // Bench: a plan exercise from the search.
    await region('Bench (not matched)').getByRole('button', { name: 'Pick the exercise' }).tap();
    await pick.getByRole('searchbox', { name: 'Search exercises' }).fill('dumbbell bench');
    await pick.getByRole('button', { name: 'Dumbbell Bench Press', exact: true }).tap();
    await expect(pick).toHaveCount(0);
    await expect(region('Dumbbell Bench Press').getByText('In your file: Bench')).toBeVisible();

    // Mystery machine: a catalog exercise from the search, then how it is loaded.
    await confirm.tap();
    await expect(pick).toBeVisible();
    await pick.getByRole('searchbox', { name: 'Search exercises' }).fill('ab crunch');
    await expect(pick.getByTestId('pick-catalog')).toBeVisible();
    await pick.getByTestId('pick-catalog').getByRole('button', { name: 'Ab Crunch Machine', exact: true }).tap();
    await expect(pick).toHaveCount(0);
    await expect(region('Ab Crunch Machine').getByTestId('import-match')).toContainText('Matched: Ab Crunch Machine · picked by you');
    await expect(confirm).toHaveText('Answer 1 question');
    await confirm.tap();
    const kind = page.getByRole('dialog', { name: 'How do you load this?' });
    await kind.getByRole('button', { name: /Machine with a pin/ }).tap();
    await expect(kind).toHaveCount(0);
    await expect(confirm).toHaveText('Import 15 sets');

    // Change a name the app matched: skip it, bring it back, then pick another plan exercise.
    await region('Leg Extensions').getByRole('button', { name: 'Change the exercise for Leg Extensions' }).tap();
    await pick.getByRole('button', { name: 'Skip this set' }).tap();
    await expect(region('Leg Extensions').getByText('Skipped: not imported')).toBeVisible();
    await expect(confirm).toHaveText('Import 14 sets');
    await region('Leg Extensions').getByRole('button', { name: 'Bring back' }).tap();
    await expect(confirm).toHaveText('Import 15 sets');
    await region('Leg Extensions').getByRole('button', { name: 'Change the exercise for Leg Extensions' }).tap();
    await pick.getByRole('searchbox', { name: 'Search exercises' }).fill('leg extension');
    await pick.getByRole('button', { name: 'Leg Extension', exact: true }).tap();
    await expect(region('Leg Extension').getByTestId('import-match')).toContainText('picked by you');

    // Fix the unsure squat inline.
    await unsure.filter({ hasText: 'Hard to read' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Check this set' });
    await sheet.getByRole('button', { name: 'Looks right' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(unsure.filter({ hasText: 'Hard to read' })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'review-answered', info.project.name);

    // Layout: nothing wider than the screen.
    const sizes = await page.evaluate(() => ({ w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
    expect(sizes.sw).toBeLessThanOrEqual(sizes.w);

    await confirm.tap();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('status').filter({ hasText: 'Imported 15 sets' })).toBeVisible();

    const sessions = (await dbAll<Session>(page, 'sessions')).sort((a, b) => a.importSeq! - b.importSeq!);
    const sets = await dbAll<WorkoutSet>(page, 'sets');
    expect(sets).toHaveLength(15);
    expect(sessions.every((s) => s.imported)).toBe(true);
    expect(sessions.map((s) => s.importSeq)).toEqual(sessions.map((_, i) => i + 1));
    // File order kept, each exercise under its matched or picked id.
    expect(sessions.map((s) => s.exerciseIds![0])).toEqual([
      'barbell-back-squat',
      'barbell-back-squat',
      'cable-tricep-pushdown',
      'Barbell_Curl',
      'leg-extension',
      '28-method-squat',
      'import:Moon press',
      'dumbbell-bench-press',
      'Ab_Crunch_Machine',
    ]);
    const mapOf = (id: string) => [...new Set(sets.filter((s) => s.exerciseId === id).map((s) => JSON.stringify(s.importMap)))].map((x) => JSON.parse(x));
    expect(mapOf('barbell-back-squat')).toEqual([{ fileName: 'Squats', catalogId: 'Barbell_Squat', match: 'variant', by: 'name' }]);
    expect(mapOf('cable-tricep-pushdown')).toEqual([{ fileName: 'Triceps Pushdown', catalogId: 'Triceps_Pushdown', match: 'exact', by: 'name' }]);
    expect(mapOf('Barbell_Curl')).toEqual([{ fileName: 'Barbell Curl', catalogId: 'Barbell_Curl', match: 'exact', by: 'name' }]);
    expect(mapOf('28-method-squat')).toEqual([{ fileName: '28 Method Squat', catalogId: null, match: 'none', by: 'name' }]);
    expect(mapOf('import:Moon press')).toEqual([{ fileName: 'Moon press', catalogId: null, match: 'none', by: 'you' }]);
    expect(mapOf('Ab_Crunch_Machine')).toEqual([{ fileName: 'Mystery machine', catalogId: 'Ab_Crunch_Machine', match: 'exact', by: 'you' }]);
    expect(mapOf('leg-extension')[0]).toMatchObject({ fileName: 'Leg Extensions', by: 'you' });
    // Loads only from the file: no weight stays reps only and unsure.
    const bench = sets.filter((s) => s.exerciseId === 'dumbbell-bench-press').sort((a, b) => a.order - b.order);
    expect(bench.map((s) => [s.load?.total ?? null, s.uncertain])).toEqual([
      [80, false],
      [null, true],
    ]);

    // History: "Imported", names for plan, catalog and kept names.
    await page.goto('./#/history');
    await expect(page.getByTestId('history-row')).toHaveCount(9);
    for (const n of ['Moon press', 'Barbell Curl', 'Ab Crunch Machine', 'Leg Extension']) await expect(page.getByTestId('history-row').filter({ hasText: n }).first()).toBeVisible();
    await shot(page, 'history', info.project.name);
    await page.getByTestId('history-row').filter({ hasText: 'Moon press' }).tap();
    await expect(page.getByTestId('history-meta')).toHaveText(/^Imported · 2 sets/);

    // The same file again: nothing new, whatever the mapping.
    await openReview(page);
    await expect(page.getByTestId('import-already')).toContainText('9 workouts were imported before');
    expect(errors).toEqual([]);
  });

  test('the original fixture still imports with its match lines', async ({ page }) => {
    const errors = watch(page);
    await page.goto('./#/settings');
    await page.getByTestId('import-file').setInputFiles(join(HERE, '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json'));
    await expect(page.getByTestId('import-summary')).toHaveText('16 sets · 4 exercises · lb');
    await expect(page.getByRole('region', { name: 'Wide Lunge' }).getByTestId('import-match')).toContainText(/Matched: |Not in the catalog yet/);
    await expect(page.getByTestId('import-match')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
});
