import { expect, test, type Locator, type Page } from './fixtures';
import type { Gym, Session, WorkoutSet } from '../src/db/types';

// PLAN 1.10c: one focused test per Codex bug hunt fix that the Codex tests do not already cover.
// (4) stack step, (11) starting resistance and (13) SE added weight are the Codex specs.

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

async function dbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const connection = req.result;
          const tx = connection.transaction(name, 'readonly');
          const read = tx.objectStore(name).getAll();
          tx.oncomplete = () => {
            connection.close();
            resolve(read.result as T[]);
          };
          tx.onabort = () => {
            connection.close();
            reject(tx.error);
          };
        };
      }),
    store,
  );
}

const savedSets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
// PLAN 1.7c: Log set is the ✓ of the current row in the set table.
const logButton = (page: Page) => page.getByTestId('check-current');
const picker = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const back = (page: Page) => page.getByRole('button', { name: 'Back to the list' }).tap();

async function quick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}

/** PLAN 1.7c picker: search, pick, "Add 1" (opens the exercise). Opens the picker from the list if needed. */
async function addExercise(page: Page, query: string, name: string) {
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  if (!(await sheet.isVisible())) {
    if (await page.getByRole('button', { name: 'Back to the list' }).isVisible()) await back(page);
    await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  }
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}

/** Weight cell of the first row still to do → picker → plates → Done (applies to the rows below too). */
async function pickPlates(page: Page, card: Locator, plates: string[]) {
  await card.getByTestId('weight-cell').first().tap();
  for (const p of plates) await picker(page).getByRole('button', { name: `Add ${p} lb plate to each side` }).tap();
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(picker(page)).toHaveCount(0);
}

/** Reps of the first row still to do, +n with the inline stepper. */
async function moreReps(card: Locator, n = 1) {
  await card.getByTestId('reps-cell').first().tap();
  for (let i = 0; i < n; i++) await card.getByRole('button', { name: 'More reps' }).tap();
  await card.getByRole('button', { name: 'Done', exact: true }).tap();
}

/** Finish → finish screen → Done → Today. */
async function finish(page: Page) {
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
}

async function typeOnPad(scope: Locator, value: string) {
  for (const digit of value) await scope.getByRole('button', { name: digit, exact: true }).tap();
}

const pause = (page: Page, ms = 400) => page.waitForTimeout(ms); // past the double tap guard

test('(1) Log set during "Start again" saves the live hold, not the earlier stop', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'plank', 'Plank');
  const card = page.getByTestId('exercise-plank');
  await card.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1200);
  await card.getByRole('button', { name: 'Stop timer' }).tap();
  await expect(card.getByTestId('timer-clock')).toHaveText('00:01');
  await pause(page);
  await card.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1500);
  // Running: the ✓ reads the clock at this very tap.
  await expect(logButton(page)).toHaveAccessibleName(/^Log set 1: [2-9] s$/);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  const [set] = await savedSets(page);
  expect(set!.seconds).toBeGreaterThanOrEqual(2);
  expect(set!.load).toEqual({ kind: 'timed', unit: 'lb', total: 0 });
  // The stopwatch is reset for the next hold.
  await expect(card.getByTestId('timer-clock')).toHaveText('00:00');
  expect(errors).toEqual([]);
});

