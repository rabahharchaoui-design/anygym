import { expect, test, type Locator, type Page } from './fixtures';
import type { Gym, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, shotOn, watchErrors } from './workout-helpers';

// PLAN 2.0c group 1 (acceptance A) and group 3 (acceptance C), in the browser.

const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
const activeGym = async (page: Page) => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
const draftsBlob = (page: Page) => page.evaluate(() => localStorage.getItem('anygym-drafts') ?? '');

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

async function logOne(view: Locator) {
  const before = await loggedRows(view).count();
  await view.page().waitForTimeout(400); // past the double tap guard
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}

test('acceptance A: an open 65 lb picker never applies 40 kg after the units change in another tab @matrix', async ({ page, context }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(sheet.getByTestId('plate-total')).toContainText('65');
  await shotOn(page, '2.0c', 'a-65lb-before');

  // Another tab of the app switches this gym to kg while the picker stays open.
  const other = await context.newPage();
  await other.goto('./#/settings');
  await other.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await activeGym(other)).unit).toBe('kg');
  await other.close();

  // The picker starts over in kg: nothing old is shown or confirmable.
  await expect(sheet.getByTestId('weight-sheet-sub')).toHaveText('Units changed to kg. Pick the weight again.');
  await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: 'Add 20 kg plate to each side' })).toBeVisible();
  await shotOn(page, '2.0c', 'a-units-changed');
  // Swiping it away applies nothing.
  await dragDown(page, sheet);
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).not.toHaveText('40');
  expect(await draftsBlob(page)).not.toContain('"total":40');

  // A fresh kg selection is applied and logged exactly.
  await view.getByTestId('weight-cell').first().tap();
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 20 kg plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('60');
  await logOne(view);
  const saved = (await sets(page))[0]!.load!;
  expect(saved).toMatchObject({ kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] });
  expect((await sets(page)).some((s) => s.load?.total === 40)).toBe(false);
  expect(errors).toEqual([]);
});

/** Holds the app's next readwrite transaction on exerciseSettings (a slow bar choice save) until released. */
function holdSettingsSeam() {
  const w = window as unknown as { __hold: { armed: boolean; released: boolean; held: number } };
  w.__hold = { armed: false, released: false, held: 0 };
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: string | string[], mode?: IDBTransactionMode, opts?: IDBTransactionOptions) {
    const tx = original.call(this, stores, mode, opts);
    const names = typeof stores === 'string' ? [stores] : [...stores];
    const h = w.__hold;
    if (mode === 'readwrite' && names.includes('exerciseSettings') && h.armed) {
      h.armed = false;
      h.held++;
      const spin = () => {
        if (h.released) return;
        try {
          tx.objectStore('exerciseSettings').count().onsuccess = spin;
        } catch {
          /* ended */
        }
      };
      spin();
    }
    return tx;
  } as typeof IDBDatabase.prototype.transaction;
}

test('acceptance C: plates added while a Smith choice saves are kept: [45, 10] = 110 lb in the picker, the draft and the saved set @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(holdSettingsSeam);
  await page.goto('./');
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).length).toBeGreaterThan(0);
  // This gym's Smith machine is answered "plates only" (a known base of 0).
  const g = await activeGym(page);
  await dbPut(page, { gyms: [{ ...g, bars: { ...g.bars, smith: 0 }, equipmentWeights: { ...g.equipmentWeights, smith_machine: { kind: 'plates_only', value: 0 } } }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await expect(sheet.getByTestId('plate-total')).toContainText('135');

  await page.evaluate(() => void ((window as unknown as { __hold: { armed: boolean } }).__hold.armed = true));
  await sheet.getByTestId('bar-link').tap();
  const bars = page.getByRole('dialog', { name: 'Which bar?' });
  await bars.getByRole('button', { name: /^Smith bar/ }).tap();
  await expect(bars).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hold: { held: number } }).__hold.held)).toBe(1);
  // While the choice saves: add 10s. Done waits for the choice.
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await shotOn(page, '2.0c', 'c-choice-pending');
  await page.evaluate(() => void ((window as unknown as { __hold: { released: boolean } }).__hold.released = true));

  // Smith plates only with both plates: 2 × (45 + 10) = 110, never 90.
  await expect(sheet.getByTestId('plate-total')).toContainText('110');
  await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  await shotOn(page, '2.0c', 'c-choice-settled');
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('110');
  expect(await draftsBlob(page)).toContain('"total":110');
  await logOne(view);
  expect((await sets(page))[0]!.load).toMatchObject({ kind: 'barbell', unit: 'lb', total: 110, barWeight: 0, barId: 'smith', perSide: [45, 10] });
  await page.reload();
  await expect(loggedRows(exerciseView(page, 'barbell-back-squat'))).toHaveCount(1);
  expect((await sets(page))[0]!.load!.total).toBe(110);
  expect(errors).toEqual([]);
});

test('a swipe down while the Smith choice saves keeps the plates: the sheet waits, then applies [45, 10] = 110 lb @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(holdSettingsSeam);
  await page.goto('./');
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).length).toBeGreaterThan(0);
  const g = await activeGym(page);
  await dbPut(page, { gyms: [{ ...g, bars: { ...g.bars, smith: 0 }, equipmentWeights: { ...g.equipmentWeights, smith_machine: { kind: 'plates_only', value: 0 } } }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await page.evaluate(() => void ((window as unknown as { __hold: { armed: boolean } }).__hold.armed = true));
  await sheet.getByTestId('bar-link').tap();
  const bars = page.getByRole('dialog', { name: 'Which bar?' });
  await bars.getByRole('button', { name: /^Smith bar/ }).tap();
  await expect(bars).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hold: { held: number } }).__hold.held)).toBe(1);
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();

  // Swipe down while the choice is still saving: the sheet stays, nothing is lost or applied yet.
  await dragDown(page, sheet);
  await page.waitForTimeout(500);
  await expect(sheet).toBeVisible();
  expect(await draftsBlob(page)).not.toContain('"total":');
  // The choice lands: the held swipe applies the plates as they are now and closes.
  await page.evaluate(() => void ((window as unknown as { __hold: { released: boolean } }).__hold.released = true));
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('110');
  expect(await draftsBlob(page)).toContain('"total":110');
  await logOne(view);
  expect((await sets(page))[0]!.load).toMatchObject({ kind: 'barbell', total: 110, barWeight: 0, barId: 'smith', perSide: [45, 10] });
  expect(errors).toEqual([]);
});
