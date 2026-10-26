// PLAN 2.0a: the finish screen decides the next day on its own (60% of the day's working sets
// moves on), says it in one quiet line with Change, counts only working exercises, and shows a
// plate loaded machine's real total (start + 2 × plates per side, SPEC 5.4).
import { expect, test, type Page } from './fixtures';
import type { PlanState, WorkoutSet } from '../src/db/types';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
import { seedWorkingSets } from './helpers/planSeed';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, shotOn, usePlan, watchErrors } from './workout-helpers';

const DAY1 = 'Next up: Day 1 · Legs (hamstring focus)';
const plan = async (page: Page) => (await dbAll<PlanState>(page, 'planState'))[0]!;

/** Today → Start Day 1 → one squat set logged through the real check (a first time weight is the empty bar). */
async function startAndLogOne(page: Page) {
  await simulateSafeAreas(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  if (!(await checkCurrent(view).isEnabled())) {
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
  }
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-title')).toBeVisible();
}

test('below 60% keeps Day 1: no radios, one Next up line, Today keeps Day 1 @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await startAndLogOne(page);
  // 1 + 21 = 22 of 37 working sets (59.5%).
  expect(await seedWorkingSets(page, 21)).toBe(37);
  await finish(page);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByTestId('finish-choice-helper')).toHaveCount(0);
  await expect(page.getByTestId('finish-next')).toHaveText(DAY1);
  // Stretches are not exercises to finish: 12, not 16.
  await expect(page.getByTestId('finish-progress')).toHaveText(/^\d+ of 12 exercises finished( · \d+ started)?$/);
  await checkLayout(page, { primary: page.getByRole('button', { name: 'Done', exact: true }) });
  await page.waitForTimeout(900);
  await shotOn(page, '2.0a', 'finish-keep');
  expect((await plan(page)).nextDayIndex).toBe(0);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 · Legs \(hamstring focus\)/);
  // Kept up next AND part done: the next highlight with its 22 of 37 (0.59) ring drawn.
  const day1 = page.getByTestId('week-day-1');
  await expect(day1).toHaveAttribute('data-state', 'next');
  await expect(day1.getByRole('button')).toHaveAccessibleName(/up next, part done\. Pick this day$/);
  const mark = day1.locator('[data-share]');
  await expect(mark).toHaveCount(1);
  expect(Number(await mark.getAttribute('data-share'))).toBeCloseTo(22 / 37, 5);
  expect((22 / 37).toFixed(2)).toBe('0.59');
  const arc = await mark.locator('circle').last().evaluate((c) => {
    const dash = Number(c.getAttribute('stroke-dasharray'));
    return 1 - Number(c.getAttribute('stroke-dashoffset')) / dash;
  });
  expect(arc).toBeCloseTo(22 / 37, 2);
  expect(errors).toEqual([]);
});

test('60% or more moves on to Day 2 with a partial ring on Day 1 @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await startAndLogOne(page);
  // 1 + 22 = 23 of 37 working sets (62%).
  await seedWorkingSets(page, 22);
  await finish(page);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 2 · Chest and triceps');
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved · 23 sets');
  await page.waitForTimeout(900);
  await shotOn(page, '2.0a', 'finish-move-on');
  const st = await plan(page);
  expect(st).toMatchObject({ nextDayIndex: 1, doneDays: [] });
  expect(st.partial?.[0]).toBeCloseTo(23 / 37);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 · Chest and triceps/);
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'partial');
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  expect(errors).toEqual([]);
});

test('Change picks Day 4: saved at once, survives a reload, Today shows Day 4, Undo puts the plan back @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await startAndLogOne(page);
  const before = await plan(page);
  await finish(page);
  await expect(page.getByTestId('finish-next')).toHaveText(DAY1);
  const change = page.getByTestId('finish-change');
  // Small text, a 48 pt hit area (once its entrance spring has settled).
  await expect.poll(async () => { const b = (await change.boundingBox())!; return Math.min(b.width, b.height); }).toBeGreaterThanOrEqual(48);
  await change.tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' });
  await expect(sheet.getByRole('heading', { name: 'Which day next?' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Day 1 · / })).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(900);
  await shotOn(page, '2.0a', 'finish-change-sheet');
  await sheet.getByRole('button', { name: /^Day 4 · / }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 4 · Legs (quad focus)');
  expect((await plan(page)).nextDayIndex).toBe(3);
  // Saved, not screen state: a reload reads it back.
  await page.reload();
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 4 · Legs (quad focus)');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 4 · Legs \(quad focus\)/);
  // Undo on Today reopens the workout and the plan goes back exactly to where it was.
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect.poll(async () => (await plan(page)).nextDayIndex).toBe(before.nextDayIndex);
  expect(await plan(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('plate loaded machine: 50 start + 25 per side reads 8 × 100 lb on the finish screen, and keeps it', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-angled-machine-leg-press').tap();
  const view = exerciseView(page, 'angled-machine-leg-press');
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
  await picker.getByRole('button', { name: 'Set starting weight' }).tap();
  const start = page.getByRole('dialog', { name: 'Starting weight', exact: true });
  for (const digit of '50') await start.getByRole('button', { name: digit, exact: true }).tap();
  await start.getByRole('button', { name: 'Save starting weight' }).tap();
  await expect(start).toHaveCount(0);
  await picker.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await expect(picker.getByTestId('plate-total')).toHaveText('100lb');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(picker).toHaveCount(0);
  await expect(checkCurrent(view)).toHaveAccessibleName('Log set 1: 8 × 100 lb');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(view.getByTestId('saved-weight').first()).toHaveText('100');
  // The stored set holds the real total and its breakdown (SPEC 5.5).
  const set = (await dbAll<WorkoutSet>(page, 'sets'))[0]!;
  expect(set.load).toMatchObject({ kind: 'plate_machine', unit: 'lb', total: 100, barWeight: 50, perSide: [25] });
  await finish(page);
  const row = page.getByTestId('finish-exercise').filter({ hasText: 'Angled Machine Leg Press' });
  await expect(row).toContainText('8 × 100 lb');
  await page.waitForTimeout(900);
  await shotOn(page, '2.0a', 'finish-leg-press');
  // The machine's starting weight changes later: the saved workout keeps what was lifted.
  const gym = (await dbAll<{ id: string; isActive: boolean; equipmentWeights: Record<string, unknown> }>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, equipmentWeights: { ...gym.equipmentWeights, 'angled-machine-leg-press': { kind: 'starting_resistance', value: 70 } } }] });
  await page.reload();
  await expect(page.getByTestId('finish-exercise').filter({ hasText: 'Angled Machine Leg Press' })).toContainText('8 × 100 lb');
  expect(errors).toEqual([]);
});
