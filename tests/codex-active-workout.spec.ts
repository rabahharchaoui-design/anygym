import { expect, test, type Locator, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';

// WebKit only, following workout.spec.ts. Written without running Playwright: port 4173
// belongs to another process. These cover built PLAN 1.6 / 1.7 / 1.7a behavior.
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone WebKit regressions');
});

async function dbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const connection = req.result;
      const tx = connection.transaction(name, 'readonly');
      const read = tx.objectStore(name).getAll();
      tx.oncomplete = () => { connection.close(); resolve(read.result as T[]); };
      tx.onabort = () => { connection.close(); reject(tx.error); };
    };
  }), store);
}

const savedSets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
// PLAN 1.7c: the set card's Log set is now the current row's check in the set table.
const logButton = (page: Page) => page.getByTestId('check-current');

// PLAN 1.7c: the picker opens by itself on an empty quick workout; adding one opens its exercise view.
async function addExercise(page: Page, query: string, name: string) {
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  // An empty quick workout opens the picker by itself, a moment after the list renders.
  await sheet.waitFor({ timeout: 1500 }).catch(() => {});
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
}

/** PLAN 1.7c: weights are picked in the "Pick the weight" sheet from the current row's weight cell. */
const picker = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight', exact: true });
async function openPicker(page: Page, card: Locator) {
  await card.getByTestId('weight-cell').first().tap();
  await expect(picker(page)).toBeVisible();
}
async function pickerDone(page: Page) {
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(picker(page)).toHaveCount(0);
}

async function typeOnPad(scope: Locator, value: string) {
  for (const digit of value) await scope.getByRole('button', { name: digit, exact: true }).tap();
}

test('an offline active workout restores its selected exercise, exact sets, repeat load and rest after reload', async ({ page, context }) => {
  const errors = watchErrors(page);
  try {
    await page.goto('./');
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await expect(page).toHaveURL(/#\/workout\//);
    await addExercise(page, 'back squat', 'Barbell Back Squat');
    const squat = page.getByTestId('exercise-barbell-back-squat');
    await openPicker(page, squat);
    await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await pickerDone(page);
    await logButton(page).tap();
    await expect(squat.getByTestId('set-row')).toHaveCount(1);

    await context.setOffline(true);
    // Searching and adding another exercise must also work without a network.
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
    const workoutUrl = page.url();
    const dumbbell = page.getByTestId('exercise-dumbbell-bench-press');
    await openPicker(page, dumbbell);
    await picker(page).getByRole('option', { name: '30 lb', exact: true }).tap();
    await pickerDone(page);
    await dumbbell.getByTestId('reps-cell').first().tap();
    await dumbbell.getByRole('button', { name: 'More reps' }).tap();
    await dumbbell.getByRole('button', { name: 'Done', exact: true }).tap();
    await logButton(page).tap();
    await expect(dumbbell.getByTestId('set-row')).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    const before = await savedSets(page);
    expect(before.map((s) => [s.order, s.reps, s.load])).toEqual([
      [0, 8, { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45], barId: 'olympic', collars: 0 }],
      [1, 9, { kind: 'dumbbell_each', unit: 'lb', total: 60 }],
    ]);
    const sessionBefore = await dbAll<Session>(page, 'sessions');

    await page.reload();
    await expect(page).toHaveURL(workoutUrl);
    // The next row is restored exactly as it was (the 30 lb pick applied to the rows below).
    await expect(dumbbell.getByTestId('set-target')).toHaveText('Set 2 of 3 · 8 to 12 reps');
    await expect(dumbbell.getByTestId('reps-cell').first()).toHaveText('8');
    await expect(dumbbell.getByTestId('weight-cell').first()).toHaveText('30');
    await expect(logButton(page)).toHaveAccessibleName('Log set 2: 8 × 30 lb each');
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(squat).toHaveCount(0);
    expect(await savedSets(page)).toEqual(before);
    expect(await dbAll<Session>(page, 'sessions')).toEqual(sessionBefore);

    await logButton(page).tap();
    await expect(dumbbell.getByTestId('set-row')).toHaveCount(2);
    const after = await savedSets(page);
    expect(after.slice(0, 2)).toEqual(before);
    expect(after[2]).toMatchObject({ sessionId: before[1]!.sessionId, exerciseId: 'dumbbell-bench-press', order: 2, reps: 8, load: before[1]!.load });
    expect(new Set(after.map((s) => s.id)).size).toBe(3);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await page.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 3 sets' })).toBeVisible();
    await page.reload();
    expect(await savedSets(page)).toEqual(after);
    expect(await dbAll<Session>(page, 'sessions')).toEqual([{ ...sessionBefore[0], endedAt: expect.any(Number) }]);
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});

// CODEX FOUND BUG, fixed in 1.10c. PLAN 1.7c round 2 (Codex weights 1): Edit set keeps the set's own
// starting resistance (no "Change" link there any more), so the machine's start is changed from the
// weight picker; diagram, the check label and the stored totals must still agree.
test('changing starting resistance in Edit set keeps the active diagram, Log set and stored total in agreement', async ({ page }) => {
  const errors = watchErrors(page);
  try {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    // Leg Press is a plate loaded machine by the exercise list now: no load type question.
    await addExercise(page, 'leg press', 'Leg Press');
    const card = page.getByTestId('exercise-leg-press');
    await openPicker(page, card);
    await picker(page).getByRole('button', { name: 'Set starting weight' }).tap();
    await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'Plates only', exact: true }).tap();
    await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await pickerDone(page);
    await expect(logButton(page)).toHaveAccessibleName('Log set 1: 8 × 90 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    const original = (await savedSets(page))[0]!;

    // The machine's starting resistance changes to 50 (from the weight picker).
    await openPicker(page, card);
    await picker(page).getByRole('button', { name: 'Plates only · Change' }).tap();
    const start = page.getByRole('dialog', { name: 'Starting weight', exact: true });
    await typeOnPad(start, '50');
    await start.getByRole('button', { name: 'Save starting weight' }).tap();
    await expect(start).toHaveCount(0);
    await expect(picker(page).getByTestId('plate-total')).toHaveText('140lb');
    await pickerDone(page);

    // Edit set of the logged set: its own start, diagram and Save agree on 90 lb.
    await card.getByTestId('set-row').first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('plate-total')).toHaveText('90lb');
    await expect(edit.getByRole('button', { name: /Change/ })).toHaveCount(0);
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    // The next row's weight follows the new start (50 start + 2 × 45 = 140 lb).
    await expect(card.getByTestId('weight-cell').first()).toHaveText('140');
    await expect(logButton(page)).toHaveAccessibleName('Log set 2: 8 × 140 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    const saved = await savedSets(page);
    expect(saved[0]!.id).toBe(original.id);
    expect(saved[0]!.load).toEqual({ kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], collars: 0 });
    expect(saved[1]!.load).toEqual({ kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 });
    await page.reload();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    expect(await savedSets(page)).toEqual(saved);
  } finally {
    expect(errors).toEqual([]);
  }
});

