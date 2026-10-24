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
const logButton = (page: Page) => page.getByTestId('action-bar').getByRole('button').first();

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
  await expect(card.getByTestId('timer-seconds')).toHaveText('1 s');
  await pause(page);
  await card.getByRole('button', { name: 'Start again timer' }).tap();
  await page.waitForTimeout(1500);
  // Running: Log set reads the clock at this very tap.
  await expect(logButton(page)).toHaveText(/^Log set · [2-9] s$/);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  const [set] = await savedSets(page);
  expect(set!.seconds).toBeGreaterThanOrEqual(2);
  expect(set!.load).toEqual({ kind: 'timed', unit: 'lb', total: 0 });
  // The stopwatch is reset for the next hold.
  await expect(card.getByTestId('timer-clock')).toHaveText('00:00');
  expect(errors).toEqual([]);
});

test('(2) picked weight, reps and a running hold survive collapsing the card and a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const squat = page.getByTestId('exercise-barbell-back-squat');
  await squat.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await squat.getByRole('button', { name: 'More reps' }).tap();
  await expect(logButton(page)).toHaveText('Log set · 11 × 135 lb');

  // Another exercise opens: the squat card collapses (its inputs unmount).
  await addExercise(page, 'plank', 'Plank');
  const plank = page.getByTestId('exercise-plank');
  await expect(squat.getByRole('button', { expanded: false })).toBeVisible();
  await plank.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1100);

  await squat.getByRole('button', { expanded: false }).tap();
  await expect(squat.getByTestId('plate-total')).toHaveText('135lb');
  await expect(squat.getByTestId('stepper-reps')).toHaveText('11');
  await expect(logButton(page)).toHaveText('Log set · 11 × 135 lb');

  await page.reload();
  await expect(squat.getByTestId('plate-total')).toHaveText('135lb');
  await expect(squat.getByTestId('stepper-reps')).toHaveText('11');
  // The hold kept running through the collapse and the reload.
  await plank.getByRole('button', { expanded: false }).tap();
  await expect(plank.getByRole('button', { name: 'Stop timer' })).toBeVisible();
  await expect.poll(async () => Number((await plank.getByTestId('timer-seconds').textContent())!.split(' ')[0])).toBeGreaterThanOrEqual(2);
  expect(await savedSets(page)).toEqual([]);

  // Logged: the draft is cleared.
  await squat.getByRole('button', { expanded: false }).tap();
  await logButton(page).tap();
  await expect(squat.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]).toMatchObject({ reps: 11, load: { total: 135 } });
  const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym-drafts') ?? '{}') as Record<string, Record<string, unknown>>);
  const own = Object.values(drafts)[0] ?? {};
  expect(Object.keys(own)).toEqual(['plank']);
  expect(errors).toEqual([]);
});

test('(3) delete is written at once, Undo restores the same id and order, a failed delete offers Try again', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
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
  const card = page.getByTestId('exercise-ez-bar-curl');
  await card.getByRole('button', { name: 'How do you load this?' }).tap();
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Plates on a bar/ }).tap();

  // Unknown EZ bar: the honest "+ bar" form, no made up total, Log set waits.
  await card.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(card.getByTestId('plate-total')).toContainText('+ bar');
  await expect(card.getByTestId('plate-math')).toHaveCount(0);
  await expect(logButton(page)).toHaveText('Set the bar weight first');
  await expect(logButton(page)).toBeDisabled();
  await expect(card.getByRole('button', { name: 'What is EZ curl bar?' })).toBeVisible();

  await card.getByRole('button', { name: 'Set bar weight' }).tap();
  const prompt = page.getByRole('dialog', { name: 'EZ curl bar' }).filter({ has: page.getByRole('button', { name: 'Save bar weight' }) });
  await typeOnPad(prompt, '25');
  await prompt.getByRole('button', { name: 'Save bar weight' }).tap();
  await expect(prompt).toHaveCount(0);
  await expect(card.getByTestId('plate-total')).toHaveText('45lb');
  await expect(logButton(page)).toHaveText('Log set · 10 × 45 lb');
  const gym = (await dbAll<Gym>(page, 'gyms'))[0]!;
  expect(gym.bars.ez_curl).toBe(25);
  expect(gym.bars.olympic).toBe(45);

  // Answered once: after a reload it is remembered, never asked again.
  await page.reload();
  await expect(card.getByRole('button', { name: 'Bar: EZ curl 25 lb · Change' })).toBeVisible(); // PLAN 1.10d: the bar link names the bar
  await expect(card.getByRole('button', { name: 'Set bar weight' })).toHaveCount(0);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]!.load).toEqual({ kind: 'barbell', unit: 'lb', total: 45, barWeight: 25, perSide: [10] });
  expect(errors).toEqual([]);
});

