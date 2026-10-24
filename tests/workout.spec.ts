import { expect, test, type Page } from './fixtures';
import {
  bar185,
  checkCurrent,
  dbAll,
  exerciseView,
  fitsOneScreen,
  loggedRows,
  pickExercises,
  quickWith,
  seedFinished,
  shotOn,
  watchErrors,
} from './workout-helpers';

// The workout flow of PLAN 1.7c (SPEC 20, 21.1): day list → exercise view → set table with a ✓
// per set, rest bar, edit / delete / undo, kill and restore, finish screen.

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

const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });

test('quick workout: picker, first weight, check, double tap, edit, delete with undo, reload, finish', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeWakeLock(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  const sessionId = page.url().split('/').pop()!;
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wl: number }).__wl)).toBeGreaterThanOrEqual(1);

  // The empty quick workout opens straight into the picker; adding one exercise opens it.
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}/barbell-back-squat$`));
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-guide')).toHaveText('First time: pick a weight you could lift 2 more reps with');
  // 3 × 8 to 12 by default; no weight is invented for a first time.
  await expect(view.getByTestId('set-todo')).toHaveCount(3);
  await expect(view.getByTestId('weight-cell')).toHaveText(['Set', 'Set', 'Set']);
  await expect(view.getByTestId('reps-cell')).toHaveText(['8', '8', '8']);
  await expect(checkCurrent(view)).toBeDisabled();
  await expect(view.getByTestId('set-status')).toHaveText('Set 1: Pick a weight');

  // First weight: the plate diagram in a sheet, applied to every row not logged yet.
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await expect(weightSheet(page).getByTestId('plate-math')).toHaveText('45 bar + 2 × (45 + 25) = 185 lb');
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell')).toHaveText(['185', '185', '185']);

  // Reps in place: the inline stepper.
  await view.getByTestId('reps-cell').first().tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('reps-cell').first()).toHaveText('10');

  // ✓: logged, rest bar at the bottom, the next row is current.
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(loggedRows(view).first()).toContainText('185');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(page.getByTestId('rest-clock')).toHaveText(/^1:(30|29|28)$/);
  await expect(page.getByTestId('live-stats')).toHaveText('1 set · Total lifted 1,850 lb');
  await expect(view.getByTestId('set-target')).toHaveText('Set 2 of 3 · 8 to 12 reps');

  // Double tap on a ✓: exactly one more set.
  await page.waitForTimeout(400);
  await checkCurrent(view).dblclick();
  await expect(loggedRows(view)).toHaveCount(2);
  await page.waitForTimeout(800);
  await expect(loggedRows(view)).toHaveCount(2);
  expect((await dbAll(page, 'sets')).length).toBe(2);

  // +15 and −15.
  const before = await page.getByTestId('rest-clock').textContent();
  await page.getByRole('button', { name: 'Add 15 seconds' }).tap();
  await expect(page.getByTestId('rest-clock')).not.toHaveText(before!);
  await expect(page.getByTestId('rest-clock')).toHaveText(/^1:4\d$/);
  await page.getByRole('button', { name: 'Take off 15 seconds' }).tap();
  await expect(page.getByTestId('rest-clock')).toHaveText(/^1:[23]\d$/);

  // Edit: reps 8 → 9 on set 2.
  await loggedRows(view).nth(1).tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit.getByTestId('plate-total')).toHaveText('185lb');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  await expect(loggedRows(view).nth(1)).toContainText('9');

  // Delete → toast → Undo → back with the same id and order.
  const setsBefore = await dbAll<{ id: string; order: number }>(page, 'sets');
  await loggedRows(view).nth(1).tap();
  await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Set deleted' })).toBeVisible();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  const setsAfter = await dbAll<{ id: string; order: number }>(page, 'sets');
  expect(setsAfter.sort((a, b) => a.order - b.order)).toEqual(setsBefore.sort((a, b) => a.order - b.order));

  // Kill and restore: the same exercise view, sets, rest and clock keep going.
  const t0 = await elapsedSec(page);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}/barbell-back-squat$`));
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(view.getByTestId('weight-cell')).toHaveText(['185']);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect.poll(() => elapsedSec(page), { timeout: 4000 }).toBeGreaterThan(t0);
  await page.getByRole('button', { name: 'Skip' }).tap();
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);

  // Back to the list: the row shows 2 of 3.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}$`));
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveAccessibleName(/2 of 3 done/);

  // Today shows Continue workout while it is active.
  await page.goto('./');
  await page.getByRole('button', { name: /Continue workout/ }).tap();
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}$`));

  // Finish → finish screen → Done → Today.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(new RegExp(`#/workout/${sessionId}/done$`));
  await expect(page.getByTestId('finish-sets')).toHaveText('2');
  await expect(page.getByTestId('finish-total')).toHaveText('3,515 lb');
  await expect(page.getByTestId('pr-chip')).toHaveCount(0); // no history, no records
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 2 sets' })).toBeVisible();
  const sessions = await dbAll<{ id: string; endedAt?: number }>(page, 'sessions');
  expect(sessions).toHaveLength(1);
  expect(typeof sessions[0]!.endedAt).toBe('number');
  expect(await page.evaluate(() => (window as unknown as { __wlr: number }).__wlr)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('unknown exercise: asked once how it is loaded, remembered after reload', async ({ page }) => {
  const errors = watchErrors(page);
  // PLAN 1.7c: almost every exercise is mapped; Forearm Finger Roll is one a coach cannot tell from the name.
  await quickWith(page, [['finger roll', 'Forearm Finger Roll']]);
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('button')).toHaveCount(8); // 7 choices + the labelled Close (1.10c)
  await ask.getByRole('button', { name: /Machine with a pin/ }).tap();
  await expect(ask).toHaveCount(0);
  const view = exerciseView(page, 'forearm-finger-roll');
  await expect(view.getByTestId('weight-cell')).toHaveCount(3);

  await page.reload();
  await expect(view.getByTestId('weight-cell')).toHaveCount(3);
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);

  // Pin 120 for every row, then ✓.
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('radio', { name: 'Pin at 120 lb' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view).first()).toContainText('120');
  const settings = await dbAll<{ exerciseId: string; gymId: string; loadType: string }>(page, 'exerciseSettings');
  expect(settings).toHaveLength(1);
  expect(settings[0]).toMatchObject({ exerciseId: 'forearm-finger-roll', loadType: 'stack' });
  expect(settings[0]!.gymId).not.toBe('');
  expect(errors).toEqual([]);
});

