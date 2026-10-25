import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// Independent verification of PLAN 1.7k (tester).
const SQUAT = 'barbell-back-squat';
type S = { id: string; order: number; sessionId: string; reps?: number; kind: string; load?: { total: number } };
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Edit set' });
const sets = async (page: Page) => (await dbAll<S>(page, 'sets')).sort((a, b) => a.order - b.order);

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

test('(a) failed Undo acceptance: two restarts past 5 s keep the tombstone, Finish refuses, restored once when the write works', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  // While window.name is 'idb-fails', puts into tombstones and sets are rejected (survives reloads of the tab).
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (window.name === 'idb-fails' && (this.name === 'tombstones' || this.name === 'sets')) throw new DOMException('boom', 'DataError');
      return put.apply(this, a);
    } as typeof put;
  });
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  const original = (await sets(page))[0]!;
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.evaluate(() => { window.name = 'idb-fails'; });
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByText('Could not bring that set back')).toBeVisible();
  expect(await dbAll(page, 'tombstones')).toHaveLength(1);
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(5600);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await dbAll(page, 'tombstones')).toHaveLength(1);
    expect(await sets(page)).toHaveLength(1);
  }
  await page.waitForTimeout(5600);
  // Finish refuses while the write still fails.
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Undo did not finish' });
  await expect(sheet).toBeVisible();
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);
  expect(await dbAll(page, 'tombstones')).toHaveLength(1);
  // The write works again: a restart restores the set once.
  await page.evaluate(() => { window.name = ''; });
  await page.reload();
  await expect.poll(async () => (await sets(page)).length).toBe(2);
  await expect.poll(async () => (await dbAll(page, 'tombstones')).length).toBe(0);
  const after = await sets(page);
  expect(after.filter((s) => s.id === original.id)).toHaveLength(1);
  expect(after.find((s) => s.id === original.id)).toEqual(original);
  expect((await dbAll<{ key: string }>(page, 'kv')).filter((k) => k.key.startsWith('anygym-undo:'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect((await sets(page)).length).toBe(2);
  expect(await dbAll(page, 'journal')).toHaveLength(0);
  expect(errors.filter((e) => !/boom|DataError/.test(e))).toEqual([]);
});

// ---- (d) crash payloads carry no error text ----
import { allowConsoleErrors } from './fixtures';
import { mockReportApi } from './helpers/reportApi';

const SENTENCE = 'account alice smith at 14 oak street failed';
const PERSONAL = /alice|oak|account|street/i;

test('(d) crash with a personal sentence: queued and transmitted payloads hold only an approved name, "details hidden" and a script location', async ({ page, context }) => {
  allowConsoleErrors(/alice|details hidden|account/i);
  const sent = await mockReportApi(context);
  await page.goto('./#/history');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate((m) => {
    window.setTimeout(() => { throw new Error(m); });
    window.setTimeout(() => { const e = new TypeError(m); e.name = 'alice smith'; throw e; }, 20);
    window.setTimeout(() => { throw m; }, 40);
    window.setTimeout(() => { void Promise.reject(new RangeError(m)); }, 60);
    window.setTimeout(() => { console.error(m); }, 80);
  }, SENTENCE);
  await page.waitForTimeout(2500);
  // Everything held on the phone while offline (localStorage and every IndexedDB store).
  const dump = await page.evaluate(async () => {
    const out: string[] = [JSON.stringify({ ...localStorage })];
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('anygym'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    for (const name of Array.from(db.objectStoreNames)) {
      const all: unknown[] = await new Promise((res) => { const q = db.transaction(name).objectStore(name).getAll(); q.onsuccess = () => res(q.result); });
      out.push(JSON.stringify(all));
    }
    db.close();
    return out.join('\n');
  });
  expect(dump).not.toMatch(PERSONAL);
  await context.setOffline(false);
  await page.reload();
  await page.waitForTimeout(3000);
  // Also a crash while online, plus a user report afterwards (diagnostics: last 20 app errors).
  await page.evaluate((m) => { window.setTimeout(() => { throw new Error(m); }); }, SENTENCE);
  await page.waitForTimeout(1500);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('Alice Smith (alice@example.com) lives at 14 Oak Street');
  await sheet.getByTestId('report-send').tap();
  await expect.poll(() => sent.some((s) => s.path === '/feedback')).toBe(true);
  const crashes = sent.filter((s) => s.path === '/crash');
  expect(crashes.length).toBeGreaterThan(0);
  for (const c of crashes) {
    const b = c.body as Record<string, string>;
    expect(JSON.stringify(c.body), JSON.stringify(c.body)).not.toMatch(PERSONAL);
    expect(b.message).toMatch(/^[A-Za-z]+Error: details hidden( at [\w.-]+\.js:\d+:\d+)?$|^Error: details hidden/);
  }
  const fb = sent.find((s) => s.path === '/feedback')!;
  // The user's own text is the one free text field and goes as typed (SPEC 24); it is masked only in the phone push (Worker).
  const { message: userText, ...rest } = fb.body as Record<string, unknown>;
  expect(userText).toBe('Alice Smith (alice@example.com) lives at 14 Oak Street');
  const fbJson = JSON.stringify(rest);
  // The sentence of the crashes never rides along in the diagnostics (last app errors).
  expect(fbJson).not.toMatch(/alice|oak|street|account/i);
  console.log('FEEDBACK', fbJson.slice(0, 1200));
  console.log('CRASH0', JSON.stringify(crashes[0]!.body));
});

// ---- (c) row editors target their own row when an earlier row commits while open ----
import { addIdbSeams, heldWrites, holdNextSetWrite, releaseSetWrite } from './helpers/idb';

for (const kind of ['weight', 'type'] as const) {
  test(`(c) ${kind} sheet opened on row 2 while row 1's write is held: after release only row 2 changes`, async ({ page }) => {
    const errors = watchErrors(page);
    await addIdbSeams(page);
    const view = await squat135(page);
    await page.waitForTimeout(450);
    await holdNextSetWrite(page);
    await checkCurrent(view).tap(); // row 1 ✓, its write stays open
    await expect.poll(() => heldWrites(page)).toBe(1);
    const todo = view.getByTestId('set-todo');
    if (kind === 'weight') {
      await todo.nth(1).getByTestId('weight-cell').tap(); // row 2 of 3 (index 1 among the unlogged rows)
      await weightSheet(page).getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
    } else {
      await todo.nth(1).getByTestId('set-type').tap();
      await expect(page.getByRole('dialog', { name: 'Set type' })).toBeVisible();
    }
    await releaseSetWrite(page);
    await expect.poll(async () => (await sets(page)).length).toBe(1);
    await expect(loggedRows(view)).toHaveCount(1);
    if (kind === 'weight') await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
    else await page.getByRole('dialog', { name: 'Set type' }).getByTestId('set-type-drop').tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Row 1 (logged) 135; rows 2 and 3 are the two to do: which of them changed is the question.
    const weights = await view.getByTestId('weight-cell').allInnerTexts();
    const chips = await view.getByTestId('set-type-chip').allInnerTexts();
    console.log(kind, 'weights', weights.join(','), 'chips', chips.join(','));
    // Baseline (no held write): row 2 at 155 makes the later row 3 follow to 155. A (logged) stays 135.
    if (kind === 'weight') expect(weights.map((w) => w.trim())).toEqual(['155', '155']);
    else {
      expect(chips).toEqual(['Drop set']);
      await expect(todo.nth(0).getByTestId('set-type-chip')).toHaveText('Drop set'); // old row 2 is now the first to do
      await expect(todo.nth(1).getByTestId('set-type-chip')).toHaveCount(0);
    }
    await page.reload();
    const t2 = exerciseView(page, SQUAT).getByTestId('set-todo');
    if (kind === 'weight') await expect(t2.nth(0).getByTestId('weight-cell')).toHaveText('155');
    else {
      await expect(t2.nth(0).getByTestId('set-type-chip')).toHaveText('Drop set');
      await expect(t2.nth(1).getByTestId('set-type-chip')).toHaveCount(0);
    }
    const s = await sets(page);
    expect(s).toHaveLength(1);
    expect(s[0]!.load?.total).toBe(135);
    expect(s[0]!.kind).toBe('work');
    expect(errors).toEqual([]);
  });
}

// ---- (e) Report sheet generations ----
const SENT = 'Sent. Thanks, this goes straight to the builder.';
test('(e) Send, close while pending, reopen, type: the old completion never shows Sent for the new text', async ({ page, context }) => {
  const sent = await mockReportApi(context);
  await page.addInitScript(() => {
    const inner = window.fetch.bind(window);
    let held = false;
    const w = window as unknown as { __rel?: () => void; __held?: boolean };
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!held && url.endsWith('/feedback')) {
        held = true;
        await new Promise<void>((r) => { w.__rel = r; w.__held = true; });
      }
      return inner(input, init);
    };
  });
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  let sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('old text');
  await sheet.getByTestId('report-send').tap();
  await page.waitForFunction(() => (window as unknown as { __held?: boolean }).__held === true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await sheet.getByTestId('report-text').fill('new text');
  await page.evaluate(() => (window as unknown as { __rel: () => void }).__rel());
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(600);
  await expect(sheet.getByText(SENT, { exact: true })).toHaveCount(0);
  await expect(sheet.getByTestId('report-text')).toHaveValue('new text');
  await expect(sheet.getByTestId('report-send')).toBeEnabled();
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByText(SENT, { exact: true })).toBeVisible();
  expect(sent.map((s) => s.body.message)).toEqual(['old text', 'new text']);
});

