import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';

// PLAN 1.7h: workout saving fixes from the Codex bug hunts of Oct 24 (11:49 and 12:19).

type SetRow = { id: string; order: number; reps?: number; seconds?: number; load: { kind: string; total: number; barId?: string; barWeight?: number } };
type Gym = { id: string; isActive: boolean; bars: Record<string, number | null> };

const SQUAT = 'barbell-back-squat';
const sessionIdOf = (page: Page) => page.url().split('#/workout/')[1]!.split('/')[0]!;
const sets = async (page: Page) => (await dbAll<SetRow>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Edit set' });

/** Quick workout with the back squat, 135 lb on every row (45 a side). */
async function squat135(page: Page) {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQUAT);
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  return view;
}

async function logOne(page: Page) {
  const view = exerciseView(page, SQUAT);
  const before = await loggedRows(view).count();
  await page.waitForTimeout(400); // past the double tap guard
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}

/** A Log set write that never landed (the app was killed or IndexedDB failed): a marked draft on row 1. */
async function failedDraft(page: Page, reps: number) {
  const sid = sessionIdOf(page);
  await page.evaluate(
    ({ sid, key, reps }) => {
      const all = JSON.parse(localStorage.getItem('anygym-drafts') ?? '{}') as Record<string, Record<string, unknown>>;
      const load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, barId: 'olympic', perSide: [45], collars: 0 };
      all[sid] = { ...(all[sid] ?? {}), [key]: { id: 'never-landed', load, plates: [45], reps, type: 'normal', rev: 3, submitted: 3 } };
      localStorage.setItem('anygym-drafts', JSON.stringify(all));
    },
    { sid, key: `${SQUAT}@0`, reps },
  );
  await page.reload();
  await expect(exerciseView(page, SQUAT).getByTestId('reps-cell').first()).toHaveText(String(reps));
}

test('(1) Finish refuses while a Log set write failed; Try again saves it, then finishes', async ({ page }) => {
  const errors = watchErrors(page);
  await squat135(page);
  await logOne(page);
  await failedDraft(page, 7);
  const sid = sessionIdOf(page);

  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Set not saved' });
  await expect(sheet.getByRole('heading')).toHaveText('1 set did not save');
  // Nothing was finished or dropped: the workout is still active, the draft still on its row.
  const session = (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).find((s) => s.id === sid)!;
  expect(session.endedAt).toBeUndefined();
  expect(await sets(page)).toHaveLength(1);

  await sheet.getByRole('button', { name: 'Try again' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect((await sets(page)).map((s) => [s.reps, s.load.total])).toEqual([
    [8, 135],
    [7, 135],
  ]);
  expect((await sets(page))[1]!.id).toBe('never-landed');
  expect(errors).toEqual([]);
});

test('(1) "Finish without it" is the explicit discard: the failed set is dropped, the logged one saved', async ({ page }) => {
  const errors = watchErrors(page);
  await squat135(page);
  await logOne(page);
  await failedDraft(page, 7);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('dialog', { name: 'Set not saved' }).getByRole('button', { name: 'Finish without it' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  expect((await sets(page)).map((s) => s.reps)).toEqual([8]);
  expect(await page.evaluate(() => localStorage.getItem('anygym-drafts'))).toBeNull();
  expect(errors).toEqual([]);
});

test('(5) Edit set keeps reps after the exercise is switched to Timed', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(page);
  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await page.getByRole('button', { name: /^Loaded with: Plates on a bar/ }).tap();
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Timed/ }).tap();
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);

  await loggedRows(view).first().tap();
  await expect(editSheet(page).getByTestId('stepper-reps')).toHaveText('8');
  await expect(editSheet(page).getByTestId('stepper-seconds')).toHaveCount(0);
  await editSheet(page).getByRole('button', { name: 'More reps' }).tap();
  await editSheet(page).getByRole('button', { name: 'Save' }).tap();
  await expect(editSheet(page)).toHaveCount(0);
  const [saved] = await sets(page);
  expect(saved).toMatchObject({ reps: 9, load: { kind: 'barbell', total: 135 } });
  expect(saved!.seconds).toBeUndefined();
  expect(errors).toEqual([]);
});