test('finishing an empty workout discards it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await page.getByRole('dialog', { name: 'Add exercise' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Empty workout' })).toBeVisible();
  // A double tap on Finish: the second tap must not land on Today (the Settings icon sits there).
  await page.getByRole('button', { name: 'Finish' }).dblclick();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Nothing logged · Workout discarded' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  expect(await dbAll(page, 'sessions')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a deleted hold is gone from storage at once (1.10c), and a double tap on Quick workout starts one', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).dblclick();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await dbAll(page, 'sessions')).toHaveLength(1);
  await pickExercises(page, [['plank', 'Plank']]);
  const view = exerciseView(page, 'plank');
  // Timed: SET · LAST TIME · HOLD · ✓, the timer under the table.
  await expect(view.getByTestId('weight-cell')).toHaveCount(0);
  await expect(checkCurrent(view)).toBeDisabled();
  await view.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1300);
  await view.getByRole('button', { name: 'Stop timer' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(loggedRows(view).first()).toContainText(/\d+ s/);
  await loggedRows(view).first().tap();
  await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(0);
  await expect.poll(() => dbAll(page, 'sets').then((s) => s.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('one screen exercise view on every phone: 5 rows, no page scroll, rest bar never covers a row', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 5 }, () => ({ reps: 10, load: bar185 })) });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(5);
  await checkCurrent(view).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await fitsOneScreen(page);
  await shotOn(page, '1.7c', 'exercise-view');
  const rest = (await page.getByTestId('rest-timer').boundingBox())!;
  for (const el of [view.getByRole('heading', { name: 'Barbell Back Squat' }), view.getByTestId('set-guide'), ...[0, 1].map((i) => loggedRows(view).nth(i)), ...[0, 1, 2].map((i) => view.getByTestId('set-todo').nth(i))]) {
    await expect(el).toBeInViewport({ ratio: 1 });
    const box = (await el.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(rest.y + 0.5);
  }
  // Rows are thumb sized.
  for (const b of await view.getByTestId('set-todo').first().getByRole('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test('set types, last time copy, the ⋯ menu (rest time, note, reorder, remove with undo)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 12, load: bar185 }, { reps: 9, load: { ...bar185, total: 135, perSide: [45] } }] });
  await quickWith(page, [
    ['back squat', 'Barbell Back Squat'],
    ['plank', 'Plank'],
  ]);
  // Two added: the list, in order.
  await expect(page.getByRole('list', { name: 'Exercises' }).getByRole('button')).toHaveCount(2);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');

  // Set type: normal → W → D → F, stored as kind + failure.
  const type = view.getByTestId('set-type').first();
  await type.tap();
  await expect(type).toHaveText('W');
  await type.tap();
  await expect(type).toHaveText('D');
  await type.tap();
  await expect(type).toHaveText('F');

  // LAST TIME copies that set into the row (row 2: 9 × 135).
  await expect(view.getByTestId('weight-cell').nth(1)).toHaveText('185');
  await view.getByRole('button', { name: /^Last time 9 × 135/ }).tap();
  await expect(view.getByTestId('weight-cell').nth(1)).toHaveText('135');
  await expect(view.getByTestId('reps-cell').nth(1)).toHaveText('9');

  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const first = (await dbAll<{ id: string; kind: string; failure?: boolean }>(page, 'sets')).find((s) => !s.id.startsWith('seed-'))!;
  expect(first).toMatchObject({ kind: 'work', failure: true });

  // ⋯ → Rest time 120 → the next set rests 2:00.
  await view.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  const menu = page.getByRole('dialog', { name: 'Barbell Back Squat options' });
  await expect(menu.getByRole('button', { name: /Replace/ })).toBeDisabled();
  await expect(menu.getByRole('button', { name: /Make a pair/ })).toBeDisabled();
  await expect(menu.getByRole('button', { name: /Remove/ })).toBeDisabled();
  await expect(menu.getByRole('button', { name: /Remove/ })).toContainText('Delete its sets first');
  await menu.getByRole('button', { name: /Rest time/ }).tap();
  const restSheet = page.getByRole('dialog', { name: 'Rest time' });
  await restSheet.getByRole('button', { name: 'More rest' }).tap();
  await restSheet.getByRole('button', { name: 'More rest' }).tap();
  await restSheet.getByRole('button', { name: 'Save' }).tap();
  await page.getByRole('button', { name: 'Skip' }).tap();
  await checkCurrent(view).tap();
  await expect(page.getByTestId('rest-clock')).toHaveText(/^(2:00|1:59|1:58)$/);

  // ⋯ → Add note → shown under the name.
  await view.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await page.getByRole('dialog', { name: 'Barbell Back Squat options' }).getByRole('button', { name: /Add note/ }).tap();
  await page.getByRole('dialog', { name: 'Add note' }).getByRole('textbox', { name: 'Note' }).fill('Belt on');
  await page.getByRole('dialog', { name: 'Add note' }).getByRole('button', { name: 'Save note' }).tap();
  await expect(view.getByTestId('set-plan')).toHaveText('Belt on');

  // Plank: move up, then remove (no sets) with Undo.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-plank').tap();
  await exerciseView(page, 'plank').getByRole('button', { name: 'More for Plank' }).tap();
  await page.getByRole('dialog', { name: 'Plank options' }).getByRole('button', { name: /Move up/ }).tap();
  await expect.poll(async () => (await dbAll<{ exerciseIds: string[]; endedAt?: number }>(page, 'sessions')).find((s) => s.endedAt === undefined)!.exerciseIds).toEqual(['plank', 'barbell-back-squat']);
  await exerciseView(page, 'plank').getByRole('button', { name: 'More for Plank' }).tap();
  await page.getByRole('dialog', { name: 'Plank options' }).getByRole('button', { name: /Remove/ }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await expect(page.getByTestId('row-plank')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('row-plank')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Exercises' }).getByRole('button').first()).toHaveAccessibleName(/^Plank/);
  expect(errors).toEqual([]);
});