test('(2) picked weight, reps and a running hold survive switching exercises and a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const squat = page.getByTestId('exercise-barbell-back-squat');
  await pickPlates(page, squat, ['45']);
  await moreReps(squat);
  await expect(logButton(page)).toHaveAccessibleName('Log set 1: 9 × 135 lb');

  // Another exercise opens: the squat view unmounts.
  await addExercise(page, 'plank', 'Plank');
  const plank = page.getByTestId('exercise-plank');
  await expect(squat).toHaveCount(0);
  await plank.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1100);

  await back(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(squat.getByTestId('weight-cell').first()).toHaveText('135');
  await expect(squat.getByTestId('reps-cell').first()).toHaveText('9');
  await expect(logButton(page)).toHaveAccessibleName('Log set 1: 9 × 135 lb');

  await page.reload();
  await expect(squat.getByTestId('weight-cell').first()).toHaveText('135');
  await expect(squat.getByTestId('reps-cell').first()).toHaveText('9');
  // The hold kept running through leaving its view and the reload.
  await back(page);
  await page.getByTestId('row-plank').tap();
  await expect(plank.getByRole('button', { name: 'Stop timer' })).toBeVisible();
  await expect.poll(async () => {
    const [m, s] = (await plank.getByTestId('timer-clock').textContent())!.split(':').map(Number);
    return m! * 60 + s!;
  }).toBeGreaterThanOrEqual(2);
  expect(await savedSets(page)).toEqual([]);

  // Logged: that row's draft is cleared; the running hold's draft stays.
  await back(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  await logButton(page).tap();
  await expect(squat.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]).toMatchObject({ reps: 9, load: { total: 135 } });
  const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym-drafts') ?? '{}') as Record<string, Record<string, unknown>>);
  const own = Object.keys(Object.values(drafts)[0] ?? {});
  expect(own).not.toContain('barbell-back-squat#0');
  expect(own).toContain('plank#0');
  expect(errors).toEqual([]);
});

test('(3) delete is written at once, Undo restores the same id and order, a failed delete offers Try again', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await pickPlates(page, card, []);
  // A fourth row, so the third set does not finish the exercise (which returns to the list).
  await card.getByRole('button', { name: '+ Add set' }).tap();
  for (let i = 0; i < 3; i++) {
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(i + 1);
    await pause(page);
  }
  const before = await savedSets(page);
  const edit = page.getByRole('dialog', { name: 'Edit set' });

  await card.getByTestId('set-row').nth(1).tap();
  await edit.getByRole('button', { name: 'Delete set' }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(2);
  await expect.poll(async () => (await savedSets(page)).map((s) => s.id)).toEqual([before[0]!.id, before[2]!.id]);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(3);
  await expect.poll(() => savedSets(page)).toEqual(before);

  // Storage refuses the delete: the set comes back with a message and Try again.
  await page.evaluate(() => {
    const w = window as unknown as { __realDelete: typeof IDBObjectStore.prototype.delete };
    w.__realDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function () {
      throw new DOMException('synthetic failure', 'UnknownError');
    };
  });
  await card.getByTestId('set-row').first().tap();
  await edit.getByRole('button', { name: 'Delete set' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Could not delete that set' })).toBeVisible();
  await expect(card.getByTestId('set-row')).toHaveCount(3);
  expect(await savedSets(page)).toEqual(before);
  await page.evaluate(() => {
    IDBObjectStore.prototype.delete = (window as unknown as { __realDelete: typeof IDBObjectStore.prototype.delete }).__realDelete;
  });
  await page.getByRole('button', { name: 'Try again', exact: true }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(2);
  await expect.poll(async () => (await savedSets(page)).map((s) => s.id)).toEqual([before[1]!.id, before[2]!.id]);

  // Finish right away counts exactly what is saved.
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-sets')).toHaveText('2');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 2 sets' })).toBeVisible();
  expect(errors.filter((e) => !e.includes('synthetic failure'))).toEqual([]);
});

