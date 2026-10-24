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
const logButton = (page: Page) => page.getByTestId('action-bar').getByRole('button').first();

async function addExercise(page: Page, query: string, name: string) {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
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
    const workoutUrl = page.url();
    await addExercise(page, 'back squat', 'Barbell Back Squat');
    const squat = page.getByTestId('exercise-barbell-back-squat');
    await squat.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await logButton(page).tap();
    await expect(squat.getByTestId('set-row')).toHaveCount(1);

    await context.setOffline(true);
    // Searching and adding another exercise must also work without a network.
    await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
    const dumbbell = page.getByTestId('exercise-dumbbell-bench-press');
    await dumbbell.getByRole('option', { name: '30 lb', exact: true }).tap();
    await dumbbell.getByRole('button', { name: 'More reps' }).tap();
    await logButton(page).tap();
    await expect(dumbbell.getByTestId('set-row')).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    const before = await savedSets(page);
    expect(before.map((s) => [s.order, s.reps, s.load])).toEqual([
      [0, 10, { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] }],
      [1, 11, { kind: 'dumbbell_each', unit: 'lb', total: 60 }],
    ]);
    const sessionBefore = await dbAll<Session>(page, 'sessions');

    await page.reload();
    await expect(page).toHaveURL(workoutUrl);
    await expect(dumbbell.getByTestId('set-target')).toHaveText('Set 2');
    await expect(dumbbell.getByTestId('stepper-reps')).toHaveText('11');
    await expect(dumbbell.getByTestId('wheel-total')).toHaveText('30lb');
    await expect(logButton(page)).toHaveText('Log set · 11 × 30 lb each');
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(squat.getByRole('button', { expanded: false })).toBeVisible();
    expect(await savedSets(page)).toEqual(before);
    expect(await dbAll<Session>(page, 'sessions')).toEqual(sessionBefore);

    await logButton(page).tap();
    await expect(dumbbell.getByTestId('set-row')).toHaveCount(2);
    const after = await savedSets(page);
    expect(after.slice(0, 2)).toEqual(before);
    expect(after[2]).toMatchObject({ sessionId: before[1]!.sessionId, exerciseId: 'dumbbell-bench-press', order: 2, reps: 11, load: before[1]!.load });
    expect(new Set(after.map((s) => s.id)).size).toBe(3);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 3 sets' })).toBeVisible();
    await page.reload();
    expect(await savedSets(page)).toEqual(after);
    expect(await dbAll<Session>(page, 'sessions')).toEqual([{ ...sessionBefore[0], endedAt: expect.any(Number) }]);
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});

test('changing starting resistance in Edit set keeps the active diagram, Log set and stored total in agreement', async ({ page }) => {
  const errors = watchErrors(page);
  try {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await addExercise(page, 'leg press', 'Leg Press');
    await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Plates on a machine/ }).tap();
    const card = page.getByTestId('exercise-leg-press');
    await card.getByRole('button', { name: 'Set starting weight' }).tap();
    await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'Plates only', exact: true }).tap();
    await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await expect(logButton(page)).toHaveText('Log set · 10 × 90 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    const original = (await savedSets(page))[0]!;

    await card.getByTestId('set-row').tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await edit.getByRole('button', { name: 'Plates only · Change' }).tap();
    const start = page.getByRole('dialog', { name: 'Starting weight', exact: true });
    await typeOnPad(start, '50');
    await start.getByRole('button', { name: 'Save starting weight' }).tap();
    await expect(start).toHaveCount(0);
    await expect(edit.getByTestId('plate-total')).toHaveText('140lb');
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    await expect(card.getByTestId('plate-math')).toHaveText('50 start + 2 × 45 = 140 lb');
    await expect(card.getByTestId('plate-total')).toHaveText('140lb');
    // Do not tap a plate here: that would rebuild the stale draft and hide the regression.
    await expect(logButton(page)).toHaveText('Log set · 10 × 140 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    const saved = await savedSets(page);
    expect(saved[0]!.id).toBe(original.id);
    for (const set of saved) expect(set.load).toEqual({ kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45] });
    await page.reload();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    expect(await savedSets(page)).toEqual(saved);
  } finally {
    expect(errors).toEqual([]);
  }
});

test('iPhone SE: adding bodyweight resistance keeps the set controls visible without scrolling, including during rest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });
  try {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await addExercise(page, 'wide grip pull', 'Wide Grip Pull Up');
    const card = page.getByTestId('exercise-wide-grip-pull-up');
    await card.getByRole('button', { name: 'Add weight', exact: true }).tap();
    await typeOnPad(card.getByRole('group', { name: 'Added weight', exact: true }), '25');
    await expect(card.getByTestId('bodyweight-added')).toHaveText('+ 25 lb added');

    const fits = async () => {
      const main = page.getByRole('main');
      // Check before tapping Log set: Playwright's automatic scrolling must not mask overflow.
      await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const control of [card.getByRole('heading', { name: 'Wide Grip Pull Up' }), card.getByTestId('set-target'), card.getByTestId('bodyweight-added'), card.getByRole('button', { name: 'Fewer reps' }), card.getByRole('button', { name: 'More reps' }), logButton(page)]) {
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
    await expect(logButton(page)).toHaveText('Log set · 10 reps + 25 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await fits();
    await expect(card.getByTestId('set-row')).toBeInViewport({ ratio: 1 });
    expect((await savedSets(page))[0]).toMatchObject({ reps: 10, load: { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 } });
  } finally {
    expect(errors).toEqual([]);
  }
});
