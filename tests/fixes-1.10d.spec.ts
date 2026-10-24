import { expect, test, type Page } from './fixtures';
import type { WorkoutSet } from '../src/db/types';

// PLAN 1.10d: Codex saving fixes. Fix 1 (log queue) and fix 3 (restore into a finished workout)
// are proven at the lib and db layer (logQueue.test.ts, workouts.test.ts).

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const savedSets = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<WorkoutSet[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('sets', 'readonly');
          const read = tx.objectStore('sets').getAll();
          tx.oncomplete = () => {
            req.result.close();
            resolve((read.result as WorkoutSet[]).sort((a, b) => a.order - b.order));
          };
        };
      }),
  );

const shot = async (page: Page, name: string) => {
  if (test.info().project.name !== 'iPhone 15 Pro') return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.10d/${name}.png` });
};

const logButton = (page: Page) => page.getByTestId('action-bar').getByRole('button').first();
const pause = (page: Page, ms = 400) => page.waitForTimeout(ms); // past the double tap guard

async function quick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}

async function addExercise(page: Page, query: string, name: string) {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}

test('(2) Edit set: save 12 over 10, delete, Undo brings back 12', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveText(['110 × 45 lb']);

  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await card.getByTestId('set-row').tap();
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await expect(edit.getByRole('button', { name: 'Delete set' })).toBeEnabled();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  await expect(card.getByTestId('set-row')).toHaveText(['112 × 45 lb']);
  await pause(page);

  await card.getByTestId('set-row').tap();
  await edit.getByRole('button', { name: 'Delete set' }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(card.getByTestId('set-row')).toHaveText(['112 × 45 lb']);
  expect((await savedSets(page)).map((s) => s.reps)).toEqual([12]);
  expect(errors).toEqual([]);
});

test('(4) Bench switches to the women\'s bar: math, Log set label and saved set agree, and it is remembered', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'incline bench', 'Barbell Incline Bench Press');
  const card = page.getByTestId('exercise-barbell-incline-bench-press');
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await expect(card.getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');

  await card.getByRole('button', { name: 'Bar: Olympic 45 lb · Change' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Which bar?' });
  await expect(sheet.getByRole('button', { name: /Olympic bar/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'Enter another bar weight' })).toBeVisible();
  await shot(page, 'bar-sheet');
  await sheet.getByRole('button', { name: /Women's bar/ }).tap();
  await expect(sheet).toHaveCount(0);

  await expect(card.getByTestId('plate-math')).toHaveText(/^35 bar/);
  await expect(card.getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');
  await expect(card.getByRole('button', { name: "Bar: Women's 35 lb · Change" })).toBeVisible();
  await expect(logButton(page)).toHaveText('Log set · 10 × 125 lb');
  await shot(page, 'bar-womens');
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]!.load).toEqual({ kind: 'barbell', unit: 'lb', total: 125, barWeight: 35, perSide: [45] });

  await page.reload();
  await expect(card.getByRole('button', { name: "Bar: Women's 35 lb · Change" })).toBeVisible();
  await expect(card.getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');
  await expect(logButton(page)).toHaveText('Log set · 10 × 125 lb');
  expect(errors).toEqual([]);
});

test('(4) "Enter another bar weight" asks for a brand bar once, then uses it', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await card.getByRole('button', { name: 'Bar: Olympic 45 lb · Change' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Which bar?' });
  await sheet.getByRole('button', { name: 'Enter another bar weight' }).tap();
  await sheet.getByRole('button', { name: /Trap bar/ }).tap();
  const prompt = page.getByRole('dialog', { name: 'Trap bar' }).filter({ has: page.getByRole('button', { name: 'Save bar weight' }) });
  for (const d of '55') await prompt.getByRole('button', { name: d, exact: true }).tap();
  await prompt.getByRole('button', { name: 'Save bar weight' }).tap();
  await expect(prompt).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Bar: Trap 55 lb · Change' })).toBeVisible();
  await expect(logButton(page)).toHaveText('Log set · 10 × 55 lb');
  expect(errors).toEqual([]);
});

test('(5) storage that refuses drafts: a picked weight and reps survive switching cards, with one plain warning', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'anygym-drafts') throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    };
  });
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const squat = page.getByTestId('exercise-barbell-back-squat');
  await squat.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Drafts will not survive a reload on this phone' })).toBeVisible();
  await squat.getByRole('button', { name: 'More reps' }).tap();
  await expect(logButton(page)).toHaveText('Log set · 11 × 135 lb');

  await addExercise(page, 'plank', 'Plank');
  await expect(squat.getByRole('button', { expanded: false })).toBeVisible();
  await squat.getByRole('button', { expanded: false }).tap();
  await expect(squat.getByTestId('plate-total')).toHaveText('135lb');
  await expect(squat.getByTestId('stepper-reps')).toHaveText('11');
  await expect(logButton(page)).toHaveText('Log set · 11 × 135 lb');
  expect(await page.evaluate(() => localStorage.getItem('anygym-drafts'))).toBeNull();
  expect(errors).toEqual([]);
});

test('Codex 1.10d (1): editing a set logged on the Olympic bar after switching to the women\'s bar keeps its own 45 bar', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'incline bench', 'Barbell Incline Bench Press');
  const card = page.getByTestId('exercise-barbell-incline-bench-press');
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await pause(page);
  await card.getByRole('button', { name: 'Bar: Olympic 45 lb · Change' }).tap();
  await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Women's bar/ }).tap();
  await expect(card.getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');

  await card.getByTestId('set-row').tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit.getByTestId('plate-total')).toHaveText('135lb');
  await expect(edit.getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');
  await expect(edit.getByRole('button', { name: 'Bar: Olympic 45 lb · Change' })).toBeVisible();
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  expect((await savedSets(page))[0]).toMatchObject({ reps: 11, load: { total: 135, barWeight: 45, perSide: [45] } });
  // The exercise keeps the women's bar for the next set.
  await expect(card.getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');
  expect(errors).toEqual([]);
});

test('Codex 1.10d (4): a bar choice that fails to save changes nothing and offers Try again', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'incline bench', 'Barbell Incline Bench Press');
  const card = page.getByTestId('exercise-barbell-incline-bench-press');
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await page.evaluate(() => {
    const w = window as unknown as { __realPut: typeof IDBObjectStore.prototype.put };
    w.__realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'exerciseSettings') throw new DOMException('synthetic failure', 'UnknownError');
      return w.__realPut.apply(this, args);
    };
  });
  await card.getByRole('button', { name: 'Bar: Olympic 45 lb · Change' }).tap();
  await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Women's bar/ }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Could not save the bar choice' })).toBeVisible();
  await expect(card.getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');
  await expect(card.getByRole('button', { name: 'Bar: Olympic 45 lb · Change' })).toBeVisible();
  await expect(logButton(page)).toHaveText('Log set · 10 × 135 lb');

  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __realPut: typeof IDBObjectStore.prototype.put }).__realPut;
  });
  await page.getByRole('button', { name: 'Try again', exact: true }).tap();
  await expect(card.getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');
  await expect(logButton(page)).toHaveText('Log set · 10 × 125 lb');
  expect(errors.filter((e) => !e.includes('synthetic failure'))).toEqual([]);
});