test('(5) EZ Bar Curl asks for the EZ bar weight once and shows "+ bar" until answered', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  // No plan has an EZ bar move yet: put one in the workout in progress, then reload.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const tx = req.result.transaction('sessions', 'readwrite');
          const store = tx.objectStore('sessions');
          const all = store.getAll();
          all.onsuccess = () => {
            const s = (all.result as Session[]).find((x) => x.endedAt === undefined)!;
            store.put({ ...s, exerciseIds: ['ez-bar-curl'] });
          };
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.getByTestId('row-ez-bar-curl').tap();
  const card = page.getByTestId('exercise-ez-bar-curl');
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  if (!(await ask.isVisible())) await card.getByRole('button', { name: 'How do you load this?' }).tap();
  await ask.getByRole('button', { name: /Plates on a bar/ }).tap();

  // Unknown EZ bar: the honest "+ bar" form, no made up total, the ✓ waits.
  await card.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(picker(page).getByTestId('plate-total')).toContainText('+ bar');
  await expect(picker(page).getByTestId('plate-math')).toHaveCount(0);
  await expect(picker(page).getByRole('button', { name: 'What is EZ curl bar?' })).toBeVisible();
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(card.getByTestId('weight-cell').first()).toHaveText('20 + bar');
  await expect(card.getByTestId('set-status')).toHaveText('Set 1: Set the bar weight first');
  await expect(logButton(page)).toBeDisabled();

  await card.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: 'Set bar weight' }).tap();
  const prompt = page.getByRole('dialog', { name: 'EZ curl bar' }).filter({ has: page.getByRole('button', { name: 'Save bar weight' }) });
  await typeOnPad(prompt, '25');
  await prompt.getByRole('button', { name: 'Save bar weight' }).tap();
  await expect(prompt).toHaveCount(0);
  await expect(picker(page).getByTestId('plate-total')).toHaveText('45lb');
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(logButton(page)).toHaveAccessibleName('Log set 1: 8 × 45 lb');
  const gym = (await dbAll<Gym>(page, 'gyms'))[0]!;
  expect(gym.bars.ez_curl).toBe(25);
  expect(gym.bars.olympic).toBe(45);

  // Answered once: after a reload it is remembered, never asked again.
  await page.reload();
  await card.getByTestId('weight-cell').first().tap();
  await expect(picker(page).getByRole('button', { name: 'Bar: EZ curl 25 lb · Change' })).toBeVisible(); // PLAN 1.10d: the bar link names the bar
  await expect(picker(page).getByRole('button', { name: 'Set bar weight' })).toHaveCount(0);
  await picker(page).getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(picker(page)).toHaveCount(0);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]!.load).toEqual({ kind: 'barbell', unit: 'lb', total: 45, barWeight: 25, perSide: [10], barId: 'ez_curl' });
  expect(errors).toEqual([]);
});

