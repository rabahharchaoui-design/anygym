// PLAN 3.4a (SPEC 20.3, 22): Up next after the last set of a quick workout exercise, one tap add,
// a dumbbell only hotel gym gets only ideas it can do, Coach tips on a curated plan with Apply and
// Undo, SE fit, 130% text, no console errors. Shots: reports/shots/3.4a/.
// Progress: order.ts, coachTips.ts, Up next card, Coach tips card and this spec are in.
import { expect, test, type Page } from './fixtures';
import { checkControls, checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { dbAll, dbPut, exerciseView, shotOn, watchErrors } from './workout-helpers';

type Gym = { id: string; isActive: boolean; unit: string; equipment: string[] };
type Sess = { id: string; exerciseIds: string[]; endedAt?: number };

const SHOTS = '3.4a';
const BAR_135 = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
const DB_40S = { kind: 'dumbbell_each', unit: 'lb', total: 80 };

/** The active gym (the app made it on first open); `equipment` turns it into that gym. */
async function activeGym(page: Page, equipment?: string[]): Promise<Gym> {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  if (equipment) await dbPut(page, { gyms: [{ ...gym, type: 'hotel', equipment, dumbbellRange: { min: 5, max: 50, step: 5 } }] });
  return gym;
}

/**
 * A quick workout in progress with one exercise and 2 of its 3 sets logged, opened on its
 * exercise view; the test logs the last set itself.
 */
async function quickWithTwoSets(page: Page, exerciseId: string, load: Record<string, unknown>, equipment?: string[]) {
  const gym = await activeGym(page, equipment);
  const id = `q-${Date.now()}`;
  const now = Date.now();
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt: now - 600_000, imported: false, exerciseIds: [exerciseId] }],
    sets: [0, 1].map((i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId, order: i, kind: 'work', uncertain: false, reps: 10, load })),
  });
  await page.goto(`./#/workout/${id}`);
  await page.reload();
  await expect(page.getByTestId('workout-title')).toHaveText('Quick workout');
  await page.getByTestId(`row-${exerciseId}`).tap();
  const view = exerciseView(page, exerciseId);
  await expect(view).toBeVisible();
  return { id, view };
}

/** Logs the last set and waits for the list with Up next (the "every set is done" chip returns to it). */
async function logLastSet(page: Page) {
  await page.getByTestId('check-current').tap();
  const card = page.getByTestId('up-next');
  await expect(card).toBeVisible({ timeout: 10_000 });
  return card;
}

const session = async (page: Page, id: string) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.id === id)!;

/** Text at 130% (SPEC 13.4): every computed size × 1.3, once per element (as in swap-3.4.spec.ts). */
const text130 = (page: Page, scope: string) =>
  page.evaluate((root) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`${root}, ${root} *`));
    const sizes = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);

test('Up next after the last set of bench: the best next lift with why, two other ideas, one tap adds it @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  const { id } = await quickWithTwoSets(page, 'Barbell_Bench_Press_-_Medium_Grip', BAR_135);
  // Not before the last set: nothing suggests while there is work left.
  await expect(page.getByTestId('up-next')).toHaveCount(0);
  const card = await logLastSet(page);

  const pick = card.getByTestId('up-next-pick');
  await expect(pick).toHaveAttribute('data-id', 'barbell-bent-over-row');
  await expect(pick).toHaveAccessibleName('Up next: Barbell Bent Over Row. Balances your push. Add it');
  await expect(pick.getByTestId('up-next-reason')).toHaveText('Balances your push');
  await expect(pick).toContainText('3 sets × 8 to 12');
  await expect(card.getByText('Other ideas')).toBeVisible();
  await expect(card.getByTestId('up-next-other')).toHaveCount(2);
  // The ideas are other patterns, never the bench again.
  const others = await card.getByTestId('up-next-other').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  expect(others).toEqual(['wide-grip-pull-up', 'deadlift']);
  await checkLayout(page, { primary: pick });
  await checkControls(page);
  await shotOn(page, SHOTS, 'after-bench');

  // One tap: added with the quick workout's sets, reps and rest, and opened ready to log.
  await pick.tap();
  await expect(exerciseView(page, 'barbell-bent-over-row')).toBeVisible();
  await expect(exerciseView(page, 'barbell-bent-over-row').getByTestId('set-target')).toContainText('8 to 12 reps');
  await expect.poll(async () => (await session(page, id)).exerciseIds).toEqual(['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row']);
  // Back on the list: the row waits to be done, so no suggestion now.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByTestId('row-barbell-bent-over-row')).toBeVisible();
  await expect(page.getByTestId('up-next')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Up next after squat: a different pattern, and another idea adds with one tap too', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  const { id } = await quickWithTwoSets(page, 'barbell-back-squat', { ...BAR_135, total: 185, perSide: [45, 25] });
  const card = await logLastSet(page);
  const pick = card.getByTestId('up-next-pick');
  await expect(pick).toHaveAttribute('data-id', 'Barbell_Bench_Press_-_Medium_Grip');
  await expect(pick.getByTestId('up-next-reason')).toHaveText('Different pattern after squat');
  await shotOn(page, SHOTS, 'after-squat');
  const row = card.locator('[data-testid="up-next-other"][data-id="barbell-bent-over-row"]');
  await row.tap();
  await expect(exerciseView(page, 'barbell-bent-over-row')).toBeVisible();
  await expect.poll(async () => (await session(page, id)).exerciseIds).toEqual(['barbell-back-squat', 'barbell-bent-over-row']);
  expect(errors).toEqual([]);
});

