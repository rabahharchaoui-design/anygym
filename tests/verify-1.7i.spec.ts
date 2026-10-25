import { expect, test, type Locator, type Page } from './fixtures';
import type { Gym, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';

// Independent verification of PLAN 1.7i (tester): the data rules, hand driven.

const SQUAT = 'barbell-back-squat';
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Edit set' });
const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
const activeGym = async (page: Page) => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.7i/${test.info().project.name.replace(/ /g, '-')}-${name}.png` });
};

async function squat135(page: Page) {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQUAT);
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  return view;
}
async function logOne(view: Locator) {
  const before = await loggedRows(view).count();
  await view.page().waitForTimeout(450);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}

for (const stale of [false, true]) test(`(a) add fails AND localStorage throws (${stale ? 'stale pre failure draft kept' : 'all drafts lost'}): reload, failed row visible, Finish refuses, Try again saves once`, async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __failAdd?: boolean };
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'sets' && w.__failAdd) throw new DOMException('boom', 'DataError');
      return add.apply(this, a);
    } as typeof add;
    // localStorage writes of the drafts throw for the whole life of this tab (survives reload via window.name).
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (window.name === 'ls-throws' && k === 'anygym-drafts') throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    };
  });
  const view = await squat135(page);
  await page.evaluate(() => {
    window.name = 'ls-throws';
    (window as unknown as { __failAdd: boolean }).__failAdd = true;
  });
  await page.waitForTimeout(450);
  const reps = await view.getByTestId('reps-cell').first().textContent();
  await checkCurrent(view).tap();
  await expect(page.getByText('Could not save that set')).toBeVisible();
  await shot(page, 'a-failed');
  expect(await sets(page)).toHaveLength(0);
  expect(await dbAll(page, 'journal')).toHaveLength(1);
  // Lose the IndexedDB mirror of the drafts too: only the journal can bring the row back.
  await page.evaluate(() => new Promise<void>((res) => {
    const r = indexedDB.open('anygym');
    r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').delete('anygym-drafts'); tx.oncomplete = () => { r.result.close(); res(); }; };
  }));
  await page.evaluate(() => (window as unknown as { __failAdd: boolean }).__failAdd = false);
  if (!stale) await page.evaluate(() => localStorage.removeItem('anygym-drafts'));
  await page.reload();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  await expect(view.getByTestId('reps-cell').first()).toHaveText(reps!);
  await expect(loggedRows(view)).toHaveCount(0);
  await expect(view.getByTestId('weight-cell')).toHaveCount(3);
  await shot(page, 'a-reloaded');
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Set not saved' });
  await expect(sheet.getByRole('heading')).toHaveText('1 set did not save');
  await shot(page, 'a-finish-refuses');
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);
  await sheet.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const after = await sets(page);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ reps: Number(reps), load: { total: 135 } });
  expect(await dbAll(page, 'journal')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('(b) Undo acceptance write fails: Finish refuses, tombstone kept, retry restores the exact record', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  const original = (await sets(page))[0]!;
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.evaluate(() => {
    const w = window as unknown as { __failPut: boolean };
    w.__failPut = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'tombstones' && w.__failPut) { w.__failPut = false; throw new DOMException('boom', 'DataError'); }
      return put.apply(this, a);
    } as typeof put;
  });
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByText('Could not bring that set back')).toBeVisible();
  await shot(page, 'b-undo-failed');
  expect(await sets(page)).toHaveLength(1);
  expect(await dbAll(page, 'tombstones')).toHaveLength(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Undo did not finish' });
  await expect(sheet).toBeVisible();
  await shot(page, 'b-finish-refuses');
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);
  expect(await dbAll(page, 'tombstones')).toHaveLength(1);
  await sheet.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const after = (await sets(page));
  expect(after).toHaveLength(2);
  expect(after.find((s) => s.id === original.id)).toEqual(original);
  expect(await dbAll(page, 'tombstones')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('(b2) Undo failed, user keeps it deleted: finishes without it, no tombstone left', async ({ page }) => {
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('dialog').or(editSheet(page)).getByRole('button', { name: 'Delete set' }).tap();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let once = true;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'tombstones' && once) { once = false; throw new DOMException('boom', 'DataError'); }
      return put.apply(this, a);
    } as typeof put;
  });
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByText('Could not bring that set back')).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('dialog', { name: 'Undo did not finish' }).getByRole('button', { name: 'Keep it deleted' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect(await sets(page)).toHaveLength(1);
  expect(await dbAll(page, 'tombstones')).toHaveLength(0);
});

test('(i) Finish then Undo on Today: a set logged then deleted before Finish is not offered as not saved', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  const ids = (await sets(page)).map((s) => s.id);
  await loggedRows(view).nth(1).getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect(await sets(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.waitForTimeout(1200);
  await shot(page, 'i-after-undo-finish');
  await expect(page.getByRole('dialog', { name: 'Set not saved' })).toHaveCount(0);
  await expect(page.getByText(/did not save/)).toHaveCount(0);
  // The deleted set is still gone, and a Finish does not ask about it either.
  expect((await sets(page)).map((s) => s.id)).toEqual([ids[0]]);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.getByText(/did not save/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect((await sets(page)).map((s) => s.id)).toEqual([ids[0]]);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------- (c) (f)

async function toKgAndResume(page: Page) {
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).tap();
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await activeGym(page)).unit).toBe('kg');
  await page.locator('[aria-label="Back to Today"]').first().tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: /^Resume\b/ }).first().tap();
}
const pad = async (scope: Locator, v: string) => {
  for (const d of v) await scope.getByRole('button', { name: d, exact: true }).tap();
};

test('(c) pending 135 lb on a barbell and +25 lb on bodyweight survive minimize, kg, Resume (and reload) as themselves', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['wide grip pull', 'Wide Grip Pull Up']]);
  const squat = exerciseView(page, SQUAT);
  await page.getByTestId(`row-${SQUAT}`).tap();
  await squat.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(squat.getByTestId('weight-cell').first()).toHaveText('135');
  const pull = exerciseView(page, 'wide-grip-pull-up');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-wide-grip-pull-up').tap();
  await pull.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add weight', exact: true }).tap();
  const add = page.getByRole('dialog', { name: 'Add weight', exact: true });
  await pad(add.getByRole('group', { name: 'Added weight', exact: true }), '25');
  await add.getByRole('button', { name: 'Done', exact: true }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(pull.getByTestId('weight-cell').first()).toHaveText('+25');

  await toKgAndResume(page);
  const check = async () => {
    const back = page.getByRole('button', { name: 'Back to the list' });
    if (await back.isVisible()) await back.tap();
    await page.getByTestId(`row-${SQUAT}`).tap();
    await expect(squat.getByTestId('weight-cell').first()).toHaveText('135 lb');
    await expect(squat.getByTestId('set-status')).toHaveText('Set 1: Picked in lb. Pick again');
    await expect(checkCurrent(squat)).toBeDisabled();
    await shot(page, 'c-squat');
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByTestId('row-wide-grip-pull-up').tap();
    const cell = await pull.getByTestId('weight-cell').first().innerText();
    expect(cell, 'a +25 lb draft must not read as plain bodyweight').toMatch(/25/);
    expect(cell).toMatch(/lb/);
    const label = (await checkCurrent(pull).getAttribute('aria-label')) ?? '';
    console.log('BW cell:', JSON.stringify(cell), 'check:', label, 'enabled:', await checkCurrent(pull).isEnabled());
    expect(label).not.toMatch(/^Log set 1: 8 reps$/);
    await shot(page, 'c-bodyweight');
  };
  await check();
  await page.reload();
  await check();
  expect(await sets(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('(f) log 135 lb, gym to kg, resume: saved row says 135 lb under the kg heading, storage unchanged; single under an each heading says total', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(view);
  const stored = (await sets(page))[0]!;
  await toKgAndResume(page);
  await page.getByTestId(`row-${SQUAT}`).tap();
  await expect(loggedRows(view).first().getByTestId('saved-weight')).toHaveText('135 lb');
  await shot(page, 'f-135lb-under-kg');
  await page.reload();
  await expect(loggedRows(view).first().getByTestId('saved-weight')).toHaveText('135 lb');
  expect((await sets(page))[0]).toEqual(stored);
  expect(errors).toEqual([]);
});

test('(f2) a saved single weight under a dumbbell each heading says total', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, 'kettlebell-goblet-squat');
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('option', { name: '50 lb', exact: true }).tap();
  await page.waitForTimeout(800);
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await logOne(view);
  const saved = (await sets(page))[0]!;
  expect(saved.load).toMatchObject({ kind: 'single', total: 50 });
  await dbPut(page, { exerciseSettings: [{ exerciseId: 'kettlebell-goblet-squat', gymId: '', loadType: 'dumbbell_each' }] });
  await page.reload();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await expect(view.getByText(/^lb each$/i).first()).toBeVisible();
  await shot(page, 'f2-total');
  await expect(loggedRows(view).first().getByTestId('saved-weight')).toHaveText('50 total');
  expect((await sets(page))[0]).toEqual(saved);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------- (d)

const freezeSettle = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __realST?: typeof setTimeout };
    w.__realST ??= window.setTimeout;
    const real = w.__realST;
    window.setTimeout = (((fn: TimerHandler, ms?: number, ...rest: unknown[]) => (ms !== undefined && ms >= 60 && ms <= 200 ? 0 : real(fn, ms, ...rest))) as typeof window.setTimeout);
  });
const unfreeze = (page: Page) => page.evaluate(() => { const w = window as unknown as { __realST?: typeof setTimeout }; if (w.__realST) window.setTimeout = w.__realST; });
const scrollWheelTo = (sheet: Locator, label: string) =>
  sheet.getByRole('listbox').evaluate((el, name) => {
    const options = [...el.querySelectorAll('[role="option"]')];
    const i = options.findIndex((o) => o.getAttribute('aria-label') === name);
    el.scrollLeft = i * 68;
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, label);

for (const [what, query, name, id, each] of [
  ['dumbbells (each)', 'bicep curl', 'Dumbbell Bicep Curl', 'bicep-curl', true],
  ['one weight', 'goblet', 'Kettlebell Goblet Squat', 'kettlebell-goblet-squat', false],
] as const) {
  test(`(d) ${what}: scroll 30 to 50 and Done at once with the debounce frozen saves the readout; Edit Save too`, async ({ page }) => {
    const errors = watchErrors(page);
    await quickWith(page, [[query, name]]);
    const view = exerciseView(page, id);
    await view.getByTestId('weight-cell').first().tap();
    const sheet = weightSheet(page);
    await sheet.getByRole('option', { name: '30 lb', exact: true }).tap();
    await page.waitForTimeout(900);
    await freezeSettle(page);
    await scrollWheelTo(sheet, '50 lb');
    await expect(sheet.getByTestId('wheel-total')).toHaveText('50lb');
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await expect(view.getByTestId('weight-cell').first()).toHaveText('50');
    await unfreeze(page);
    await logOne(view);
    expect((await sets(page))[0]!.load).toMatchObject({ kind: each ? 'dumbbell_each' : 'single', total: each ? 100 : 50 });
    await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
    const edit = editSheet(page);
    await page.waitForTimeout(900);
    await freezeSettle(page);
    await scrollWheelTo(edit, '40 lb');
    await expect(edit.getByTestId('wheel-total')).toHaveText('40lb');
    await edit.getByRole('button', { name: 'Save' }).tap();
    await expect(edit).toHaveCount(0);
    expect((await sets(page))[0]!.load).toMatchObject({ total: each ? 80 : 40 });
    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------- (e)

test('(e) stack progression compares TOTAL: 100 + 25 beats 110 + 0; kg gym with a 2.5 kg stack suggests 57.5 kg quoting 125 lb', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const stack = (pin: number, added: number) => ({ kind: 'stack', unit: 'lb', stackValue: pin, ...(added ? { added } : {}), total: pin + added });
  await seedFinished(page, { 'leg-extension': [{ reps: 10, load: stack(100, 25) }, { reps: 10, load: stack(110, 0) }] });
  await quickWith(page, [['leg extension', 'Leg Extension']]);
  const view = exerciseView(page, 'leg-extension');
  const text = () => view.innerText();
  console.log('E lb view:', (await text()).replace(/\n+/g, ' | '));
  await expect(view.getByTestId('weight-cell').first()).toHaveText('125');
  await shot(page, 'e-lb');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await sets(page))[0]!.load).toMatchObject({ kind: 'stack', unit: 'lb', total: 125 });
  console.log('E lb logged load:', JSON.stringify((await sets(page))[0]!.load));
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  // A new workout, the gym now kg with a 2.5 kg stack step.
  const gym = await activeGym(page);
  await dbPut(page, { gyms: [{ ...gym, unit: 'kg', stackStep: 2.5 }] });
  await dbPut(page, { sessions: [] });
  // Make the 125 lb session the only past one: drop the logged one so last time is the seeded session.
  const mine = (await dbAll<{ id: string }>(page, 'sessions')).filter((x) => !x.id.startsWith('seed-'));
  await page.evaluate((ids) => new Promise<void>((res) => { const r = indexedDB.open('anygym'); r.onsuccess = () => { const tx = r.result.transaction(['sessions', 'sets'], 'readwrite'); for (const id of ids) tx.objectStore('sessions').delete(id); const q = tx.objectStore('sets').getAll(); q.onsuccess = () => { for (const st of q.result) if (ids.includes(st.sessionId)) tx.objectStore('sets').delete(st.id); }; tx.oncomplete = () => { r.result.close(); res(); }; }; }), mine.map((x) => x.id));
  await quickWith(page, [['leg extension', 'Leg Extension']]);
  await page.waitForTimeout(600);
  console.log('E kg view:', (await text()).replace(/\n+/g, ' | '));
  await shot(page, 'e-kg');
  await expect(view.getByTestId('weight-cell').first()).toHaveText('57.5');
  expect(await text()).toMatch(/125 lb/);
  const sn = view.getByTestId('set-next');
  if (await sn.count()) console.log('E kg set-next:', await sn.innerText());
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------- (g)

const COUNTS = ['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones', 'journal', 'kv'];
const counts = async (page: Page) => Object.fromEntries(await Promise.all(COUNTS.map(async (t) => [t, JSON.stringify(await dbAll(page, t))])));

test('(g) Restore whose drafts cannot be stored (localStorage throws, kv put fails): reports failure, nothing changes; retry works', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; text: string }; __failKv?: boolean; __failLs?: boolean };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', { value: async (d: { files: File[] }) => { w.__shared = { name: d.files[0]!.name, text: await d.files[0]!.text() }; }, configurable: true });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'kv' && w.__failKv) throw new DOMException('boom', 'DataError');
      return put.apply(this, a);
    } as typeof put;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (w.__failLs && k === 'anygym-drafts') throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    };
  });
  // A workout in progress with a pending draft, backed up from Settings, then finished.
  const view = await squat135(page);
  await logOne(view);
  await page.goto('./#/settings');
  await page.getByTestId('backup').tap();
  await expect(page.getByText('Backup ready').first()).toBeVisible();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared);
  const file = JSON.parse(shared.text);
  expect(Object.keys(file.drafts).length).toBeGreaterThan(0);
  await page.goto('./');
  await page.getByRole('button', { name: /^Resume\b/ }).first().tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.goto('./#/settings');
  const before = await counts(page);
  await page.evaluate(() => Object.assign(window, { __failKv: true, __failLs: true }));
  await page.getByTestId('restore-file').setInputFiles({ name: shared.name, mimeType: 'application/json', buffer: Buffer.from(shared.text) });
  await page.getByTestId('restore-replace').tap();
  await page.waitForTimeout(500);
  await page.getByTestId('restore-replace').tap();
  await page.waitForTimeout(1200);
  await shot(page, 'g-failed');
  await expect(page.getByText('Could not restore. Nothing was changed. Try again.')).toBeVisible();
  expect(await counts(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('anygym-drafts'))).toBeNull();
  // Once storage works again the same file restores, with its drafts.
  await page.evaluate(() => Object.assign(window, { __failKv: false, __failLs: false }));
  await page.getByTestId('restore-replace').tap();
  await page.waitForTimeout(500);
  await page.getByTestId('restore-replace').tap();
  await page.waitForTimeout(1200);
  const drafts = await page.evaluate(() => localStorage.getItem('anygym-drafts'));
  expect(drafts).not.toBeNull();
  expect(errors.filter((e) => !/boom|DataError|full/i.test(e))).toEqual([]);
});

// ---------------------------------------------------------------------------------- (h)

test('(h) old stack set after the step changed: Save works, stored load unchanged', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['leg extension', 'Leg Extension']]);
  const view = exerciseView(page, 'leg-extension');
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('radio', { name: 'Pin at 15 lb' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await logOne(view);
  const saved = (await sets(page))[0]!;
  const gym = await activeGym(page);
  await dbPut(page, { gyms: [{ ...gym, equipmentWeights: { ...gym.equipmentWeights, 'leg-extension': { kind: 'stack_step', value: 10 } } }] });
  await page.reload();
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  const edit = editSheet(page);
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await shot(page, 'h-edit');
  await expect(edit.getByRole('button', { name: 'Save' })).toBeEnabled();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  const after = (await sets(page))[0]!;
  expect(after.reps).toBe(saved.reps! + 1);
  expect(after.load).toEqual(saved.load);
  expect(errors).toEqual([]);
});
