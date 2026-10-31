import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, exerciseView, fillReps, loggedRows, quickWith, watchErrors } from './workout-helpers';
import { addIdbSeams, heldWrites, holdNextSetWrite, releaseSetWrite } from './helpers/idb';

// PLAN 2.0e in the browser: (3) a delayed Log never moves an open reps editor to another row,
// (5) a failed Edit save is announced inside the dialog, (7) reps on a "Pick" row invent no weight
// and an imported weight restores to exactly the file's number, (9) a fast double tap on ✓ logs one set.

const ID = 'kettlebell-goblet-squat';
const todo = (view: Locator) => view.getByTestId('set-todo');

async function pick53(page: Page, view: Locator) {
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  for (const k of ['5', '3']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('53');
}

const repsOf = async (view: Locator) => todo(view).evaluateAll((els) => els.map((e) => e.querySelector('[data-testid="reps-cell"]')?.textContent?.trim()));

test('(3) a delayed Log never hands the open reps editor to another row @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await addIdbSeams(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await page.waitForTimeout(400);
  // Three distinct pending rows: 7, 8, 19.
  await fillReps(view, todo(view).nth(0), 7);
  await fillReps(view, todo(view).nth(1), 8);
  await fillReps(view, todo(view).nth(2), 19);
  expect(await repsOf(view)).toEqual(['7', '8', '19']);

  // Log row 1 and hold its write; meanwhile open row 2's editor (8).
  await holdNextSetWrite(page);
  await checkCurrent(view).tap();
  await expect.poll(() => heldWrites(page)).toBe(1);
  await todo(view).nth(1).getByTestId('reps-cell').tap();
  await expect(view.getByRole('button', { name: 'More reps' })).toBeVisible();
  // The write lands: row 2 is now the first pending row. One tap on More reps changes THAT row.
  await releaseSetWrite(page);
  await expect(loggedRows(view)).toHaveCount(1);
  await view.getByRole('button', { name: 'More reps' }).tap();
  await expect.poll(() => repsOf(view)).toEqual(['9', '19']);
  const sets = await dbAll<{ reps?: number }>(page, 'sets');
  expect(sets.map((s) => s.reps)).toEqual([7]);
  expect(errors).toEqual([]);
});

test('(5) a failed Edit save is announced inside the dialog, keeps the values and saves once on retry @matrix', async ({ page }) => {
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
  const before = (await dbAll<{ reps?: number }>(page, 'sets'))[0]!.reps!;
  await loggedRows(view).first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit).toBeVisible();
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await page.evaluate(() => void ((window as unknown as { __fail: boolean }).__fail = true));
  await edit.getByRole('button', { name: 'Save' }).tap();
  // Inside the dialog, in a live region.
  const msg = edit.getByTestId('edit-error');
  await expect(msg).toHaveText('Could not save that. Try again.');
  await expect(msg).toHaveAttribute('aria-live', 'polite');
  await expect(edit).toBeVisible();
  // The entered value stays.
  await expect(edit.getByText(String(before + 1), { exact: true }).first()).toBeVisible();
  // Retry saves it once.
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  const sets = await dbAll<{ reps?: number }>(page, 'sets');
  expect(sets.map((s) => s.reps)).toEqual([before + 1]);
  expect(errors.filter((e) => !/disk full|QuotaExceeded/.test(e))).toEqual([]);
});

test('(7) reps changed on a "Pick" row keep the weight empty and the check blocked @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  const cell = todo(view).first().getByTestId('weight-cell');
  const shown = (await cell.innerText()).trim();
  await todo(view).first().getByTestId('reps-cell').tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(cell).toHaveText(shown);
  expect(shown).not.toMatch(/\d/);
  await expect(checkCurrent(view)).toBeDisabled();
  await expect(checkCurrent(view)).toHaveAttribute('aria-label', 'Set 1: Pick a weight');
  await checkCurrent(view).tap({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);
  expect(await dbAll(page, 'sets')).toEqual([]);
  expect(errors).toEqual([]);
});

const FILE = JSON.stringify({
  format: 'anygym-import-v1',
  unit: 'lb',
  exercises: [{ name: 'Goblets', planExercise: 'Kettlebell Goblet Squat', loadType: 'single_weight', sessions: [{ sets: [{ reps: 10, weight: 53 }] }] }],
});

test('(7) restoring an imported weight shows exactly the restored number @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(FILE) });
  await expect(page).toHaveURL(/#\/settings\/import$/);
  await page.getByTestId('import-set').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Check this set' });
  await expect(sheet.getByTestId('wheel-total')).toContainText('53');
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'Delete', exact: true }).tap();
  for (const k of ['5', '0', '1']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await expect(sheet.getByTestId('import-weight-invalid')).toHaveText('Enter a weight up to 500 lb.');
  await sheet.getByTestId('import-weight-revert').tap();
  await expect(sheet.getByTestId('import-weight-invalid')).toHaveCount(0);
  await expect(sheet.getByTestId('wheel-total')).toHaveText(/^\s*53(\.0)?\s*(lb)?\s*$/);
  expect(await sheet.getByTestId('wheel-total').innerText()).not.toContain('501');
  expect(errors).toEqual([]);
});

test('(9) a fast double tap on ✓ logs exactly one set, offline after a reload @matrix', async ({ page, context }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await quickWith(page, [['goblet', 'Kettlebell Goblet Squat']]);
  const view = exerciseView(page, ID);
  await pick53(page, view);
  await context.setOffline(true);
  await page.reload();
  await expect(view).toBeVisible();
  await page.waitForTimeout(300);
  const box = (await checkCurrent(view).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Two taps on the same spot of the screen, as fast as a thumb: the second must never reach another row.
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
  await expect(loggedRows(view)).toHaveCount(1);
  await page.waitForTimeout(600);
  expect(await dbAll(page, 'sets')).toHaveLength(1);
  expect(errors).toEqual([]);
});
