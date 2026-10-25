import { expect, test, type Locator, type Page } from './fixtures';
import type { Gym, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// PLAN 1.7i, the UI half (Codex reports bughunt-1025-*): the journal across a restart, pending
// loads across a unit switch or a turned off plate, saved rows in their own unit, the wheel's
// Done never ahead of its readout, and editing an old stack set after the step changed.

const SQUAT = 'barbell-back-squat';
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
const activeGym = async (page: Page) => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
const sessionIdOf = (page: Page) => new URL(page.url()).hash.split('/')[2]!;

async function squatWith(page: Page, plates: number[]) {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQUAT);
  await view.getByTestId('weight-cell').first().tap();
  for (const p of plates) await weightSheet(page).getByRole('button', { name: `Add ${p} lb plate to each side` }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(weightSheet(page)).toHaveCount(0);
  return view;
}

async function logOne(view: Locator) {
  const before = await loggedRows(view).count();
  await view.page().waitForTimeout(400); // past the double tap guard
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}

test('(1) a failed Log set survives a restart that lost its draft: visible, Finish refuses, Try again saves it once', async ({ page }) => {
  const errors = watchErrors(page);
  // Seams (never shipped): the next `sets` add and the drafts write fail on demand.
  await page.addInitScript(() => {
    const w = window as unknown as { __failSets?: boolean; __failDrafts?: boolean };
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'sets' && w.__failSets) {
        w.__failSets = false;
        throw new DOMException('disk full', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === 'anygym-drafts' && w.__failDrafts) throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    };
  });
  const view = await squatWith(page, [45]);
  const reps = Number(await view.getByTestId('reps-cell').first().textContent());
  await page.evaluate(() => Object.assign(window, { __failSets: true, __failDrafts: true }));
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(page.getByText('Could not save that set')).toBeVisible();
  expect(await sets(page)).toEqual([]);
  const journal = await dbAll<{ id: string; rev: number; draft: { reps: number; load: { total: number } } }>(page, 'journal');
  expect(journal).toHaveLength(1);
  expect(journal[0]!.draft).toMatchObject({ reps, load: { total: 135 } });

  // The restart loses every draft copy (localStorage and its IndexedDB mirror): only the journal is left.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        localStorage.removeItem('anygym-drafts');
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').delete('anygym-drafts');
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  await expect(view.getByTestId('reps-cell').first()).toHaveText(String(reps));

  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Set not saved' });
  await expect(sheet.getByRole('heading')).toHaveText('1 set did not save');
  await sheet.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect((await sets(page)).map((s) => [s.id, s.reps, s.load?.total])).toEqual([[journal[0]!.id, reps, 135]]);
  expect(await dbAll(page, 'journal')).toEqual([]);
  expect(errors).toEqual([]);
});

test('(4)(7) Settings to kg, Resume, reload: the pending 135 lb stays 135 lb and waits; the saved row says 135 lb', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squatWith(page, [45]);
  await logOne(view);
  const sid = sessionIdOf(page);
  // Settings → kg while the workout is minimized.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).tap();
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await activeGym(page)).unit).toBe('kg');
  await page.locator('[aria-label="Back to Today"]').first().tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: /^Resume\b/ }).first().tap();
  await page.getByTestId(`row-${SQUAT}`).tap();

  const check = async () => {
    // Saved: from its own record, labelled against the kg heading. Storage unchanged.
    await expect(loggedRows(view).first().getByTestId('saved-weight')).toHaveText('135 lb');
    expect((await sets(page))[0]!.load).toMatchObject({ unit: 'lb', total: 135, perSide: [45] });
    // Pending: kept as picked (never 45 kg plates, never 110 kg), not loggable until picked again.
    await expect(view.getByTestId('weight-cell').first()).toHaveText('135 lb');
    await expect(checkCurrent(view)).toBeDisabled();
    await expect(view.getByTestId('set-status')).toHaveText('Set 2: Picked in lb. Pick again');
  };
  await check();
  await page.reload();
  await check();
  const drafts = await page.evaluate((s) => JSON.parse(localStorage.getItem('anygym-drafts') ?? '{}')[s], sid);
  expect(Object.values(drafts as Record<string, { load: { unit: string; total: number } }>)[0]!.load).toMatchObject({ unit: 'lb', total: 135 });

  // Picking again in kg makes it loggable, in kg.
  await view.getByTestId('weight-cell').first().tap();
  await expect(weightSheet(page).getByRole('button', { name: /Add 45 lb/ })).toHaveCount(0);
  await weightSheet(page).getByRole('button', { name: 'Add 20 kg plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(checkCurrent(view)).toBeEnabled();
  await logOne(view);
  expect((await sets(page)).map((s) => [s.load?.unit, s.load?.total])).toEqual([['lb', 135], ['kg', 60]]);
  expect(errors).toEqual([]);
});