test('a dumbbell only hotel gym: every idea is doable there, with a demo tile only for a sure match @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await quickWithTwoSets(page, 'dumbbell-bench-press', DB_40S, ['dumbbells', 'flat_bench']);
  const card = await logLastSet(page);
  const ids = await card.locator('[data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  // Dumbbells and a bench only: a dumbbell row, a dumbbell squat, a dumbbell stiff leg deadlift.
  expect(ids).toEqual(['single-arm-dumbbell-row', 'Dumbbell_Squat', 'Stiff-Legged_Dumbbell_Deadlift']);
  await expect(card.getByTestId('up-next-reason')).toHaveText('Balances your push');
  // The single arm row has a sure demo (SPEC 4.3): its tile shows the photo.
  await expect(card.getByTestId('up-next-pick').locator('[data-photo]')).toHaveCount(1);
  await checkLayout(page);
  await shotOn(page, SHOTS, 'hotel-dumbbells');
  expect(errors).toEqual([]);
});

test('honest when nothing else fits: no made up idea', async ({ page }) => {
  const errors = watchErrors(page);
  // A gym with nothing but a bench: only bodyweight moves fit, and every one is already done.
  const gym = await activeGym(page, ['flat_bench']);
  const id = `q-${Date.now()}`;
  const done = ['Bodyweight_Squat', 'Bodyweight_Walking_Lunge', 'Split_Squats', 'Pushups', 'Incline_Push-Up', 'Handstand_Push-Ups', 'Single_Leg_Glute_Bridge', 'Butt_Lift_Bridge', 'Glute_Kickback', 'Bench_Dips', 'elbow-plank', 'crunch', 'Reverse_Crunch', 'Sit-Up', 'russian-twist', 'dead-bug'];
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 600_000, imported: false, exerciseIds: done }],
    sets: done.flatMap((x, n) => [0, 1, 2].map((i) => ({ id: `${id}-${n}-${i}`, sessionId: id, exerciseId: x, order: n * 3 + i, kind: 'work', uncertain: false, reps: 10, load: { kind: 'bodyweight', unit: 'lb', total: 0 } }))),
  });
  await page.goto(`./#/workout/${id}`);
  await page.reload();
  const card = page.getByTestId('up-next');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('up-next-empty')).toBeVisible();
  await expect(card.getByTestId('up-next-pick')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Coach tips on the Classic 5 Day Split: collapsed, six tips, Apply and Undo make and drop a tuned copy @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await page.goto('./');
  await page.goto('./#/plans/five-day-split');
  const tips = page.getByTestId('coach-tips');
  const toggle = page.getByTestId('coach-tips-toggle');
  await expect(toggle).toHaveText(/Coach tips \(6\)/);
  // Collapsed by default: the plan is shown as written.
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(tips.locator('[data-testid^="tip-"]')).toHaveCount(0);
  await expect(page.getByTestId('plan-pair')).toHaveCount(3);
  await checkControls(page);

  await toggle.tap();
  await expect(tips.locator('[data-testid^="tip-"]')).toHaveCount(6);
  await expect(page.getByTestId('tip-hinge')).toContainText('Legs (hamstring focus): Barbell Straight Leg Romanian Deadlift is 6th');
  await expect(page.getByTestId('tip-pair')).toContainText('Barbell Incline Bench Press and Incline Plate Press are paired');
  await checkControls(page);
  await shotOn(page, SHOTS, 'coach-tips');

  // Apply one tip: a tuned copy, named so, the pair split into straight sets.
  await page.getByTestId('tip-pair').getByRole('button', { name: /^Apply/ }).tap();
  await expect(page.getByRole('heading', { name: 'Classic 5 Day Split (coach tuned)' }).first()).toBeVisible();
  await expect(page).toHaveURL(/coach=pair/);
  await expect(page.getByTestId('plan-pair')).toHaveCount(2);
  await expect(page.getByTestId('tuned-copy')).toContainText('Coach tuned copy of Classic 5 Day Split');
  await expect(page.getByTestId('tip-pair')).toContainText('Applied');
  // Undo from the toast: back to the plan as written.
  await page.getByTestId('toast-text').waitFor();
  await page.getByRole('button', { name: 'Undo', exact: true }).last().tap();
  await expect(page.getByTestId('plan-pair')).toHaveCount(3);
  await expect(page.getByTestId('tuned-copy')).toHaveCount(0);
  await expect(page).not.toHaveURL(/coach=/);

  // Apply, then Undo on the tip itself.
  await page.getByTestId('tip-rest').getByRole('button', { name: /^Apply/ }).tap();
  await expect(page.getByTestId('plan-item-barbell-back-squat')).toContainText('150 s rest');
  await page.getByTestId('tip-rest').getByRole('button', { name: /^Undo/ }).tap();
  await expect(page.getByTestId('plan-item-barbell-back-squat')).toContainText('90 s rest');

  // Apply all, then the original is one tap away.
  await page.getByTestId('apply-all').tap();
  await expect(toggle).toContainText('6 applied');
  await expect(page).toHaveURL(/coach=hinge\.stretch\.rest\.pair\.freq\.core/);
  await shotOn(page, SHOTS, 'coach-tuned');
  await page.getByRole('button', { name: 'See original' }).tap();
  await expect(page.getByRole('heading', { name: 'Classic 5 Day Split', exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('plan-pair')).toHaveCount(3);

  // Use the tuned copy: it becomes the plan in use, the list says so and opens it.
  await page.getByTestId('tip-core').getByRole('button', { name: /^Apply/ }).tap();
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await expect.poll(async () => (await dbAll<{ planId: string }>(page, 'planState'))[0]?.planId).toBe('five-day-split~coach-core');
  expect(errors).toEqual([]);
});

test('Hide tips for this plan, with Undo; the six week plan shows only its one tip', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.goto('./#/plans/six-week-volume');
  await page.getByTestId('coach-tips-toggle').tap();
  await expect(page.getByTestId('coach-tips').locator('[data-testid^="tip-"]')).toHaveCount(1);
  await expect(page.getByTestId('tip-freq')).toContainText('Hamstrings get one session a week');
  await page.getByRole('button', { name: 'Hide tips for this plan' }).tap();
  await expect(page.getByTestId('coach-tips')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).last().tap();
  await expect(page.getByTestId('coach-tips')).toBeVisible();
  await page.getByTestId('coach-tips-toggle').tap();
  await page.getByRole('button', { name: 'Hide tips for this plan' }).tap();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Six Week Volume Builder' }).first()).toBeVisible();
  await expect(page.getByTestId('coach-tips')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('SE fit and 130% text: Up next and the open Coach tips stay whole @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await quickWithTwoSets(page, 'Barbell_Bench_Press_-_Medium_Grip', BAR_135);
  const card = await logLastSet(page);
  await text130(page, '[data-testid="up-next"]');
  await card.scrollIntoViewIfNeeded();
  await checkLayout(page);
  for (const t of await card.locator('[data-testid="up-next-pick"] span span, [data-testid="up-next-other"] span span').all()) expect(await fullyShown(t)).toBe(true);
  await shotOn(page, SHOTS, 'up-next-130');

  await page.goto('./#/plans/five-day-split');
  await page.getByTestId('coach-tips-toggle').tap();
  await expect(page.getByTestId('tip-core')).toBeVisible();
  // The fold's spring has ended (its height is the content's own again) before the text grows.
  await page.waitForFunction(() => {
    const fold = document.querySelector<HTMLElement>('[data-testid="coach-tips"] > div');
    return !!fold && !/px$/.test(fold.style.height) && getComputedStyle(fold).opacity === '1';
  });
  await text130(page, '[data-testid="coach-tips"]');
  for (const id of ['hinge', 'stretch', 'rest', 'pair', 'freq', 'core']) {
    const tip = page.getByTestId(`tip-${id}`);
    await tip.scrollIntoViewIfNeeded();
    for (const p of await tip.locator('p, li').all()) expect(await fullyShown(p)).toBe(true);
  }
  await checkLayout(page);
  await checkControls(page);
  await shotOn(page, SHOTS, 'coach-tips-130');
  expect(errors).toEqual([]);
});
