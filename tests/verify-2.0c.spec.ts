import { expect, test, type Locator, type Page } from './fixtures';
import type { Gym, WorkoutSet } from '../src/db/types';
import { sumLoad } from '../src/lib/load';
import { checkCurrent, dbAll, exerciseView, fillReps, loggedRows, quickWith, shotOn, watchErrors } from './workout-helpers';

// Tester verification of PLAN 2.0c (A, B, C, D, G, H, I, J and the data sweep). Synthetic data only.

const GOB = 'kettlebell-goblet-squat';
const SQ = 'barbell-back-squat';
const sheetOf = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const todo = (v: Locator) => v.getByTestId('set-todo');
const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
const kv = async (page: Page, key: string) => (await dbAll<{ key: string; value: string | null }>(page, 'kv')).find((r) => r.key === key)?.value ?? null;
const activeGym = async (page: Page) => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;

async function typeWeight(page: Page, view: Locator, row: number, digits: string, clear = false) {
  await todo(view).nth(row).getByTestId('weight-cell').tap();
  const s = sheetOf(page);
  await expect(s).toHaveAttribute('data-state', 'open');
  if (clear) for (let i = 0; i < 3; i++) await s.getByRole('button', { name: 'Delete', exact: true }).tap();
  for (const k of digits) await s.getByRole('button', { name: k, exact: true }).tap();
  await s.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(s).toHaveCount(0);
}
async function dragDown(page: Page, sheet: Locator) {
  const box = (await sheet.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x, box.y + 6 + (box.height * 0.6 * i) / 12);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

test('A: 65 lb picker, gym -> kg elsewhere: Done blocked, swipe applies nothing, fresh kg works @matrix', async ({ page, context }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQ);
  await view.getByTestId('weight-cell').first().tap();
  const sheet = sheetOf(page);
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(sheet.getByTestId('plate-total')).toContainText('65');
  const other = await context.newPage();
  await other.goto('./#/settings');
  await other.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await activeGym(other)).unit).toBe('kg');
  await other.close();
  const done = sheet.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeDisabled();
  await done.tap({ force: true, timeout: 1500 }).catch(() => undefined);
  await shotOn(page, '2.0c', 'v-a-blocked');
  await expect(sheet).toBeVisible();
  await dragDown(page, sheet);
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('anygym-drafts') ?? '')).not.toMatch(/"total":40/);
  await expect(view.getByTestId('weight-cell').first()).not.toHaveText('40');
  expect((await sets(page)).length).toBe(0);
  await view.getByTestId('weight-cell').first().tap();
  await sheet.getByRole('button', { name: 'Add 20 kg plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('60');
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const l = (await sets(page))[0]!.load!;
  expect([l.unit, l.total]).toEqual(['kg', 60]);
  expect(errors).toEqual([]);
});

const FILE = JSON.stringify({
  format: 'anygym-import-v1', unit: 'lb',
  exercises: [{ name: 'KB', planExercise: 'Kettlebell Goblet Squat', loadType: 'single_weight', sessions: [{ sets: [{ reps: 10, weight: 53 }] }] }],
});
test('B: imported 53 lb: clear, 501, close: Save disabled, never "checked", source stays 53 @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 's.json', mimeType: 'application/json', buffer: Buffer.from(FILE) });
  await expect(page).toHaveURL(/#\/settings\/import$/);
  const row = page.getByTestId('import-set').first();
  await row.tap();
  const sheet = page.getByRole('dialog', { name: 'Check this set' });
  const save = sheet.getByRole('button', { name: /^(Save|Looks right)$/ });
  for (let i = 0; i < 3; i++) await sheet.getByRole('button', { name: 'Delete', exact: true }).tap();
  await expect(save).toBeDisabled();
  for (const k of ['5', '0', '1']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await expect(save).toBeDisabled();
  await shotOn(page, '2.0c', 'v-b-501');
  // swipe away instead of Close
  await dragDown(page, sheet);
  await expect(sheet).toHaveCount(0);
  await expect(row).not.toContainText('Checked');
  await row.tap();
  await expect(sheet.getByTestId('wheel-total')).toContainText('53');
  await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByTestId('import-confirm').tap();
  await expect(page).toHaveURL(/#\/settings$/);
  const s = await sets(page);
  expect(s.map((x) => [x.load?.total, x.load?.unit])).toEqual([[53, 'lb']]);
  expect(errors).toEqual([]);
});

test('D1: localStorage getter throws: draft, its clear, rest and an added row reach IndexedDB kv and survive a restart @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }));
  await d(page, errors);
});
test('D2: the stamp write fails (timestamp key throws) but localStorage works: same durability @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === 'anygym-durable-at') throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  });
  await d(page, errors);
});
async function d(page: Page, errors: string[]) {
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, GOB);
  await typeWeight(page, view, 0, '53');
  await fillReps(view, todo(view).first(), 17);
  await view.getByRole('button', { name: '+ Add set' }).tap();
  const rows = await todo(view).count();
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await fillReps(view, todo(view).first(), 11);
  await expect.poll(async () => (await kv(page, 'anygym-drafts')) ?? '').toMatch(/"reps":11/);
  await expect.poll(async () => (await kv(page, 'anygym-rest')) ?? '').toContain('endsAt');
  await expect.poll(async () => (await kv(page, 'anygym-extra-sets')) ?? '').not.toBe('');
  await page.reload();
  const again = exerciseView(page, GOB);
  await expect(loggedRows(again)).toHaveCount(1);
  await expect(todo(again)).toHaveCount(rows - 1);
  await expect(todo(again).first().getByTestId('reps-cell')).toHaveText('11');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  // Finish: every durable key is cleared (null row) and nothing resurrects after a restart.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect.poll(async () => await kv(page, 'anygym-rest')).toBeNull();
  await expect.poll(async () => await kv(page, 'anygym-drafts')).toBeNull();
  await expect.poll(async () => await kv(page, 'anygym-extra-sets')).toBeNull();
  await page.reload();
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  expect(errors).toEqual([]);
}

