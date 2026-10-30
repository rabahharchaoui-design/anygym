import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, exerciseView, fillReps, loggedRows, quickWith, shotOn, watchErrors } from './workout-helpers';

// PLAN 2.0c group 4 (acceptance D) and group 7, in the browser: drafts survive a restart when
// localStorage access throws; a rest read failure never crashes opening a workout; Finish → Undo
// on Today restores pending edits and added rows exactly.

const ID = 'kettlebell-goblet-squat';
const todo = (view: Locator) => view.getByTestId('set-todo');
const kv = async (page: Page, key: string) => (await dbAll<{ key: string; value: string | null }>(page, 'kv')).find((r) => r.key === key)?.value ?? null;

async function pick53(page: Page, view: Locator) {
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  for (const k of ['5', '3']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('53');
}

/** localStorage whose very access throws (blocked storage), installed before the app on every load. */
function blockLocalStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Synthetic blocked storage', 'SecurityError');
    },
  });
}

test('acceptance D: with localStorage access throwing, a 53 lb / 17 rep pending row survives a reload exactly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(blockLocalStorage);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await fillReps(view, todo(view).first(), 17);
  // Durable in IndexedDB before the reload (nothing else could keep it).
  await expect.poll(async () => (await kv(page, 'anygym-drafts')) ?? '').toMatch(/"reps":17/);
  expect(await kv(page, 'anygym-drafts')).toContain('"total":53');
  await page.reload();
  const again = exerciseView(page, ID);
  await expect(again.getByTestId('weight-cell').first()).toHaveText('53');
  await expect(todo(again).first().getByTestId('reps-cell')).toHaveText('17');
  expect(errors).toEqual([]);
});

test('a rest storage read failure never crashes opening the workout: the rest comes from its IndexedDB copy @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect.poll(async () => (await kv(page, 'anygym-rest')) ?? '').toContain('endsAt');
  // From now on reading the rest from localStorage throws (the storage object exists).
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (this: Storage, key: string) {
      if (key === 'anygym-rest') throw new DOMException('Synthetic read failure', 'SecurityError');
      return get.call(this, key);
    };
  });
  await page.reload();
  await expect(loggedRows(exerciseView(page, ID))).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Something went wrong/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Finish → Undo on Today restores the pending 17 rep edit and the added row exactly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await fillReps(view, todo(view).first(), 17);
  await view.getByRole('button', { name: '+ Add set' }).tap();
  const rows = await todo(view).count();
  expect(rows).toBe(3);
  await shotOn(page, '2.0c', 'g7-before-finish');

  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await page.getByTestId(`row-${ID}`).tap();
  const back = exerciseView(page, ID);
  await expect(loggedRows(back)).toHaveCount(1);
  await expect(todo(back)).toHaveCount(rows);
  await expect(todo(back).first().getByTestId('reps-cell')).toHaveText('17');
  await expect(todo(back).first().getByTestId('weight-cell')).toHaveText('53');
  await shotOn(page, '2.0c', 'g7-after-undo');
  // And it survives a reload.
  await page.reload();
  await expect(todo(exerciseView(page, ID))).toHaveCount(rows);
  await expect(todo(exerciseView(page, ID)).first().getByTestId('reps-cell')).toHaveText('17');
  expect(errors).toEqual([]);
});

test('a failed Edit set write survives a reload: Finish still refuses, Try again saves its values once @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __fail?: boolean };
    const tx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, s: string | string[], m?: IDBTransactionMode, o?: IDBTransactionOptions) {
      const names = typeof s === 'string' ? [s] : [...s];
      if (w.__fail && m === 'readwrite' && names.includes('sets')) {
        w.__fail = false;
        throw new DOMException('disk full', 'QuotaExceededError');
      }
      return tx.call(this, s, m, o);
    } as typeof IDBDatabase.prototype.transaction;
  });
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const sets = async () => dbAll<{ reps?: number }>(page, 'sets');
  const before = (await sets())[0]!.reps!;
  await loggedRows(view).first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await page.evaluate(() => void ((window as unknown as { __fail: boolean }).__fail = true));
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(page.getByText('Could not save that')).toBeVisible();
  expect((await sets())[0]!.reps).toBe(before);
  // The change and its values are journaled in IndexedDB.
  const journal = await dbAll<{ mutation?: { kind: string; change?: { reps?: number } } }>(page, 'journal');
  expect(journal.map((j) => [j.mutation?.kind, j.mutation?.change?.reps])).toEqual([['edit', before + 1]]);

  // Restart: nothing in memory. Finish still refuses because of the change.
  await page.reload();
  await expect(loggedRows(exerciseView(page, ID))).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const unsaved = page.getByRole('dialog', { name: /not saved/ });
  await expect(unsaved).toBeVisible();
  await expect(unsaved).toContainText('1 change did not save');
  await expect(page).not.toHaveURL(/\/done$/);
  await unsaved.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const s = await sets();
  expect(s).toHaveLength(1);
  expect(s[0]!.reps).toBe(before + 1);
  expect(await dbAll(page, 'journal')).toEqual([]);
  expect(errors.filter((e) => !/disk full|QuotaExceeded/.test(e))).toEqual([]);
});

test('Finish → Undo keeps an active rest countdown with its original deadline (also after a reload) @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const restOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('anygym-rest') ?? 'null') as { sessionId: string; endsAt: number } | null);
  await expect.poll(restOf).not.toBeNull();
  const before = (await restOf())!;
  expect(before.endsAt).toBeGreaterThan(Date.now());

  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect(await restOf()).toBeNull();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect.poll(async () => (await restOf())?.endsAt).toBe(before.endsAt);
  await page.reload();
  await expect.poll(async () => (await restOf())?.endsAt).toBe(before.endsAt);
  expect(await kv(page, 'anygym-rest')).toContain(String(before.endsAt));
  expect(errors).toEqual([]);
});