// ---- (f) + Add set with localStorage throwing ----
test('(f) + Add set while localStorage throws survives a restart', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (window.name === 'ls-throws' && k.startsWith('anygym-draft')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  });
  const view = await squat135(page);
  await page.evaluate(() => { window.name = 'ls-throws'; });
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await page.waitForTimeout(800);
  await page.reload();
  await expect(exerciseView(page, SQUAT).getByTestId('set-todo')).toHaveCount(4);
  await page.reload();
  await expect(exerciseView(page, SQUAT).getByTestId('set-todo')).toHaveCount(4);
  expect(errors).toEqual([]);
});

// ---- (h) Keep it deleted after automatic recovery; Edit blocked once Finish starts ----
test('(h) Keep it deleted after an automatic recovery put the set back: the set ends deleted', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (window.name === 'idb-fails' && this.name === 'tombstones') throw new DOMException('boom', 'DataError');
      return put.apply(this, a);
    } as typeof put;
  });
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.evaluate(() => { window.name = 'idb-fails'; });
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByText('Could not bring that set back')).toBeVisible();
  // Finish refuses (undo unresolved) and the sheet is up...
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Undo did not finish' });
  await expect(sheet).toBeVisible();
  // ...meanwhile the storage works again and an automatic recovery (another tab, here: reload in a second page) restores the set.
  await page.evaluate(() => { window.name = ''; });
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect.poll(async () => (await sets(other)).length).toBe(2);
  await other.close();
  await sheet.getByRole('button', { name: 'Keep it deleted' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect(await sets(page)).toHaveLength(1);
  expect(await dbAll(page, 'tombstones')).toHaveLength(0);
  expect(errors.filter((e) => !/boom|DataError/.test(e))).toEqual([]);
});