test('(6) sheets are real dialogs: focus inside, Tab trapped, app inert, labelled Close, Escape closes only the top', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  const opener = page.getByRole('button', { name: '+ Add exercise' }).first();
  await opener.focus();
  await opener.tap();
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

  // Nested: Starting weight sheet, then its ⓘ sheet on top. Escape closes only the top one.
  await addExercise(page, 'leg press', 'Leg Press');
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Plates on a machine/ }).tap();
  await page.getByTestId('exercise-leg-press').getByRole('button', { name: 'Set starting weight' }).tap();
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
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await pause(page);
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 2 sets' })).toBeVisible();

  // A plan day with one set.
  await page.goto('./#/plans/ohrabah-split');
  await page.getByRole('button', { name: /Use this plan|Go to Today/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  const title = (await page.getByTestId('workout-title').textContent())!;
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await page.waitForTimeout(600);
  if (await ask.count()) await ask.getByRole('button', { name: /Bodyweight/ }).tap();
  if ((await logButton(page).textContent()) === 'Start the timer') {
    await page.getByRole('button', { name: 'Start timer' }).tap();
    await page.waitForTimeout(1200);
  }
  await logButton(page).tap();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
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
  await expect(squat.getByTestId('history-set')).toHaveText([/10 × 135 lb/, /10 × 135 lb/]);
  await page.getByRole('link', { name: 'Back to History' }).tap();
  await expect(rows).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('(9) iPhone landscape shows "Turn your phone upright"; the workout keeps its state', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await card.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await card.getByRole('button', { name: 'More reps' }).tap();
  const guard = page.getByTestId('landscape-guard');
  await expect(guard).toBeHidden();

  const portrait = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(guard).toBeVisible();
  await expect(guard).toContainText('Turn your phone upright');
  const box = (await guard.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(844 - 1);
  expect(box.height).toBeGreaterThanOrEqual(390 - 1);
  // It covers everything, the sticky Log set bar included (taps land on the card, not the app).
  await expect.poll(() => guard.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const hit = await logButton(page).evaluate((b) => {
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-testid="landscape-guard"]') !== null;
  });
  expect(hit).toBe(true);
  if (test.info().project.name === 'iPhone 15 Pro') await page.screenshot({ path: 'reports/shots/1.10c/landscape-guard.png' });

  await page.setViewportSize(portrait);
  await expect(guard).toBeHidden();
  await expect(card.getByTestId('plate-total')).toHaveText('185lb');
  await expect(card.getByTestId('stepper-reps')).toHaveText('11');
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await expect(logButton(page)).toHaveText('Log set · 11 × 185 lb');
  expect(errors).toEqual([]);
});

test('(10) the dumbbell wheel inside the Edit set sheet can swipe sideways', async ({ page }) => {
  const errors = watchErrors(page);
  await quick(page);
  await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
  const card = page.getByTestId('exercise-dumbbell-bench-press');
  await card.getByRole('option', { name: '30 lb', exact: true }).tap();
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
