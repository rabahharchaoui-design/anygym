import { expect, test, type Locator, type Page } from './fixtures';

// Quick workout, set card, rest timer, edit / delete / undo, kill and restore (PLAN 1.7).

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const shot = async (page: Page, name: string, target?: Locator) => {
  if (test.info().project.name !== 'iPhone 15 Pro') return;
  await page.waitForTimeout(450); // let springs settle
  await (target ?? page).screenshot({ path: `reports/shots/1.7/${name}.png` });
};

/** Every record of an IndexedDB store, read straight from the database. */
const dbAll = <T = Record<string, unknown>>(page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const q = req.result.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            req.result.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
    store,
  ) as Promise<T[]>;

// A fake Screen Wake Lock that counts requests and releases.
const fakeWakeLock = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __wl: number; __wlr: number };
    w.__wl = 0;
    w.__wlr = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          w.__wl++;
          const s = { released: false, release: async () => void ((s.released = true), w.__wlr++) };
          return s;
        },
      },
    });
  });

const elapsedSec = async (page: Page) => {
  const text = (await page.getByTestId('elapsed').textContent())!;
  return text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
};

const startQuick = async (page: Page) => {
  await page.goto('./');
  const start = page.getByRole('button', { name: /Quick workout/ });
  await expect(start).toBeVisible();
  return start;
};

const addExercise = async (page: Page, query: string, name: string) => {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
};

const tray = (scope: Locator | Page, label: string) => scope.getByRole('button', { name: `Add ${label} plate to each side` });

