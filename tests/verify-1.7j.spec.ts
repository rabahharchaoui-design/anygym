import { expect, test, type Locator, type Page } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, shotOn, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7j: the Codex 1025 workout flow findings, reproduced by hand in the app.

const SQUAT = 'barbell-back-squat';
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Edit set' });
const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);

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

test('(1) check row 3 first, then the highlighted rows: all three save once, no ✓ goes dead @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  // Row 3 first (its own ✓, not the highlighted one).
  await view.getByRole('button', { name: /^Log set 3:/ }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await logOne(view);
  await logOne(view);
  await expect(view.getByTestId('set-todo')).toHaveCount(0);
  const saved = await sets(page);
  expect(saved).toHaveLength(3);
  expect(new Set(saved.map((s) => s.id)).size).toBe(3);
  expect(saved.every((s) => s.load?.total === 135)).toBe(true);
  expect(errors).toEqual([]);
});

test('(2) a failed active plan read disables Use this plan; the plan in use keeps its week and day', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page, 'plan-six-week-volume');
  const state = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
  const progressed = { ...state, weekIndex: 2, nextDayIndex: 1, doneDays: [0] };
  await dbPut(page, { planState: [progressed] });
  // The read of the plan in use fails: the plan must not look unused, and nothing can reset it.
  await page.evaluate(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...a: [IDBValidKey | IDBKeyRange]) {
      if (this.name === 'planState' && (window as unknown as { __failPlan?: boolean }).__failPlan) throw new DOMException('boom', 'UnknownError');
      return get.apply(this, a);
    } as typeof get;
    (window as unknown as { __failPlan: boolean }).__failPlan = true;
  });
  await page.goto('./#/plans/six-week-volume');
  await expect(page.getByTestId('load-error')).toBeVisible();
  const use = page.getByTestId('action-bar').getByRole('button', { name: /Use this plan|Go to Today/ });
  await expect(use).toBeDisabled();
  await use.tap({ force: true }).catch(() => undefined);
  await shotOn(page, '1.7j', 'plan-read-failed');
  await page.evaluate(() => ((window as unknown as { __failPlan: boolean }).__failPlan = false));
  await page.getByTestId('load-error').getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByTestId('action-bar').getByRole('button', { name: 'Go to Today' })).toBeEnabled();
  await page.getByTestId('action-bar').getByRole('button', { name: 'Go to Today' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  expect((await dbAll(page, 'planState'))[0]).toEqual(progressed);
  expect(errors.filter((e) => !e.includes('boom'))).toEqual([]);
});

test('(3) three W rows on a normal lift leave its three working rows to do @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  for (let i = 0; i < 3; i++) {
    // The highlighted row becomes a warm up (one tap on its set number), then ✓.
    await view.getByTestId('set-todo').first().getByTestId('set-type').tap();
    await expect(view.getByTestId('set-todo').first().getByTestId('set-type')).toHaveAttribute('aria-label', /Warm up/);
    await logOne(view);
  }
  expect((await sets(page)).map((s) => s.kind)).toEqual(['warmup', 'warmup', 'warmup']);
  await expect(view.getByTestId('set-todo')).toHaveCount(3);
  await expect(view.getByTestId('set-target')).toContainText('Set 1 of 3');
  await expect(page.getByTestId('next-chip')).toHaveCount(0);
  await shotOn(page, '1.7j', 'warmups-keep-working-rows');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByTestId(`row-${SQUAT}`)).not.toHaveAttribute('data-state', 'done');
  expect(errors).toEqual([]);
});

test('(8) a failed Undo survives minimize and resume: Finish stays blocked until it is put back', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(view);
  await logOne(view);
  const original = (await sets(page))[0]!;
  await loggedRows(view).first().getByRole('button', { name: /Edit$/ }).tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  // The 48 pt toast action (SPEC 0, 13.3).
  const undo = page.getByRole('button', { name: 'Undo' });
  // Layout size (the toast springs in with a slight scale).
  const size = (l: Locator) => l.evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight]);
  const [w, h] = await size(undo);
  expect(h).toBeGreaterThanOrEqual(48);
  expect(w).toBeGreaterThanOrEqual(48);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let once = true;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      if (this.name === 'tombstones' && once) {
        once = false;
        throw new DOMException('boom', 'DataError');
      }
      return put.apply(this, a);
    } as typeof put;
  });
  await undo.tap();
  await expect(page.getByText('Could not bring that set back')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Try again' });
  expect((await size(retry))[1]).toBeGreaterThanOrEqual(48);
  // Minimize, wait past the Undo window, resume.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page.getByTestId('resume-bar').or(page.getByRole('button', { name: /^Resume\b/ }).first())).toBeVisible();
  await page.waitForTimeout(5600);
  await page.getByRole('button', { name: /^Resume\b/ }).first().tap();
  await expect(page.getByTestId(`row-${SQUAT}`)).toBeVisible();
  await page.waitForTimeout(300);
  expect(await dbAll(page, 'tombstones')).toHaveLength(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Undo did not finish' });
  await expect(sheet).toBeVisible();
  await shotOn(page, '1.7j', 'undo-after-resume');
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);
  await sheet.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  const after = await sets(page);
  expect(after).toHaveLength(2);
  expect(after.find((s) => s.id === original.id)).toEqual(original);
  expect(errors).toEqual([]);
});

test('(7) Plate Russian Twist picks from the gym\'s enabled plates', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['russian twist', 'Plate Russian Twist']]);
  const view = exerciseView(page, 'plate-russian-twist');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  await expect(sheet.getByTestId('picker-title')).toHaveText('One plate · both hands');
  const options = await sheet.getByRole('option').allTextContents();
  expect(options).toEqual(['2.5', '5', '10', '25', '35', '45']);
  await sheet.getByRole('option', { name: '25 lb' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('25');
  await shotOn(page, '1.7j', 'held-plate');
  await logOne(view);
  expect((await sets(page))[0]!.load).toEqual({ kind: 'single', unit: 'lb', total: 25 });
  expect(errors).toEqual([]);
});

test('(11) the rest countdown keeps its deadline through minimize and resume with localStorage full', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if ((window as unknown as { __full?: boolean }).__full && k === 'anygym-rest') throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    };
  });
  const view = await squat135(page);
  await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = true));
  await logOne(view);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('anygym-rest'))).toBeNull();
  const before = await page.getByTestId('rest-clock').textContent();
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await page.getByRole('button', { name: /^Resume\b/ }).first().tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  const toSec = (t: string | null) => {
    const [m, s] = (t ?? '0:0').split(':').map(Number);
    return m! * 60 + s!;
  };
  const after = await page.getByTestId('rest-clock').textContent();
  expect(toSec(after)).toBeLessThanOrEqual(toSec(before));
  expect(toSec(after)).toBeGreaterThan(toSec(before) - 10);
  // Its IndexedDB copy holds the same deadline for the next start.
  const kv = (await dbAll<{ key: string; value: string | null }>(page, 'kv')).find((r) => r.key === 'anygym-rest');
  expect(kv?.value).toBeTruthy();
  expect(errors).toEqual([]);
});
