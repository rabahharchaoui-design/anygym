import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, exerciseView, fillReps, loggedRows, pickExercises, setTableInFirstScreen, shotOn, watchErrors } from './workout-helpers';

// PLAN 2.0l, UI side: (7) a swipe or menu removal targets the row's identity taken when it started,
// never the row that moved into its place while it slid out (Codex bughunt 1811 #7); (8) ui-2.2e:
// the current reps read as tappable, the current ✓ reads as the action, one tap still logs.

const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });

async function squat(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  return exerciseView(page, 'barbell-back-squat');
}

/** Row i (and the rows below it) to bar + these plates per side. */
async function weigh(page: Page, view: Locator, i: number, plates: number[]) {
  await view.getByTestId('weight-cell').nth(i).tap();
  for (const p of plates) await weightSheet(page).getByRole('button', { name: `Add ${p} lb plate to each side` }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(weightSheet(page)).toHaveCount(0);
}

/** A, B, C at 185 lb for 4, 6 and 8 reps; every slide out made long (1.5 s) so a Log can land during it. */
async function threeRows(page: Page) {
  const view = await squat(page);
  await weigh(page, view, 0, [45, 25]);
  const rows = view.getByTestId('set-todo');
  await fillReps(view, rows.nth(0), 4);
  await fillReps(view, rows.nth(1), 6);
  await fillReps(view, rows.nth(2), 8);
  await expect(rows.getByTestId('reps-cell')).toHaveText(['4', '6', '8']);
  await page.evaluate(() => {
    const st = window.setTimeout.bind(window);
    (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms?: number, ...a: unknown[]) => st(fn, ms === 180 ? 1500 : ms, ...a);
  });
  return view;
}

async function swipeLeft(page: Page, row: Locator) {
  const b = (await row.boundingBox())!;
  const y = b.y + b.height / 2;
  const x0 = b.x + b.width - 24;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 - (b.width * 0.75 * i) / 10, y);
  await page.mouse.up();
}

/** After C (8 reps) logged during B's removal: A (4 reps) is still there; B (6) is there or gone, nothing else. */
async function aSurvives(page: Page, view: Locator) {
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(loggedRows(view).first().getByTestId('saved-amount')).toHaveText('8');
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.count()) await skip.tap();
  await page.waitForTimeout(2200); // past the long slide out and collapse
  const left = (await view.getByTestId('set-todo').getByTestId('reps-cell').allInnerTexts()).map((t) => t.trim());
  expect([['4', '6'], ['4']]).toContainEqual(left);
}

test('(7) swipe B, C logs during the slide out: A is never removed', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await threeRows(page);
  const rows = view.getByTestId('set-todo');
  await swipeLeft(page, rows.nth(1));
  await rows.nth(2).getByTestId('check').click();
  await aSurvives(page, view);
  expect(errors).toEqual([]);
});

test('(7) Remove set from B\'s menu, C logs during the slide out: A is never removed', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await threeRows(page);
  const rows = view.getByTestId('set-todo');
  await rows.nth(1).getByTestId('set-type').tap();
  await page.getByTestId('remove-set').tap();
  await rows.nth(2).getByTestId('check').click();
  await aSurvives(page, view);
  expect(errors).toEqual([]);
});

test('(7) a plain swipe still removes exactly that row', async ({ page }) => {
  const view = await threeRows(page);
  await swipeLeft(page, view.getByTestId('set-todo').nth(1));
  await page.waitForTimeout(2200);
  await expect(view.getByTestId('set-todo').getByTestId('reps-cell')).toHaveText(['4', '8']);
});

test('(8) the current reps show they can change, the current ✓ says Log the first time, one tap logs @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat(page);
  await weigh(page, view, 0, [45, 25]);
  const current = view.locator('[data-state="current"]');
  const reps = current.getByTestId('reps-cell');
  await expect(reps).toHaveAttribute('data-cue', '');
  await expect(view.getByTestId('set-todo').nth(1).getByTestId('reps-cell')).not.toHaveAttribute('data-cue', '');
  const label = checkCurrent(view).getByTestId('check-label');
  await expect(label).toHaveText('Log');
  await expect(label).toBeVisible();
  // The ✓ keeps its 48 pt target and its accessible name.
  const box = (await checkCurrent(view).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  await expect(checkCurrent(view)).toHaveAccessibleName(/^Log set 1: /);
  await setTableInFirstScreen(page);
  await shotOn(page, '2.0l', 'reps-cue-log-label');

  // The first reps edit: the dotted line goes for that row.
  await reps.tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(reps).not.toHaveAttribute('data-cue', '');

  // One tap logs; the label is a first time aid only.
  const before = (await checkCurrent(view).boundingBox())!;
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Skip' }).tap();
  await expect(checkCurrent(view).getByTestId('check-label')).toHaveCount(0);
  const after = (await checkCurrent(view).boundingBox())!;
  expect(Math.round(after.width)).toBe(Math.round(before.width));
  await shotOn(page, '2.0l', 'after-first-log');
  expect(errors).toEqual([]);
});