test('quick workout: log, double tap, edit, delete with undo, reload, finish', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeWakeLock(page);
  const start = await startQuick(page);
  await shot(page, 'today-quick-workout');
  await start.tap();

  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Empty workout' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wl: number }).__wl)).toBeGreaterThanOrEqual(1);
  const sessionId = page.url().split('/').pop()!;

  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await expect(card.getByTestId('set-target')).toHaveText('Set 1');
  await expect(card.getByText('First time: pick a weight you could lift 2 more reps with')).toBeVisible();

  await tray(card, '45 lb').tap();
  await tray(card, '25 lb').tap();
  await expect(card.getByTestId('plate-total')).toHaveText('185lb');
  await expect(card.getByTestId('plate-math')).toHaveText('45 bar + 2 × (45 + 25) = 185 lb');

  // Reps stepper: one more, one less, back at 10.
  await expect(card.getByTestId('stepper-reps')).toHaveText('10');
  await card.getByRole('button', { name: 'More reps' }).tap();
  await expect(card.getByTestId('stepper-reps')).toHaveText('11');
  await card.getByRole('button', { name: 'Fewer reps' }).tap();
  await expect(card.getByTestId('stepper-reps')).toHaveText('10');

  // Log set lives in the sticky bar and says what it will log.
  const logButton = page.getByTestId('action-bar').getByRole('button', { name: 'Log set · 10 × 185 lb' });
  await expect(logButton).toBeInViewport();
  const box0 = (await logButton.boundingBox())!;
  await logButton.tap();
  const rows = card.getByTestId('set-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('10 × 185 lb');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(page.getByTestId('rest-clock')).toHaveText(/^1:(30|29|28)$/);
  // No layout shift: the rest bar appears without moving Log set.
  await page.waitForTimeout(400);
  expect(await logButton.boundingBox()).toEqual(box0);
  await expect(logButton).toBeInViewport();
  await expect(card.getByTestId('set-target')).toHaveText('Set 2');
  // The load stays for the next set.
  await expect(card.getByTestId('plate-total')).toHaveText('185lb');
  await shot(page, 'workout-logged-row');
  await page.getByRole('main').evaluate((el) => el.scrollTo(0, 0));
  await shot(page, 'workout-logged-rest');

  // Double tap (a while after the last set, so the tap guard is clear): exactly one more set.
  await page.waitForTimeout(500);
  await logButton.dblclick();
  await expect(rows).toHaveCount(2);
  await page.waitForTimeout(800);
  await expect(rows).toHaveCount(2);
  expect((await dbAll(page, 'sets')).length).toBe(2);

  // +15 s and Skip.
  const before = await page.getByTestId('rest-clock').textContent();
  await page.getByRole('button', { name: 'Add 15 seconds' }).tap();
  await expect(page.getByTestId('rest-clock')).not.toHaveText(before!);
  await expect(page.getByTestId('rest-clock')).toHaveText(/^1:4\d$/);

  // Edit: reps 10 → 11.
  await rows.nth(1).tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit).toBeVisible();
  await expect(edit.getByTestId('plate-total')).toHaveText('185lb');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await expect(edit.getByTestId('stepper-reps')).toHaveText('11');
  await edit.evaluate((el) => el.querySelector('[class*="scrollBody"]')?.scrollTo(0, 0));
  await shot(page, 'edit-set-sheet');
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  await expect(rows.nth(1)).toContainText('11 × 185 lb');

  // Delete → toast → Undo → back with the same id and order.
  const setsBefore = await dbAll<{ id: string; order: number; reps: number }>(page, 'sets');
  await rows.nth(1).tap();
  await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Set deleted' })).toBeVisible();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('11 × 185 lb');
  const setsAfter = await dbAll<{ id: string; order: number; reps: number }>(page, 'sets');
  expect(setsAfter.sort((a, b) => a.order - b.order)).toEqual(setsBefore.sort((a, b) => a.order - b.order));

  // Kill and restore: same screen, sets intact, rest timer and the clock keep going.
  const t0 = await elapsedSec(page);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}$`));
  const cardAgain = page.getByTestId('exercise-barbell-back-squat');
  await expect(cardAgain.getByTestId('set-row')).toHaveCount(2);
  await expect(cardAgain.getByTestId('set-row').nth(1)).toContainText('11 × 185 lb');
  await expect(cardAgain.getByTestId('set-target')).toHaveText('Set 3');
  await expect(cardAgain.getByTestId('plate-total')).toHaveText('185lb');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect.poll(() => elapsedSec(page), { timeout: 4000 }).toBeGreaterThan(t0);

  // Skip the rest.
  await page.getByRole('button', { name: 'Skip' }).tap();
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);

  // Today shows Continue workout while it is active.
  await page.goto('./');
  await page.getByRole('button', { name: /Continue workout/ }).tap();
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}$`));

  // Finish.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 2 sets' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  const sessions = await dbAll<{ id: string; endedAt?: number }>(page, 'sessions');
  expect(sessions).toHaveLength(1);
  expect(sessions[0]!.id).toBe(sessionId);
  expect(typeof sessions[0]!.endedAt).toBe('number');
  expect(await page.evaluate(() => (window as unknown as { __wlr: number }).__wlr)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('unknown exercise: asked once how it is loaded, remembered after reload', async ({ page }) => {
  const errors = watchErrors(page);
  await (await startQuick(page)).tap();
  await addExercise(page, 'leg press', 'Leg Press');
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('button')).toHaveCount(7);
  await shot(page, 'load-type-sheet');
  await ask.getByRole('button', { name: /Machine with a pin/ }).tap();
  await expect(ask).toHaveCount(0);
  const card = page.getByTestId('exercise-leg-press');
  await expect(card.getByRole('radiogroup', { name: 'Pin position' })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('exercise-leg-press').getByRole('radiogroup', { name: 'Pin position' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);

  // Pick 120 on the pin and log it.
  const c = page.getByTestId('exercise-leg-press');
  await c.getByRole('radio', { name: 'Pin at 120 lb' }).tap();
  await page.getByRole('button', { name: 'Log set · 10 × 120 lb' }).tap();
  await expect(c.getByTestId('set-row').first()).toContainText('10 × 120 lb');
  const settings = await dbAll<{ exerciseId: string; gymId: string; loadType: string }>(page, 'exerciseSettings');
  expect(settings).toHaveLength(1);
  expect(settings[0]).toMatchObject({ exerciseId: 'leg-press', loadType: 'stack' });
  expect(settings[0]!.gymId).not.toBe('');

  // Adding it again later does not ask again.
  await addExercise(page, 'leg press', 'Leg Press, added');
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('finishing an empty workout discards it', async ({ page }) => {
  const errors = watchErrors(page);
  await (await startQuick(page)).tap();
  await expect(page.getByRole('heading', { name: 'Empty workout' })).toBeVisible();
  // A double tap on Finish: the second tap must not land on Today (the Settings icon sits there).
  await page.getByRole('button', { name: 'Finish' }).dblclick();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Nothing logged · Workout discarded' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  expect(await dbAll(page, 'sessions')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a deleted set is gone for good after 5 s, and a double tap on Quick workout starts one', async ({ page }) => {
  const errors = watchErrors(page);
  await (await startQuick(page)).dblclick();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await dbAll(page, 'sessions')).toHaveLength(1);
  await addExercise(page, 'plank', 'Plank');
  const card = page.getByTestId('exercise-plank');
  // Timed: start, hold, stop, log.
  await card.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1300);
  await card.getByRole('button', { name: 'Stop timer' }).tap();
  await page.getByRole('button', { name: /^Log set · \d+ s$/ }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await expect(card.getByTestId('set-row').first()).toContainText(/\d+ s/);
  await card.getByTestId('set-row').first().tap();
  await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(0);
  expect(await dbAll(page, 'sets')).toHaveLength(1); // held for undo
  await expect.poll(() => dbAll(page, 'sets').then((s) => s.length), { timeout: 8000 }).toBe(0);
  expect(errors).toEqual([]);
});

// SPEC 13.5 (PLAN 1.7a): the current set fits one screen, even on iPhone SE, and a repeat is one tap.
const shot17a = async (page: Page, name: string) => {
  const project = test.info().project.name;
  if (project !== 'iPhone SE' && project !== 'iPhone 17 Pro Max') return;
  await page.waitForTimeout(450); // let springs settle
  await page.screenshot({ path: `reports/shots/1.7a/${name}-${project.replace(/ /g, '-')}.png` });
};

const fitsOneScreen = async (page: Page, card: Locator) => {
  const main = page.getByRole('main');
  const { scrollHeight, clientHeight } = await main.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize()!.height);
  for (const el of [
    card.getByTestId('plate-total'),
    card.getByTestId('stepper-reps'),
    card.getByRole('button', { name: 'More reps' }),
    card.getByRole('group', { name: 'Plates' }),
    page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ }),
  ]) {
    await expect(el).toBeInViewport({ ratio: 1 });
  }
};

test('one screen set card: no scrolling, one row tray, prefilled repeat is one tap', async ({ page }) => {
  const errors = watchErrors(page);
  await (await startQuick(page)).tap();
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await expect(card.getByTestId('set-guide')).toHaveText('First time: pick a weight you could lift 2 more reps with');

  // One row tray: every plate button on the same line.
  const tops = await card.getByRole('group', { name: 'Plates' }).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops.length).toBe(6);
  expect(new Set(tops).size).toBe(1);
  for (const b of await card.getByRole('group', { name: 'Plates' }).getByRole('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }

  await tray(card, '45 lb').tap();
  await tray(card, '25 lb').tap();
  await expect(card.getByTestId('plate-total')).toHaveText('185lb');
  await expect(card.getByTestId('plate-math')).toHaveText('45 bar + 2 × (45 + 25) = 185 lb');
  await shot17a(page, 'set-card');
  await fitsOneScreen(page, card);

  // Log set: the card moves on to set 2 by itself, rest starts, same weight and reps ready.
  const log = page.getByTestId('action-bar').getByRole('button', { name: 'Log set · 10 × 185 lb' });
  await log.tap();
  await expect(card.getByTestId('set-target')).toHaveText('Set 2');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(card.getByTestId('set-guide')).toHaveCount(0);
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await fitsOneScreen(page, card);
  await shot17a(page, 'set-card-resting');

  // A second exercise: the squat collapses to one line.
  await page.getByRole('button', { name: 'Skip' }).tap();
  await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
  const squatHead = card.getByRole('button', { expanded: false });
  await expect(squatHead).toBeVisible();
  expect((await squatHead.boundingBox())!.height).toBeLessThanOrEqual(56);
  await expect(squatHead).toContainText('1 set · 10 × 185 lb');
  // The dumbbell card (wheel) also fits one screen, with the squat line above it.
  const db = page.getByTestId('exercise-dumbbell-bench-press');
  await expect(db.getByRole('option', { name: '30 lb', exact: true })).toBeVisible();
  await db.getByRole('option', { name: '30 lb', exact: true }).tap();
  await expect(db.getByTestId('wheel-total')).toHaveText('30lb');
  await shot17a(page, 'set-card-dumbbell');
  const m = await page.getByRole('main').evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(m).toBeLessThanOrEqual(0);
  await expect(db.getByRole('button', { name: 'More reps' })).toBeInViewport({ ratio: 1 });

  // Next workout: the squat comes back prefilled from last time; logging it is ONE tap.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await (await startQuick(page)).tap();
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const again = page.getByTestId('exercise-barbell-back-squat');
  await expect(again.getByTestId('set-guide')).toHaveText('Last time (today): 10 × 185 lb');
  await expect(again.getByTestId('set-next')).toHaveText('Next: 10 × 185 lb · Aim for 10 or better');
  await expect(again.getByTestId('plate-total')).toHaveText('185lb');
  await expect(again.getByTestId('stepper-reps')).toHaveText('10');
  await page.getByTestId('action-bar').getByRole('button', { name: 'Log set · 10 × 185 lb' }).tap();
  await expect(again.getByTestId('set-row')).toHaveCount(1);
  await expect(again.getByTestId('set-row').first()).toContainText('10 × 185 lb');
  expect(errors).toEqual([]);
});

test('first time hints in the workout: plates, then Log set, never during rest', async ({ page }) => {
  const errors = watchErrors(page);
  await (await startQuick(page)).tap();
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  const hint = page.getByTestId('hint');
  await expect(hint).toHaveText('Tap plates to load the bar. We add it up.');
  await tray(card, '45 lb').tap();
  await expect(hint).toHaveText('Tap Log set when you finish the set');
  await expect(hint).toHaveCount(1);
  await shot17a(page, 'hint-log-set');
  await page.getByTestId('action-bar').getByRole('button', { name: 'Log set · 10 × 135 lb' }).tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(900);
  await expect(hint).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('anygym-hints')))!)).toEqual({ plates: true, setCard: true });
  expect(errors).toEqual([]);
});