// ---- 3. data sweep after a clean flow ----
test('(3) data sweep: totals equal sumLoad, orders increase, no duplicate ids, no orphans, journal empty', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await logOne(view);
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(3);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.waitForTimeout(800);
  const all = async (n: string) => dbAll<any>(page, n);
  const ss = (await all('sets')) as Array<{ id: string; sessionId: string; order: number; load?: any }>;
  const sessions = await all('sessions');
  expect(ss).toHaveLength(3);
  expect(new Set(ss.map((s) => s.id)).size).toBe(ss.length);
  const sessIds = new Set(sessions.map((s: any) => s.id));
  for (const s of ss) expect(sessIds.has(s.sessionId)).toBe(true); // no orphans
  const orders = ss.sort((a, b) => a.order - b.order).map((s) => s.order);
  for (let i = 1; i < orders.length; i++) expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
  for (const s of ss) {
    const l = s.load;
    const perSide: number[] = l.perSide ?? [];
    // total = bar + 2 x sum(perSide) + collars (collars 'none' here: 0)
    expect(l.total).toBe(l.barWeight + 2 * perSide.reduce((a: number, b: number) => a + b, 0) + (l.collars ?? 0));
    expect(l.total).toBe(135);
  }
  expect(await all('journal')).toHaveLength(0);
  expect(await all('tombstones')).toHaveLength(0);
  expect((await all('kv')).filter((k: any) => String(k.key).startsWith('anygym-undo:'))).toHaveLength(0);
  expect(sessions.every((s: any) => s.endedAt !== undefined)).toBe(true);
  expect(errors).toEqual([]);
});

// ---- screenshots of touched screens ----
test('shots: kettlebell exact entry, Undo did not finish sheet, report sheet', async ({ page }) => {
  const prof = test.info().project.name.replace(/ /g, '-');
  const snap = async (n: string) => { await page.waitForTimeout(500); await page.screenshot({ path: `reports/shots/1.7k/${n}-${prof}.png` }); };
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const kv = exerciseView(page, 'kettlebell-goblet-squat');
  await kv.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  for (const k of ['5', '3']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await snap('kettlebell-picker');
  const tgt = await sheet.getByRole('button', { name: 'Done' }).boundingBox();
  expect(tgt!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await snap('kettlebell-row');
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  await page.getByRole('dialog', { name: 'Report a problem' }).getByTestId('report-text').fill('Timer froze');
  await snap('report-sheet');
});