test('(6) changing the bar inside Edit set saves that bar; a later edit keeps it after its weight changed', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, bars: { ...gym.bars, smith: 30 } }] });

  const view = await squat135(page);
  await logOne(page);
  await loggedRows(view).first().tap();
  await editSheet(page).getByTestId('bar-link').tap();
  await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Smith bar/ }).tap();
  await expect(editSheet(page).getByTestId('plate-total')).toHaveText('120lb');
  await editSheet(page).getByRole('button', { name: 'Save' }).tap();
  await expect(editSheet(page)).toHaveCount(0);
  expect((await sets(page))[0]!.load).toMatchObject({ barId: 'smith', barWeight: 30, total: 120 });

  // The Smith bar is re-weighed at 35 since: an edit of the old set still starts from its own bar.
  const now = (await dbAll<Gym>(page, 'gyms')).find((g) => g.id === gym.id)!;
  await dbPut(page, { gyms: [{ ...now, bars: { ...now.bars, smith: 35 } }] });
  await page.reload();
  await loggedRows(exerciseView(page, SQUAT)).first().tap();
  await expect(editSheet(page).getByTestId('plate-total')).toHaveText('120lb');
  await editSheet(page).getByRole('button', { name: 'More reps' }).tap();
  await editSheet(page).getByRole('button', { name: 'Save' }).tap();
  await expect(editSheet(page)).toHaveCount(0);
  expect((await sets(page))[0]).toMatchObject({ reps: 9, load: { barId: 'smith', barWeight: 30, total: 120 } });
  expect(errors).toEqual([]);
});

test('(7) copying LAST TIME over a stopped hold: the cell and the saved set agree', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { plank: [{ seconds: 60, load: { kind: 'timed', unit: 'lb', total: 0 } }] });
  await quickWith(page, [['plank', 'Plank']]);
  const view = exerciseView(page, 'plank');
  await view.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1300);
  await view.getByRole('button', { name: 'Stop timer' }).tap();
  await expect(view.getByTestId('timer-clock')).toHaveText(/^[12] s$/);

  await view.getByRole('button', { name: 'Last time 60 s. Copy into set 1' }).tap();
  await expect(view.getByTestId('timer-clock')).toHaveText('1:00');
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 1: 60 s');
  await page.waitForTimeout(400);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await sets(page)).map((s) => s.seconds)).toEqual([60]);
  expect(errors).toEqual([]);
});

test('(8) a failed workout read shows Try again, never sends you home, and blocks Finish', async ({ page }) => {
  const errors = watchErrors(page);
  await squat135(page);
  await logOne(page);
  const url = page.url();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('reads-ok')) (window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = true;
  });
  await page.reload();
  await expect(page.getByTestId('load-error')).toHaveText(/Could not load this workout/);
  expect(page.url()).toBe(url);
  await expect(page.getByTestId('check-current')).toHaveCount(0);
  // No number the app is not sure of: no set count, no total, no rest bar (Codex 1.7h review (3)).
  await expect(page.getByTestId('live-stats')).toHaveText('');
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByRole('status').filter({ hasText: 'Could not load this workout. Try again.' })).toBeVisible();
  expect(page.url()).toBe(url);
  expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).every((s) => s.endedAt === undefined)).toBe(true);

  await page.evaluate(() => {
    sessionStorage.setItem('reads-ok', '1');
    (window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = false;
  });
  await page.getByTestId('load-error').getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  await expect(loggedRows(exerciseView(page, SQUAT))).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('(9) a pending draft stays on the current row when an earlier set is deleted and put back', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(page);
  await logOne(page);
  // Set 3: 10 reps instead of 8.
  await view.getByTestId('reps-cell').first().tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 3: 10 × 135 lb');

  await loggedRows(view).first().tap();
  await editSheet(page).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 2: 10 × 135 lb');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 3: 10 × 135 lb');
  expect(errors).toEqual([]);
});

test('(10) "Rest over" clears by itself after 2.5 s while the workout clock ticks', async ({ page }) => {
  const errors = watchErrors(page);
  await squat135(page);
  const sid = sessionIdOf(page);
  await page.evaluate((sid) => localStorage.setItem('anygym-rest', JSON.stringify({ sessionId: sid, endsAt: Date.now() + 1500, totalSec: 90 })), sid);
  await page.reload();
  const rest = page.getByTestId('rest-timer');
  await expect(rest).toBeVisible();
  await expect(rest).toHaveAttribute('aria-label', 'Rest over', { timeout: 4000 });
  await expect(rest).toHaveCount(0, { timeout: 4000 });
  expect(await page.evaluate(() => localStorage.getItem('anygym-rest'))).toBeNull();
  expect(errors).toEqual([]);
});

test('Codex 1.7h review (1): Finish, then Undo on Today: the ✓ logs a set again', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squat135(page);
  await logOne(page);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await page.getByTestId(`row-${SQUAT}`).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await logOne(page);
  await expect.poll(async () => (await sets(page)).length).toBe(2);
  expect(errors).toEqual([]);
});
