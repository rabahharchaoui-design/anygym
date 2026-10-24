import { expect, test, type Locator, type Page } from './fixtures';

// Shared helpers for the PLAN 1.7c workout flow (day list → exercise view → set table).

export const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

/** Every record of an IndexedDB store, read straight from the database. */
export const dbAll = <T = Record<string, unknown>>(page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const q = req.result.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            req.result.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
    store,
  ) as Promise<T[]>;

/** Writes records into stores in one transaction (the app must have created the database). */
export const dbPut = (page: Page, records: Record<string, unknown[]>) =>
  page.evaluate(
    (recs) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const names = Object.keys(recs);
          const tx = req.result.transaction(names, 'readwrite');
          for (const n of names) for (const r of recs[n]!) tx.objectStore(n).put(r);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    records,
  );

export type SeedSet = { reps?: number; seconds?: number; load: Record<string, unknown>; kind?: 'work' | 'warmup' | 'drop' };

/**
 * A finished workout in the past at the active gym, so "Last time" and targets exist (the app has
 * opened once and made its gym). Returns the gym id.
 */
export async function seedFinished(page: Page, exercises: Record<string, SeedSet[]>, daysAgo = 2): Promise<string> {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const start = Date.now() - daysAgo * 86_400_000;
  const id = `seed-${start}`;
  const sets: unknown[] = [];
  let order = 0;
  for (const [exerciseId, list] of Object.entries(exercises)) {
    for (const s of list) {
      sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId, order: order++, kind: s.kind ?? 'work', uncertain: false, load: s.load, ...(s.reps !== undefined ? { reps: s.reps } : {}), ...(s.seconds !== undefined ? { seconds: s.seconds } : {}) });
    }
  }
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt: start, endedAt: start + 3_600_000, imported: false, exerciseIds: Object.keys(exercises) }],
    sets,
  });
  return gym.id;
}

export const bar185 = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };

/** Picks a curated plan from Today (See plans → plan → Use this plan), ending back on Today. */
export async function usePlan(page: Page, planTestId = 'plan-ohrabah-split') {
  await page.goto('./');
  await page.getByRole('button', { name: 'See plans' }).tap();
  await page.getByTestId(planTestId).tap();
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
}

/** Adds exercises from the picker (opens it when it is not open yet), then "Add N". */
export async function pickExercises(page: Page, picks: Array<[query: string, name: string]>) {
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(page.getByTestId('workout-title')).toBeVisible();
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).tap();
  await expect(sheet).toBeVisible();
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' });
  for (const [query, name] of picks) {
    await search.fill(query);
    await sheet.getByRole('button', { name, exact: true }).tap();
  }
  await sheet.getByRole('button', { name: `Add ${picks.length}` }).tap();
  await expect(sheet).toHaveCount(0);
}

/** Quick workout from Today, with the given exercises added. */
export async function quickWith(page: Page, picks: Array<[string, string]>) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await pickExercises(page, picks);
}

/** The exercise view of an exercise. */
export const exerciseView = (page: Page, id: string) => page.getByTestId(`exercise-${id}`);
/** The ✓ of the current (first not logged) row. */
export const checkCurrent = (scope: Page | Locator) => scope.getByTestId('check-current');
export const loggedRows = (scope: Page | Locator) => scope.getByTestId('set-row');

/** Screenshots for the item report, only on the given profiles. */
export async function shotOn(page: Page, dir: string, name: string, profiles = ['iPhone SE', 'iPhone 17 Pro Max']) {
  const project = test.info().project.name;
  if (!profiles.includes(project)) return;
  await page.waitForTimeout(450); // let springs settle
  await page.screenshot({ path: `reports/shots/${dir}/${name}-${project.replace(/ /g, '-')}.png` });
}

/** The page never scrolls sideways and the main area does not scroll (SPEC 13.5). */
export async function fitsOneScreen(page: Page) {
  const main = page.getByRole('main');
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}