// CODEX FOUND BUG, fixed in 1.10c
test('iPhone SE: adding bodyweight resistance keeps the set controls visible without scrolling, including during rest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });
  try {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await addExercise(page, 'wide grip pull', 'Wide Grip Pull Up');
    const card = page.getByTestId('exercise-wide-grip-pull-up');
    await openPicker(page, card);
    await picker(page).getByRole('button', { name: 'Add weight', exact: true }).tap();
    // 1.10c fix 13: the keypad opens in a sheet (selector change only), Done closes it.
    const addSheet = page.getByRole('dialog', { name: 'Add weight', exact: true });
    await typeOnPad(addSheet.getByRole('group', { name: 'Added weight', exact: true }), '25');
    await addSheet.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(addSheet).toHaveCount(0);
    await expect(picker(page).getByTestId('bodyweight-added')).toHaveText('+ 25 lb added');
    await pickerDone(page);
    await expect(card.getByTestId('weight-cell').first()).toHaveText('+25');

    const fits = async () => {
      const main = page.getByRole('main');
      // Check before tapping Log set: Playwright's automatic scrolling must not mask overflow.
      await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const control of [card.getByRole('heading', { name: 'Wide Grip Pull Up' }), card.getByTestId('set-target'), card.getByTestId('weight-cell').first(), card.getByTestId('reps-cell').first(), logButton(page)]) {
        await expect(control).toBeInViewport({ ratio: 1 });
        // Viewport membership alone does not detect a control covered by the rest dock.
        expect(await control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit !== null && (el === hit || el.contains(hit));
        })).toBe(true);
      }
    };
    await fits();
    await expect(logButton(page)).toHaveAccessibleName('Log set 1: 8 reps + 25 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await fits();
    await expect(card.getByTestId('set-row')).toBeInViewport({ ratio: 1 });
    expect((await savedSets(page))[0]).toMatchObject({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 } });
  } finally {
    expect(errors).toEqual([]);
  }
});
