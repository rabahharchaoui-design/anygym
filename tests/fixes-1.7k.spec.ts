import { expect, test, type Page } from './fixtures';
import { addIdbSeams, heldWrites, holdNextSetWrite, releaseSetWrite } from './helpers/idb';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// PLAN 1.7k: the Codex carry over fixes that need the real screen (reports/codex/bughunt-1025-*).

const SQUAT = 'barbell-back-squat';
type S = { id: string; order: number; reps?: number; kind: string; load?: { total: number } };
const todaySets = async (page: Page) => (await dbAll<S>(page, 'sets')).sort((a, b) => a.order - b.order);
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });

async function squat135(page: Page) {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQUAT);
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell')).toHaveText(['135', '135', '135']);
  return view;
}

/** Row 3's ✓ while its write is held, then `edit` opens an editor on row 2; the write lands while it is open. */
async function logRow3Behind(page: Page, view: ReturnType<typeof exerciseView>, open: () => Promise<void>) {
  await holdNextSetWrite(page);
  await page.waitForTimeout(450);
  await view.getByTestId('set-todo').nth(2).getByTestId('check').tap();
  await expect.poll(() => heldWrites(page)).toBe(1);
  await open();
  await releaseSetWrite(page);
  await expect.poll(async () => (await todaySets(page)).length).toBe(1);
  // The view has heard about the commit (the rows moved) while the editor is still open.
  await expect(loggedRows(view)).toHaveCount(1);
}

test('(3) @matrix the weight sheet stays on its row when another row commits while it is open', async ({ page }) => {
  const errors = watchErrors(page);
  await addIdbSeams(page);
  const view = await squat135(page);
  await logRow3Behind(page, view, async () => {
    await view.getByTestId('set-todo').nth(1).getByTestId('weight-cell').tap();
    await weightSheet(page).getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  });
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(weightSheet(page)).toHaveCount(0);
  // Row 1 keeps 135; only row 2 (the one the sheet was opened on) is 155.
  await expect(view.getByTestId('weight-cell')).toHaveText(['135', '155']);
  await page.reload();
  await expect(view.getByTestId('weight-cell')).toHaveText(['135', '155']);
  expect((await todaySets(page)).map((s) => s.load?.total)).toEqual([135]);
  expect(errors).toEqual([]);
});

test('(3) @matrix the set type sheet stays on its row when another row commits while it is open', async ({ page }) => {
  const errors = watchErrors(page);
  await addIdbSeams(page);
  const view = await squat135(page);
  await logRow3Behind(page, view, async () => {
    await view.getByTestId('set-todo').nth(1).getByTestId('set-type').tap();
    await expect(page.getByRole('dialog', { name: 'Set type' })).toBeVisible();
  });
  await page.getByRole('dialog', { name: 'Set type' }).getByTestId('set-type-drop').tap();
  await expect(page.getByRole('dialog', { name: 'Set type' })).toHaveCount(0);
  const todo = view.getByTestId('set-todo');
  await expect(todo.nth(0).getByTestId('set-type-chip')).toHaveCount(0);
  await expect(todo.nth(1).getByTestId('set-type-chip')).toHaveText('Drop set');
  await page.reload();
  await expect(todo.nth(0).getByTestId('set-type-chip')).toHaveCount(0);
  await expect(todo.nth(1).getByTestId('set-type-chip')).toHaveText('Drop set');
  expect(errors).toEqual([]);
});

test('(8) Edit set does not open once Finish started; the finished sets stay as logged', async ({ page }) => {
  const errors = watchErrors(page);
  await addIdbSeams(page);
  const view = await squat135(page);
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(450);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
  }
  const reps = (await todaySets(page)).map((s) => s.reps);
  // Finish's write is held: Finish has started and is still running.
  await holdNextSetWrite(page);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect.poll(() => heldWrites(page)).toBe(1);
  await page.getByTestId(`row-${SQUAT}`).tap({ timeout: 1500 }).catch(() => undefined);
  const row = loggedRows(view).first().getByRole('button', { name: /Edit$/ });
  if (await row.isVisible().catch(() => false)) await row.tap({ timeout: 1500 }).catch(() => undefined);
  await expect(page.getByRole('dialog', { name: 'Edit set' })).toHaveCount(0);
  await releaseSetWrite(page);
  await expect(page).toHaveURL(/\/done$/);
  expect((await todaySets(page)).map((s) => s.reps)).toEqual(reps);
  expect(errors).toEqual([]);
});

test('(8) a startup recovery error shows the error state, never the older draft; Try again shows the newer one', async ({ page }) => {
  const errors = watchErrors(page);
  // The first read of the IndexedDB mirror after the flag is set fails once (a startup recovery error).
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      if (this.name === 'kv' && sessionStorage.getItem('failKv') === '1') {
        sessionStorage.removeItem('failKv');
        throw new DOMException('synthetic read failure', 'UnknownError');
      }
      return original.apply(this, args);
    };
  });
  const view = await squat135(page);
  const reps0 = Number(await view.getByTestId('reps-cell').first().textContent());
  const newer = reps0 + 2;
  await view.getByTestId('reps-cell').first().tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(view.getByTestId('reps-cell').first()).toHaveText(String(newer));
  // Wait for the IndexedDB mirror, then make localStorage the older copy (as after a hard kill).
  await expect.poll(async () => JSON.stringify(await dbAll(page, 'kv'))).toContain(`"reps\\":${newer}`);
  await page.evaluate(
    ({ from, to }) => {
      const v = localStorage.getItem('anygym-drafts')!;
      localStorage.setItem('anygym-drafts', v.split(`"reps":${from}`).join(`"reps":${to}`));
      localStorage.setItem('anygym-durable-at', '{}');
      sessionStorage.setItem('failKv', '1');
    },
    { from: newer, to: reps0 },
  );
  await page.reload();
  await expect(page.getByTestId('startup-error')).toBeVisible();
  await expect(page.getByText('Could not open your workout')).toBeVisible();
  await expect(page.getByTestId('reps-cell')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByTestId('startup-error')).toHaveCount(0);
  await expect(view.getByTestId('reps-cell').first()).toHaveText(String(newer));
  expect(errors).toEqual([]);
});