test('(4) a plate turned off after it was picked: the pending bar waits for a new pick, also after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squatWith(page, [45, 25]);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
  const gym = await activeGym(page);
  await dbPut(page, { gyms: [{ ...gym, plateInventory: gym.plateInventory.map((p) => (p.weight === 25 ? { ...p, enabled: false } : p)) }] });
  // Written straight to IndexedDB (no Settings screen for plates yet): the app reads it on reload.
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(view.getByTestId('set-status')).toHaveText('Set 1: A plate is turned off. Pick again');
    await expect(checkCurrent(view)).toBeDisabled();
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
  }
  expect(await sets(page)).toEqual([]);
  expect(errors).toEqual([]);
});

/** Freezes the wheel's settle timer (its 110 ms debounce never fires), as a fast thumb would. */
const freezeSettle = (page: Page, on = true) =>
  page.evaluate((freeze) => {
    const w = window as unknown as { __realSetTimeout?: typeof setTimeout };
    w.__realSetTimeout ??= window.setTimeout;
    const real = w.__realSetTimeout;
    window.setTimeout = freeze ? (((fn: TimerHandler, ms?: number, ...rest: unknown[]) => (ms === 110 ? 0 : real(fn, ms, ...rest))) as typeof window.setTimeout) : real;
  }, on);

/** Scrolls the wheel in the top sheet to `label` and fires its scroll event right away. */
const scrollWheelTo = (sheet: Locator, label: string) =>
  sheet.getByRole('listbox').evaluate((el, name) => {
    const options = [...el.querySelectorAll('[role="option"]')];
    const i = options.findIndex((o) => o.getAttribute('aria-label') === name);
    el.scrollLeft = i * 68;
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, label);

for (const [what, query, name, id, each] of [
  ['dumbbells', 'bicep curl', 'Dumbbell Bicep Curl', 'bicep-curl', true],
  // A dumbbell held as one weight (a kettlebell is typed exactly since PLAN 1.7k).
  ['one weight', 'single arm dumbbell row', 'Single Arm Dumbbell Row', 'single-arm-dumbbell-row', false],
] as const) {
  test(`(5) ${what}: Done right after a scroll, with the debounce frozen, saves the weight on the readout`, async ({ page }) => {
    const errors = watchErrors(page);
    await quickWith(page, [[query, name]]);
    const view = exerciseView(page, id);
    await view.getByTestId('weight-cell').first().tap();
    const sheet = weightSheet(page);
    await sheet.getByRole('option', { name: '30 lb', exact: true }).tap();
    await expect(sheet.getByTestId('wheel-total')).toHaveText('30lb');
    await page.waitForTimeout(800); // the tap's own glide has settled
    await freezeSettle(page);
    await scrollWheelTo(sheet, '50 lb');
    await expect(sheet.getByTestId('wheel-total')).toHaveText('50lb');
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await expect(view.getByTestId('weight-cell').first()).toHaveText('50');
    await logOne(view);
    expect((await sets(page))[0]!.load).toMatchObject({ kind: each ? 'dumbbell_each' : 'single', total: each ? 100 : 50 });

    // Edit's Save, the same way: 50 → 40 and Save at once.
    await freezeSettle(page, false);
    await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
    const edit = page.getByRole('dialog', { name: 'Edit set' });
    await expect(edit.getByTestId('wheel-total')).toHaveText('50lb');
    await page.waitForTimeout(800); // opened on 50 and settled
    await freezeSettle(page);
    await scrollWheelTo(edit, '40 lb');
    await expect(edit.getByTestId('wheel-total')).toHaveText('40lb');
    await edit.getByRole('button', { name: 'Save' }).tap();
    await expect(edit).toHaveCount(0);
    expect((await sets(page))[0]!.load).toMatchObject({ total: each ? 80 : 40 });
    expect(errors).toEqual([]);
  });
}

test('(12) an old stack set after the machine step changed: its reps can be edited, its own pin is kept and Save works', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['leg extension', 'Leg Extension']]);
  const view = exerciseView(page, 'leg-extension');
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('radio', { name: 'Pin at 15 lb' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await logOne(view);
  const saved = (await sets(page))[0]!;
  expect(saved.load).toMatchObject({ kind: 'stack', stackValue: 15, total: 15 });
  const gym = await activeGym(page);
  await dbPut(page, { gyms: [{ ...gym, equipmentWeights: { ...gym.equipmentWeights, 'leg-extension': { kind: 'stack_step', value: 10 } } }] });
  await page.reload();

  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit.getByTestId('stack-total')).toHaveText('15lb');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  const save = edit.getByRole('button', { name: 'Save' });
  await expect(save).toBeEnabled();
  await save.tap();
  await expect(edit).toHaveCount(0);
  const after = (await sets(page))[0]!;
  expect(after.reps).toBe(saved.reps! + 1);
  expect(after.load).toEqual(saved.load);
  expect(errors).toEqual([]);
});