test('G: Finish then Undo on Today restores a pending weight edit and added row exactly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, GOB);
  await typeWeight(page, view, 0, '53');
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await typeWeight(page, view, 0, '35', true);
  await fillReps(view, todo(view).first(), 13);
  await view.getByRole('button', { name: '+ Add set' }).tap();
  const n = await todo(view).count();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await page.getByTestId(`row-${GOB}`).tap();
  const back = exerciseView(page, GOB);
  await expect(loggedRows(back)).toHaveCount(1);
  await expect(todo(back)).toHaveCount(n);
  await expect(todo(back).first().getByTestId('weight-cell')).toHaveText('35');
  await expect(todo(back).first().getByTestId('reps-cell')).toHaveText('13');
  await shotOn(page, '2.0c', 'v-g-undo');
  expect(errors).toEqual([]);
});

test('H: rest kv read throws -> the workout opens with an empty rest, no crash @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, GOB);
  await typeWeight(page, view, 0, '53');
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect.poll(async () => (await kv(page, 'anygym-rest')) ?? '').toContain('endsAt');
  // Both copies unreadable: localStorage getItem throws for the rest key and the kv table read fails.
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (this: Storage, k: string) {
      if (k === 'anygym-rest') throw new DOMException('x', 'SecurityError');
      return get.call(this, k);
    };
    const orig = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...a: Parameters<IDBObjectStore['get']>) {
      if (this.name === 'kv') throw new DOMException('read failed', 'UnknownError');
      return orig.apply(this, a);
    };
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /Something went wrong/i })).toHaveCount(0);
  await expect(page.getByTestId(`exercise-${GOB}`).or(page.getByTestId(`row-${GOB}`))).toBeVisible();
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  expect(errors.filter((e) => !/read failed|UnknownError/.test(e))).toEqual([]);
});

test('I: a failed Edit set write outstanding: Finish refuses with a retry, Try again saves once @matrix', async ({ page }) => {
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
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQ);
  await view.getByTestId('weight-cell').first().tap();
  await sheetOf(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheetOf(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const before = (await sets(page))[0]!.reps!;
  await loggedRows(view).first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await page.evaluate(() => void ((window as unknown as { __fail: boolean }).__fail = true));
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(page.getByText('Could not save that')).toBeVisible();
  expect((await sets(page))[0]!.reps).toBe(before); // the write really failed
  await dragDown(page, edit); // the user gives up on the sheet; the change stays outstanding
  await expect(edit).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const unsaved = page.getByRole('dialog', { name: /not saved/ });
  await expect(unsaved).toBeVisible();
  await shotOn(page, '2.0c', 'v-i-refuses');
  await expect(page).not.toHaveURL(/\/done$/);
  await unsaved.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const s = await sets(page);
  expect(s).toHaveLength(1);
  expect(s[0]!.reps).toBe(before + 1);
  expect(errors.filter((e) => !/disk full|QuotaExceeded/.test(e))).toEqual([]);
});

test('J: log row 3, rows 1 and 2 keep their pending weights and reps (also after reload) @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, GOB);
  await typeWeight(page, view, 0, '53');
  await expect(todo(view)).toHaveCount(3);
  await typeWeight(page, view, 1, '35', true);
  await fillReps(view, todo(view).nth(0), 17);
  await fillReps(view, todo(view).nth(1), 12);
  await fillReps(view, todo(view).nth(2), 9);
  const snap = async (v: Locator) => Promise.all([0, 1].map(async (i) => [await todo(v).nth(i).getByTestId('weight-cell').textContent(), await todo(v).nth(i).getByTestId('reps-cell').textContent()]));
  const w2 = await todo(view).nth(2).getByTestId('weight-cell').textContent();
  await page.waitForTimeout(400);
  await todo(view).nth(2).getByTestId('check').tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(todo(view)).toHaveCount(2);
  expect(await snap(view)).toEqual([['53', '17'], ['35', '12']]);
  const logged = (await sets(page))[0]!;
  expect([logged.reps, String(logged.load?.total)]).toEqual([9, w2]);
  await shotOn(page, '2.0c', 'v-j');
  await page.reload();
  expect(await snap(exerciseView(page, GOB))).toEqual([['53', '17'], ['35', '12']]);
  expect(errors).toEqual([]);
});

test('Data sweep: totals = sumLoad, orders increase, no duplicates or orphans, journal and mutations empty @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQ);
  await view.getByTestId('weight-cell').first().tap();
  await sheetOf(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheetOf(page).getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await sheetOf(page).getByRole('button', { name: 'Done', exact: true }).tap();
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(400);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i);
  }
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const s = await sets(page);
  const sessions = await dbAll<{ id: string }>(page, 'sessions');
  expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  const ids = new Set(sessions.map((x) => x.id));
  for (const x of s) {
    expect(ids.has(x.sessionId)).toBe(true);
    const l = x.load!;
    expect(l.total).toBe(sumLoad({ bar: l.barWeight ?? null, perSide: l.perSide!, collars: 'none', unit: l.unit }).total! + (l.collars ?? 0));
    expect(l.total).toBe(155);
  }
  for (let i = 1; i < s.length; i++) expect(s[i]!.order).toBeGreaterThan(s[i - 1]!.order);
  expect(await dbAll(page, 'journal')).toHaveLength(0);
  expect(errors).toEqual([]);
});