test('(6) sheets are real dialogs: focus inside, Tab trapped, app inert, labelled Close, Escape closes only the top', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  // PLAN 1.7c: an empty quick workout opens the picker by itself.
  const add = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(add).toBeVisible();
  const inDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  await expect.poll(inDialog).toBe(true);
  expect(await page.locator('#root').getAttribute('inert')).toBe('');
  await expect(add.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await inDialog()).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inDialog()).toBe(true);
  }
  // The labelled Close button closes it, and the app is live again.
  await add.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(add).toHaveCount(0);
  await expect.poll(() => page.locator('#root').getAttribute('inert')).toBeNull();

  // Nested: the weight picker, its Starting weight sheet, then the ⓘ sheet on top. Escape closes only the top one.
  await addExercise(page, 'leg press', 'Leg Press');
  // PLAN 1.7c round 2: Leg Press is a plate loaded machine by the exercise list (no question).
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: 'Set starting weight' }).tap();
  const start = page.getByRole('dialog', { name: 'Starting weight' });
  await expect(start).toBeVisible();
  await start.getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
  const info = page.getByRole('dialog', { name: 'Plate loaded machine' });
  await expect(info).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Plate loaded machine');
  await page.keyboard.press('Escape');
  await expect(info).toHaveCount(0);
  await expect(start).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(start).toHaveCount(0);
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('(7) History lists finished workouts with date, name and sets; tap one for its sets', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/history');
  await expect(page.getByRole('heading', { name: 'No workouts yet' })).toBeVisible();

  // A quick workout with two squat sets.
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await pickPlates(page, card, ['45']);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await pause(page);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(2);
  await finish(page);
  await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 2 sets' })).toBeVisible();

  // A plan day with one set.
  await page.goto('./#/plans/ohrabah-split');
  await page.getByRole('button', { name: /Use this plan|Go to Today/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  const title = (await page.getByTestId('workout-title').textContent())!;
  await page.locator('[data-row]').first().tap();
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await page.waitForTimeout(600);
  if (await ask.count()) await ask.getByRole('button', { name: /Bodyweight/ }).tap();
  if (await logButton(page).isDisabled()) {
    await page.getByRole('button', { name: 'Start timer' }).tap();
    await page.waitForTimeout(1200);
  }
  await logButton(page).tap();
  await page.waitForTimeout(600);
  await finish(page);
  await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 1 set' })).toBeVisible();

  await page.getByRole('link', { name: 'History' }).tap();
  const rows = page.getByTestId('history-row');
  await expect(rows).toHaveCount(2);
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
  await expect(rows.nth(0)).toContainText(title);
  await expect(rows.nth(0)).toContainText('1 set');
  await expect(rows.nth(1)).toContainText('Quick workout');
  await expect(rows.nth(1)).toContainText(today);
  await expect(rows.nth(1)).toContainText('2 sets');

  await rows.nth(1).tap();
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  await expect(page.getByTestId('history-meta')).toHaveText(`${today} · 2 sets`);
  const squat = page.getByRole('region', { name: 'Barbell Back Squat' });
  await expect(squat.getByTestId('history-set')).toHaveText([/8 × 135 lb/, /8 × 135 lb/]);
  await page.getByRole('link', { name: 'Back to History' }).tap();
  await expect(rows).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('(9) iPhone landscape shows "Turn your phone upright"; the workout keeps its state', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await pickPlates(page, card, ['45']);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await pickPlates(page, card, ['25']);
  await moreReps(card);
  const guard = page.getByTestId('landscape-guard');
  await expect(guard).toBeHidden();

  const portrait = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(guard).toBeVisible();
  await expect(guard).toContainText('Turn your phone upright');
  const box = (await guard.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(844 - 1);
  expect(box.height).toBeGreaterThanOrEqual(390 - 1);
  // It covers everything, the set table's ✓ included (taps land on the card, not the app).
  await expect.poll(() => guard.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const hit = await logButton(page).evaluate((b) => {
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-testid="landscape-guard"]') !== null;
  });
  expect(hit).toBe(true);
  if (test.info().project.name === 'iPhone 15 Pro') await page.screenshot({ path: 'reports/shots/1.10c/landscape-guard.png' });

  await page.setViewportSize(portrait);
  await expect(guard).toBeHidden();
  await expect(card.getByTestId('weight-cell').first()).toHaveText('185');
  await expect(card.getByTestId('reps-cell').first()).toHaveText('9');
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await expect(logButton(page)).toHaveAccessibleName('Log set 2: 9 × 185 lb');
  expect(errors).toEqual([]);
});

test('(10) the dumbbell wheel inside the Edit set sheet can swipe sideways', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
  const card = page.getByTestId('exercise-dumbbell-bench-press');
  await card.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('option', { name: '30 lb', exact: true }).tap();
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await logButton(page).tap();
  await card.getByTestId('set-row').first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  const track = edit.getByRole('listbox', { name: 'Weight of one dumbbell' });
  await expect(track).toBeVisible();
  // Every element from the wheel up to the dialog must let the browser pan sideways.
  const chain = await track.evaluate((el) => {
    const out: Array<{ cls: string; touch: string }> = [];
    for (let n: Element | null = el; n && n.getAttribute('role') !== 'dialog'; n = n.parentElement) {
      out.push({ cls: n.className, touch: getComputedStyle(n).touchAction });
    }
    return out;
  });
  expect(chain[0]!.touch).toMatch(/pan-x/);
  for (const { cls, touch } of chain) expect(touch, cls).toMatch(/auto|manipulation|pan-x/);
  expect(errors).toEqual([]);
});

// The dumbbell wheel inside the weight picker sheet (PLAN 1.7c) must swipe sideways too.
test('(10b) the dumbbell wheel inside the weight picker sheet can swipe sideways', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
  await page.getByTestId('exercise-dumbbell-bench-press').getByTestId('weight-cell').first().tap();
  const track = picker(page).getByRole('listbox', { name: 'Weight of one dumbbell' });
  await expect(track).toBeVisible();
  const chain = await track.evaluate((el) => {
    const out: string[] = [];
    for (let n: Element | null = el; n && n.getAttribute('role') !== 'dialog'; n = n.parentElement) out.push(getComputedStyle(n).touchAction);
    return out;
  });
  expect(chain[0]).toMatch(/pan-x/);
  for (const touch of chain) expect(touch).toMatch(/auto|manipulation|pan-x/);
  expect(errors).toEqual([]);
});
