import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// Independent verification of PLAN 1.7h (tester). Real failing writes, no injected drafts.

type SetRow = { id: string; sessionId: string; order: number; reps?: number; seconds?: number; load: { kind: string; total: number; barId?: string; barWeight?: number } };
const SQUAT = 'barbell-back-squat';
const sets = async (page: Page) => (await dbAll<SetRow>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Edit set' });
const only = (names: string[]) => test.skip(!names.includes(test.info().project.name), 'profile');
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.7h/${test.info().project.name.replace(/ /g, '-')}-${name}.png` });
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
async function logOne(page: Page) {
  const view = exerciseView(page, SQUAT);
  const before = await loggedRows(view).count();
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}

test.beforeEach(() => only(['iPhone 15 Pro', 'iPhone SE']));

test('(a) real failing write: Finish refuses, Try again saves, Finish works', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(page);
  // The next sets add fails once.
  await page.evaluate(() => {
    const w = window as unknown as { __failOnce: boolean };
    w.__failOnce = true;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'sets' && w.__failOnce) {
        w.__failOnce = false;
        throw new DOMException('boom', 'DataError');
      }
      return add.apply(this, a);
    } as typeof add;
  });
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await page.waitForTimeout(600);
  expect(await sets(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Set not saved' });
  await expect(sheet.getByRole('heading')).toHaveText('1 set did not save');
  await shot(page, 'a-refuse');
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);
  await sheet.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const s = await sets(page);
  expect(s).toHaveLength(2);
  expect(new Set(s.map((x) => x.id)).size).toBe(2);
  expect(errors.filter((e) => !/boom/.test(e))).toEqual([]);
});

test('(a2) Finish without it discards only that set', async ({ page }) => {
  const view = await squat135(page);
  await logOne(page);
  await page.evaluate(() => {
    const w = window as unknown as { __fail: boolean };
    w.__fail = true;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'sets' && w.__fail) throw new DOMException('boom', 'DataError');
      return add.apply(this, a);
    } as typeof add;
  });
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Set not saved' })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __fail: boolean }).__fail = false));
  await page.getByRole('dialog', { name: 'Set not saved' }).getByRole('button', { name: 'Finish without it' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect(await sets(page)).toHaveLength(1);
});

test('(b)(c) Edit after switching to Timed keeps reps; changing bar to Smith saves smith', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean; bars: Record<string, number | null> }>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, bars: { ...gym.bars, smith: 30 } }] });
  const view = await squat135(page);
  await logOne(page);
  await loggedRows(view).first().tap();
  await editSheet(page).getByTestId('bar-link').tap();
  await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Smith bar/ }).tap();
  await shot(page, 'c-smith-edit');
  await editSheet(page).getByRole('button', { name: 'Save' }).tap();
  await expect(editSheet(page)).toHaveCount(0);
  const saved = (await sets(page))[0]!;
  expect(saved.load).toMatchObject({ barId: 'smith', barWeight: 30, total: 120 });
  // switch to Timed, edit an older rep set
  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await page.getByRole('button', { name: /^Loaded with: Plates on a bar/ }).tap();
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Timed/ }).tap();
  await loggedRows(view).first().tap();
  await expect(editSheet(page).getByTestId('stepper-reps')).toHaveText('8');
  await editSheet(page).getByRole('button', { name: 'More reps' }).tap();
  await editSheet(page).getByRole('button', { name: 'Save' }).tap();
  await expect(editSheet(page)).toHaveCount(0);
  const s2 = (await sets(page))[0]!;
  expect(s2).toMatchObject({ reps: 9, load: { kind: 'barbell', barId: 'smith', total: 120 } });
  expect(s2.seconds).toBeUndefined();
  expect(errors).toEqual([]);
});

test('(d) typed hold of 60 on a row logs 60; stopwatch 3 s then typed 60 logs 60', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['plank', 'Plank']]);
  const view = exerciseView(page, 'plank');
  // type 60 on row 2 (30 s steps), log row 1 by stopwatch ~3 s
  await view.getByTestId('hold-cell').nth(1).tap();
  for (let i = 0; i < 30; i++) await view.getByRole('button', { name: 'More seconds' }).tap();
  await expect(view.getByText('60', { exact: true }).first()).toBeVisible();
  await shot(page, 'd-stepper');
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(3000);
  await view.getByRole('button', { name: 'Stop timer' }).tap();
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await sets(page))[0]!.seconds).toBeGreaterThanOrEqual(2);
  expect((await sets(page))[0]!.seconds).toBeLessThanOrEqual(4);
  // row 2 is now current with the typed hold: display 1:00, log 60 (not stale stopwatch)
  await expect(view.getByTestId('timer-clock').first()).toHaveText('1:00');
  await shot(page, 'd-typed-hold');
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  expect((await sets(page)).map((s) => s.seconds)).toEqual([expect.any(Number), 60]);
  // stopwatch 3 s then LAST TIME/typed 60 on row: start row 3, stop at 3 s, set 60 via Last time is builder's; here a typed re-check
  expect(errors).toEqual([]);
});

test('(e) failing reads: LoadError, ✓ and Finish disabled, no redirect; recover', async ({ page }) => {
  const errors = watchErrors(page);
  await squat135(page);
  await logOne(page);
  const url = page.url();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('ok')) (window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = true;
  });
  await page.reload();
  await expect(page.getByTestId('load-error')).toBeVisible();
  await shot(page, 'e-loaderror');
  expect(page.url()).toBe(url);
  await expect(page.getByTestId('check-current')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);
  await page.evaluate(() => {
    sessionStorage.setItem('ok', '1');
    (window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = false;
  });
  await page.getByTestId('load-error').getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  await expect(loggedRows(exerciseView(page, SQUAT))).toHaveCount(1);
  await logOne(page);
  expect(errors.filter((e) => !/fail|Failed to load resource/i.test(e))).toEqual([]);
});

test('(f) pending set 3 at 17 reps stays with its row across delete set 1 and Undo', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(page);
  await logOne(page);
  await view.getByTestId('reps-cell').first().tap();
  for (let i = 0; i < 9; i++) await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 3: 17 × 135 lb');
  const ids = (await sets(page)).map((s) => s.id);
  await loggedRows(view).first().tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 2: 17 × 135 lb');
  await shot(page, 'f-after-delete');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 3: 17 × 135 lb');
  expect((await sets(page)).map((s) => s.id)).toEqual(ids);
  // reload after delete, mid-window: still deleted (kill/reload)
  await loggedRows(view).first().tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.reload();
  await expect(loggedRows(exerciseView(page, SQUAT))).toHaveCount(1);
  await expect(checkCurrent(exerciseView(page, SQUAT))).toHaveAccessibleName('Log set 2: 17 × 135 lb');
  // data exactness
  const s = await sets(page);
  expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  expect(errors).toEqual([]);
});

test('(g) rest over bar clears by itself within ~3 s; double tap on ✓ makes one set', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await page.waitForTimeout(400);
  await checkCurrent(view).dblclick().catch(() => {});
  await expect(loggedRows(view)).toHaveCount(1);
  expect(await sets(page)).toHaveLength(1);
  const sid = page.url().split('#/workout/')[1]!.split('/')[0]!;
  await page.evaluate((sid) => localStorage.setItem('anygym-rest', JSON.stringify({ sessionId: sid, endsAt: Date.now() + 800, totalSec: 90 })), sid);
  await page.reload();
  const rest = page.getByTestId('rest-timer');
  await expect(rest).toHaveAttribute('aria-label', 'Rest over', { timeout: 4000 });
  const t0 = Date.now();
  await expect(rest).toHaveCount(0, { timeout: 4500 });
  expect(Date.now() - t0).toBeLessThan(4000);
  expect(errors).toEqual([]);
});

test('data exactness after a mixed workout', async ({ page }) => {
  const view = await squat135(page);
  await logOne(page);
  await logOne(page);
  const s = await sets(page);
  const orders = s.map((x) => x.order);
  expect(orders).toEqual([...orders].sort((a, b) => a - b));
  expect(new Set(orders).size).toBe(orders.length);
  for (const x of s) expect(x.load.total).toBe(135);
  const sessions = await dbAll<{ id: string }>(page, 'sessions');
  for (const x of s) expect(sessions.some((q) => q.id === x.sessionId)).toBe(true);
  await expect(loggedRows(view)).toHaveCount(2);
});