test('finish screen calls out records from real history only', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('pr-chip')).toHaveText(['Barbell Back Squat: heaviest ever, 195 lb']);
  await shotOn(page, '1.7c', 'finish');
  expect(errors).toEqual([]);
});

test('first time hints: plates in the picker, then the check, never during rest', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const hint = page.getByTestId('hint');
  await view.getByTestId('weight-cell').first().tap();
  await expect(hint).toHaveText('Tap plates to load the bar. We add it up.');
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(hint).toHaveText('Tap the check when you finish a set');
  await expect(hint).toHaveCount(1);
  await checkCurrent(view).tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(900);
  await expect(hint).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('anygym-hints')))!)).toEqual({ plates: true, setCard: true });
  expect(errors).toEqual([]);
});

test('swipe left goes to the next exercise; reload keeps the route', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [
    ['back squat', 'Barbell Back Squat'],
    ['plank', 'Plank'],
  ]);
  await page.getByTestId('row-barbell-back-squat').tap();
  const main = exerciseView(page, 'barbell-back-squat');
  const box = (await main.boundingBox())!;
  const y = box.y + box.height - 120;
  // A finger swipe right to left (pointer events, as Safari sends them for touch).
  await main.dispatchEvent('pointerdown', { clientX: box.x + box.width - 40, clientY: y, pointerType: 'touch', isPrimary: true });
  await main.dispatchEvent('pointerup', { clientX: box.x + 60, clientY: y + 6, pointerType: 'touch', isPrimary: true });
  await expect(page).toHaveURL(/\/plank$/);
  await page.reload();
  await expect(exerciseView(page, 'plank')).toBeVisible();
  expect(errors).toEqual([]);
});
