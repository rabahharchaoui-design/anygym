// Independent verification of PLAN 2.0a (tester). Counts from data/plans/*.json by hand.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import type { PlanState, WorkoutSet } from '../src/db/types';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
import { seedWorkingSets } from './helpers/planSeed';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, usePlan, watchErrors } from './workout-helpers';

const SHOTS = 'reports/shots/2.0a';
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/v-${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};
const ps = async (page: Page) => (await dbAll<PlanState>(page, 'planState'))[0]!;

// Own count: singles with "sets", not a stretch (no sets field) of Day 1.
type Block = { type: string; exercise?: string; sets?: number };
const plan5 = JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8')) as { days: Array<{ blocks: Block[] }> };
const day1 = plan5.days[0]!.blocks.filter((b) => b.sets !== undefined);
const SETS = day1.reduce((a, b) => a + b.sets!, 0);

async function start(page: Page) {
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}
async function logOne(page: Page) {
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
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-title')).toBeVisible();
}
async function dayWith(page: Page, n: number) {
  await start(page);
  await logOne(page);
  await seedWorkingSets(page, n - 1);
  await finish(page);
}

test('own count: Day 1 is 12 exercises / 37 sets; finish denominator', async ({ page }) => {
  expect(day1.length).toBe(12);
  expect(SETS).toBe(37);
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await dayWith(page, 22);
  await expect(page.getByTestId('finish-progress')).toHaveText(/^\d of 12 exercises finished/);
  await expect(page.getByTestId('finish-progress')).not.toHaveText(/16/);
  expect(errors).toEqual([]);
});

test('thresholds: 22 keeps, 23 moves with partial, 37 ticks', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  // 22/37 = 59.5%
  await usePlan(page);
  await dayWith(page, 22);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 1 · Legs (hamstring focus)');
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved · 22 sets');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText(/Next time/)).toHaveCount(0);
  await shot(page, 'keep-22');
  expect((await ps(page)).partial?.[0]).toBeCloseTo(22 / 37);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 /);
  await shot(page, 'today-keep-22');
  expect((await ps(page)).nextDayIndex).toBe(0);
  // 23/37 on a fresh profile
  await page.evaluate(() => indexedDB.deleteDatabase('anygym'));
  await page.reload();
  await usePlan(page);
  await dayWith(page, 23);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 2 · Chest and triceps');
  await shot(page, 'move-23');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'partial');
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 /);
  await shot(page, 'today-move-23');
  expect((await ps(page)).doneDays).toEqual([]);
  expect(errors).toEqual([]);
});

test('100% ticks', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await dayWith(page, 37);
  await expect(page.getByTestId('finish-progress')).toHaveText(/^12 of 12 exercises finished/);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 2 · Chest and triceps');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'done');
  await shot(page, 'today-100');
  expect(errors).toEqual([]);
});

test('Day 5 wraps to Day 1 (five day split)', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  const st = await ps(page);
  await dbPut(page, { planState: [{ ...st, nextDayIndex: 4, doneDays: [0, 1, 2, 3] }] });
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 5 /);
  await start(page);
  const planned = await seedWorkingSets(page, 1000);
  expect(planned).toBeGreaterThan(5);
  await finish(page); // 100% here; the 60% bound is unit tested, this checks the wrap
  await expect(page.getByTestId('finish-next')).toHaveText(/^Next up: Day 1 · /);
  expect((await ps(page)).nextDayIndex).toBe(0);
  expect(errors).toEqual([]);
});

test('Day 5 at ~65% wraps to Day 1 (five day split)', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  const st = await ps(page);
  await dbPut(page, { planState: [{ ...st, nextDayIndex: 4, doneDays: [0, 1, 2, 3] }] });
  await page.reload();
  await start(page);
  const { workingSetsOfActive } = await import('./helpers/planSeed');
  const { planned } = await workingSetsOfActive(page);
  const n = Math.ceil(planned * 0.65);
  await seedWorkingSets(page, n);
  await finish(page);
  await expect(page.getByTestId('finish-next')).toHaveText(/^Next up: Day 1 · /);
  const after = await ps(page);
  expect(after.nextDayIndex).toBe(0);
  expect(after.doneDays).toEqual([]);
  expect(errors).toEqual([]);
});

test('six week plan: week 1 Day 5 moves to week 2 Day 1; week 6 Day 5 stays week 6', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page, 'plan-six-week-volume');
  for (const [week, expectWeek] of [[0, 1], [5, 5]] as const) {
    const st = await ps(page);
    await dbPut(page, { planState: [{ ...st, weekIndex: week, nextDayIndex: 4, doneDays: [0, 1, 2, 3] }] });
    await page.reload();
    await expect(page.getByTestId('week-label')).toHaveText(`Week ${week + 1} of 6`);
    await start(page);
    const { workingSetsOfActive } = await import('./helpers/planSeed');
    const { planned } = await workingSetsOfActive(page);
    await seedWorkingSets(page, Math.ceil(planned * 0.62));
    await finish(page);
    await expect(page.getByTestId('finish-next')).toHaveText(/^Next up: Day 1 · /);
    const after = await ps(page);
    expect(after.nextDayIndex).toBe(0);
    expect(after.weekIndex).toBe(expectWeek);
    await shot(page, `week${week + 1}-day5`);
    await page.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(page.getByTestId('week-label')).toHaveText(`Week ${expectWeek + 1} of 6`);
  }
  expect(errors).toEqual([]);
});

