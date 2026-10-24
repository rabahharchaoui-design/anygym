import { expect, test, type Page } from './fixtures';
import { makeGym } from '../src/db/gyms';
import { dbAll, dbPut, exerciseView, loggedRows, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7f (Codex bughunt 1024-0800 findings 3 and 4).

type Rec = Record<string, unknown>;
const failReads = (page: Page, on: boolean) => page.evaluate((v) => ((window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = v), on);

/**
 * An active workout at a kg gym that has no collars today, with two 65 kg back squat sets lifted
 * with competition collars (20 bar + 2 × 20 + 5): one legacy record without the collars field,
 * one new record with it.
 */
async function seed65(page: Page): Promise<string> {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const old = (await dbAll<Rec>(page, 'gyms')).map((g) => ({ ...g, isActive: false }));
  const gym = { ...makeGym({ name: 'Kilo gym', type: 'full', unit: 'kg', isActive: true }), collars: 'none' };
  const sid = 'collars-65';
  const legacy = { kind: 'barbell', unit: 'kg', total: 65, barWeight: 20, perSide: [20] };
  const set = (i: number, load: Rec) => ({ id: `${sid}-${i}`, sessionId: sid, exerciseId: 'barbell-back-squat', order: i, kind: 'work', uncertain: false, reps: 5, load });
  await dbPut(page, {
    gyms: [...old, gym],
    sessions: [{ id: sid, gymId: gym.id, startedAt: Date.now() - 600_000, imported: false, exerciseIds: ['barbell-back-squat'] }],
    sets: [set(0, legacy), set(1, { ...legacy, barId: 'olympic', collars: 5 })],
  });
  await page.goto(`./#/workout/${sid}/barbell-back-squat`);
  await expect(loggedRows(exerciseView(page, 'barbell-back-squat'))).toHaveCount(2);
  return sid;
}

const savedLoads = async (page: Page) =>
  (await dbAll<{ order: number; reps: number; load: Rec }>(page, 'sets')).sort((a, b) => a.order - b.order);

test('a 65 kg set lifted with collars still shows and saves 65 when the gym now has no collars', async ({ page }) => {
  const errors = watchErrors(page);
  await seed65(page);
  const view = exerciseView(page, 'barbell-back-squat');
  const edit = page.getByRole('dialog', { name: 'Edit set' });

  // Set 1, legacy record: the collars are recovered from its own numbers. Reps only Save keeps 65.
  await loggedRows(view).nth(0).tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  await expect(edit.getByTestId('plate-math')).toHaveText('20 bar + 2 × 20 + 5 collars = 65 kg');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  expect((await savedLoads(page))[0]).toMatchObject({ reps: 6, load: { total: 65, barWeight: 20, perSide: [20] } });

  // Set 2, stored collars: add a plate (70), take it off again (65), Save keeps 65 with its collars.
  await loggedRows(view).nth(1).tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  await edit.getByRole('button', { name: 'Add 2.5 kg plate to each side' }).tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('70kg');
  await edit.getByTestId('remove-right').tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  expect((await savedLoads(page))[1]).toMatchObject({ reps: 5, load: { total: 65, barWeight: 20, perSide: [20], collars: 5 } });

  // A new set uses today's gym setting: no collars, 20 + 2 × 20 = 60.
  await expect(view.getByTestId('weight-cell').first()).toHaveText('60');
  expect(errors).toEqual([]);
});

test('History: a failed read says "Could not load workouts · Try again", never "No workouts yet"', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } }] });
  await failReads(page, true);
  await page.getByRole('link', { name: 'History' }).tap();
  const error = page.getByTestId('load-error');
  await expect(error).toHaveText('Could not load workoutsTry again');
  await expect(page.getByText('No workouts yet')).toHaveCount(0);
  const retry = error.getByRole('button', { name: 'Try again' });
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await page.waitForTimeout(400); // the line has risen in
  await page.screenshot({ path: `reports/shots/1.7f/history-error-${test.info().project.name.replace(/ /g, '-')}.png` });

  // Still failing: Try again stays honest.
  await retry.tap();
  await expect(error).toBeVisible();
  await expect(page.getByText('No workouts yet')).toHaveCount(0);

  await failReads(page, false);
  await error.getByRole('button', { name: 'Try again' }).tap();
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await expect(page.getByTestId('history-row')).toContainText('1 set');
  expect(errors).toEqual([]);
});

test('Today: a failed read shows the error line instead of "Pick a plan", and keeps the last good plan card', async ({ page }) => {
  const errors = watchErrors(page);
  // Fails reads from the very first one, until the test marks reads as fine for later loads.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('reads-ok')) (window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = true;
  });
  await page.goto('./');
  const error = page.getByTestId('load-error');
  await expect(error).toHaveText('Could not load workoutsTry again');
  await expect(page.getByRole('button', { name: 'See plans' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Quick workout/ })).toHaveCount(0);
  await failReads(page, false);
  await error.getByRole('button', { name: 'Try again' }).tap();
  await expect(error).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();

  // A later failure keeps the plan card it had.
  await page.evaluate(() => sessionStorage.setItem('reads-ok', '1'));
  await usePlan(page);
  await expect(page.getByTestId('day-card-title')).toContainText('Day 1');
  await failReads(page, true);
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2/ }).tap();
  await expect(error).toBeVisible();
  await expect(page.getByTestId('day-card-title')).toContainText('Day 1');
  await failReads(page, false);
  await error.getByRole('button', { name: 'Try again' }).tap();
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId('day-card-title')).toContainText('Day 2');
  expect(errors).toEqual([]);
});

test('Finish screen: a failed read says "Could not load this workout" with Try again, and Done still works', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } }] });
  const sid = (await dbAll<{ id: string }>(page, 'sessions'))[0]!.id;
  await failReads(page, true);
  await page.goto(`./#/workout/${sid}/done`);
  const error = page.getByTestId('load-error');
  await expect(error).toHaveText('Could not load this workoutTry again');
  const done = page.getByRole('button', { name: 'Done' });
  await expect(done).toBeEnabled();

  await failReads(page, false);
  await error.getByRole('button', { name: 'Try again' }).tap();
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId('finish-sets')).toHaveText('1');
  await expect(page.getByTestId('finish-total')).toHaveText('675 lb');

  // Failing again on the way out: Done still leaves (no false set count claimed).
  await failReads(page, true);
  await done.tap();
  await expect(page).toHaveURL(/#\/$/);
  expect(errors).toEqual([]);
});