test('Change, second finish never advances, Undo restores exact state, tap targets, no radios', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  const before = await ps(page);
  await dayWith(page, 23);
  const sid = page.url().split('/').slice(-2)[0]!;
  const afterFinish = await ps(page);
  expect(afterFinish.nextDayIndex).toBe(1);
  const change = page.getByTestId('finish-change');
  await expect.poll(async () => (await change.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect.poll(async () => (await change.boundingBox())!.width).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await change.tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' });
  await sheet.getByRole('button', { name: /^Day 4 · / }).tap();
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 4 · Legs (quad focus)');
  await shot(page, 'changed-day4');
  // Double tap Done: one saved workout, one toast.
  const done = page.getByRole('button', { name: 'Done', exact: true });
  await done.dblclick();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 4 /);
  const sessions = (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).filter((s) => s.endedAt !== undefined);
  expect(sessions.length).toBe(1);
  // Open the finish screen of the same session again: it must not advance.
  const stNow = await ps(page);
  await page.goto(`./#/workout/${sid}/done`);
  await expect(page.getByTestId('finish-title')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('finish-title')).toBeVisible();
  expect(await ps(page)).toEqual(stNow);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  expect(await ps(page)).toEqual(stNow);
  // Undo (toast may be gone after navigation; Done again produced a fresh toast).
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  if (await toast.isVisible()) {
    await toast.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(async () => (await ps(page)).nextDayIndex).toBe(before.nextDayIndex);
    expect(await ps(page)).toEqual(before);
  }
  expect(errors).toEqual([]);
});

test('Undo right after Done restores exact prior planState', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  const before = await ps(page);
  await dayWith(page, 30);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect.poll(async () => JSON.stringify(await ps(page))).toBe(JSON.stringify(before));
  // Finish again: advances exactly once.
  await finish(page);
  expect((await ps(page)).nextDayIndex).toBe(1);
  expect(errors).toEqual([]);
});

test('plate machine 50 + 25/side x 8 = 8 x 100 lb everywhere', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-angled-machine-leg-press').tap();
  const view = exerciseView(page, 'angled-machine-leg-press');
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
  await picker.getByRole('button', { name: 'Set starting weight' }).tap();
  const startSheet = page.getByRole('dialog', { name: 'Starting weight', exact: true });
  for (const digit of '50') await startSheet.getByRole('button', { name: digit, exact: true }).tap();
  await startSheet.getByRole('button', { name: 'Save starting weight' }).tap();
  await picker.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const set = (await dbAll<WorkoutSet>(page, 'sets'))[0]!;
  expect(set.reps).toBe(8);
  expect(set.load).toMatchObject({ total: 100 });
  await finish(page);
  await expect(page.getByTestId('finish-exercise').filter({ hasText: 'Angled Machine Leg Press' })).toContainText('8 × 100 lb');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  // History detail
  await page.getByRole('link', { name: 'History' }).tap();
  await page.getByTestId('history-row').first().tap();
  const region = page.getByRole('region', { name: 'Angled Machine Leg Press' });
  await expect(region.getByTestId('history-set')).toHaveText([/8 × 100 lb/]);
  await shot(page, 'history-detail');
  // LAST TIME on the next workout of the same day
  await page.goto('./');
  await start(page);
  await page.getByTestId('row-angled-machine-leg-press').tap();
  const again = exerciseView(page, 'angled-machine-leg-press');
  await expect(again.getByLabel(/^Last time .*100/).first()).toBeVisible();
  await shot(page, 'last-time');
  expect(errors).toEqual([]);
});

test('130% text and reduced motion on the finish screen', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await simulateSafeAreas(page);
  await usePlan(page);
  await dayWith(page, 23);
  await page.evaluate(() => { document.documentElement.style.fontSize = '130%'; });
  await page.waitForTimeout(600);
  await shot(page, 'finish-130');
  await checkLayout(page, { primary: page.getByRole('button', { name: 'Done', exact: true }) });
  await expect(page.getByTestId('finish-next')).toBeVisible();
  const doneBox = (await page.getByRole('button', { name: 'Done', exact: true }).boundingBox())!;
  const nextBox = (await page.getByTestId('finish-next').boundingBox())!;
  expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(doneBox.y + 1);
  expect(errors).toEqual([]);
});
