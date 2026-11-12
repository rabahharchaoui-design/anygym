import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, shotOn, usePlan, watchErrors } from './workout-helpers';

// PLAN 3.5g: the Session 3 gate critic's blockers, the way a person meets them. (1) Not now on the
// Level up card holds last week's weight on the exercise; (2) a plan pair is back to back with the Next
// in the pair bar; (3) on an iPhone SE the current row stays above the rest bar after each log, the
// finished warm ups fold into one row and the hero shrinks; (8) the coach card lists a few lifts with
// "+N more" and never shares the day with the backup reminder; (9) an empty abandoned workout has
// Discard beside Resume; (11) one Start Day 1 when the next day is Day 1; (12) the effort question on
// the day list row only. Screenshots: reports/shots/3.5g/.

const DAY = 86_400_000;
const SHOTS = ['iPhone SE', 'iPhone 15'];
const lb = (total: number, perSide: number[]) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide });
const BAR200 = lb(200, [45, 25, 10, 2.5]);
const BAR185 = lb(185, [45, 25]);
const BAR135 = lb(135, [45]);
const BAR95 = lb(95, [25]);
const DB25 = { kind: 'dumbbell_each', unit: 'lb', total: 50 };
const STACK50 = { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 };

/** A time in last week (Monday + `day`), local, 18:00. */
function lastWeek(day = 2): number {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back - 7 + day, 18).getTime();
}

type Set = { exerciseId: string; reps: number; load: Record<string, unknown> };
let seq = 0;
async function seedAt(page: Page, startedAt: number, sets: Set[]) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `g35g-${startedAt}-${seq++}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((s) => s.exerciseId))] }],
    sets: sets.map((s, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: s.exerciseId, order: i, kind: 'work', reps: s.reps, load: s.load, uncertain: false })),
  });
}
const three = (exerciseId: string, reps: number, load: Record<string, unknown>): Set[] => [0, 1, 2].map(() => ({ exerciseId, reps, load }));

test.describe('3.5g gate fixes', () => {
  test('(1) Not now holds last week\'s weight: the exercise says so and keeps 200 lb @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(2), three('barbell-back-squat', 12, BAR200));
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'level_up');
    await expect(card.getByTestId('coach-change')).toContainText('200 → 210 lb');
    await card.getByTestId('coach-later').tap();
    await expect(page.getByText('Okay, same weights this week')).toBeVisible();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    await shotOn(page, '3.5g', 'coach-after-not-now', SHOTS);
    const lifts = await dbAll<{ key: string; target?: { value: number; source: string } }>(page, 'coachLifts');
    expect(lifts.map((l) => [l.key, l.target?.value, l.target?.source])).toEqual([['barbell-back-squat||barbell', 200, 'hold']]);
    // The exercise keeps last week's weight and says why; the card was the only place to raise it.
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('set-next')).toHaveText('12 reps at 200 lb · Same as last time, you chose not to add weight');
    await expect(view.getByTestId('set-todo').getByTestId('weight-cell')).toHaveText(['200', '200', '200']);
    await shotOn(page, '3.5g', 'exercise-after-not-now', SHOTS);
    expect(errors).toEqual([]);
  });

  test('(1) Undo on Not now brings the card back and the hold goes', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, lastWeek(2), three('barbell-back-squat', 12, BAR200));
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await page.goto('./');
    await page.getByTestId('coach-card').getByTestId('coach-later').tap();
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'level_up');
    expect((await dbAll<{ target?: unknown }>(page, 'coachLifts')).filter((l) => l.target)).toEqual([]);
  });

  test('(2) a plan pair is back to back: no rest after the first lift, the Next bar to the partner, the rest after the round @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page, 'plan-beginner-full-body-3-day');
    await seedAt(page, Date.now() - 2 * DAY, [...three('machine-seated-reverse-fly', 10, STACK50), ...three('cable-tricep-pushdown', 10, STACK50)]);
    await page.reload();
    await page.getByRole('button', { name: 'Change day' }).tap();
    await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2/ }).tap();
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    const group = page.getByTestId('pair-group').filter({ has: page.getByTestId('row-machine-seated-reverse-fly') });
    await expect(group.getByTestId('group-rest')).toHaveText(/^Rest \d+ s after each round$/);
    await group.getByTestId('row-machine-seated-reverse-fly').tap();
    const first = exerciseView(page, 'machine-seated-reverse-fly');
    await checkCurrent(first).tap();
    await expect(loggedRows(first)).toHaveCount(1);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('rest-timer')).toHaveCount(0);
    const next = page.getByTestId('group-next');
    await expect(next).toHaveText(/^Next in the pair: /);
    await expect(page.getByTestId('next-chip')).toHaveCount(0);
    const box = (await next.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(47.5);
    await shotOn(page, '3.5g', 'pair-flow', SHOTS);
    await next.tap();
    const partner = exerciseView(page, 'cable-tricep-pushdown');
    await expect(partner).toBeVisible();
    // Lands on the partner's current set.
    await expect(partner.getByTestId('set-target')).toHaveText(/^Set 1 of \d/);
    await checkCurrent(partner).tap();
    await expect(loggedRows(partner)).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(page.getByTestId('group-next')).toHaveText(/^Next in the pair: .*Reverse Fly/i);
    await shotOn(page, '3.5g', 'pair-after-round', SHOTS);
    expect(errors).toEqual([]);
  });

  test('(3) after each log the current row sits above the rest bar; warm ups fold; the hero is small and still @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, BAR185));
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: '3y' } }] });
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    const hero = view.getByTestId('ex-hero');
    // Read once the screen has landed (the slide in scales the page a little).
    await page.waitForFunction(() => !document.documentElement.dataset.nav);
    await page.waitForTimeout(400);
    const heroBefore = (await hero.count()) ? (await hero.boundingBox())!.height : 0;
    const clear = async (label: string) => {
      await page.waitForTimeout(1100); // the settle (450 ms), the warm up fold and the re-check
      const check = await checkCurrent(view).boundingBox();
      const rest = page.getByTestId('rest-timer');
      const top = (await rest.count()) ? (await rest.boundingBox())!.y : page.viewportSize()!.height;
      expect(check, `${label}: a current row`).not.toBeNull();
      expect(check!.y + check!.height, `${label}: the current ✓ above the rest bar`).toBeLessThanOrEqual(top + 0.5);
      expect(check!.y, `${label}: below the top`).toBeGreaterThanOrEqual(0);
    };
    for (let i = 1; i <= 3; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
      await clear(`warm up ${i}`);
    }
    // The three warm ups are one row now; Show brings them back.
    const fold = view.getByTestId('warmups-done');
    await expect(fold).toHaveText(/3 warm ups done/);
    expect((await fold.getByRole('button').boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    // PLAN 3.5w: nothing resizes under the thumb after a check. A short phone has the small hero from
    // the start (the rows and the rest bar share the screen, as asserted above); it never changes.
    if (heroBefore) {
      // Within half a pixel: a phone's pixel grid reports 251.6863 and 251.6875 for the same box.
      expect(Math.abs((await hero.boundingBox())!.height - heroBefore), 'the hero keeps its height after a log').toBeLessThanOrEqual(0.5);
      if (page.viewportSize()!.height <= 740) expect(heroBefore, 'small from the start on a short phone').toBeLessThanOrEqual(140);
    }
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(4);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await clear('set 1');
    await shotOn(page, '3.5g', 'exercise-after-log', SHOTS);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(5);
    await clear('set 2');
    await fold.getByRole('button').tap();
    await expect(view.getByTestId('warmups-done')).toHaveCount(0);
    await expect(loggedRows(view).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('(8) the coach card lists three lifts and "+1 more", and no backup reminder that day @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(2), [...three('barbell-back-squat', 12, BAR200), ...three('overhead-press', 12, BAR95), ...three('barbell-bent-over-row', 12, BAR135), ...three('barbell-incline-bench-press', 12, BAR135)]);
    // Six more finished workouts (the backup reminder's minimum), each a different lift (no plateau card).
    const others = ['dumbbell-lateral-raise', 'cable-tricep-pushdown', 'machine-seated-leg-extension', 'machine-lying-leg-curl', 'machine-seated-chest-fly', 'machine-seated-reverse-fly'];
    for (const [k, id] of others.entries()) await seedAt(page, Date.now() - (15 + k) * DAY, three(id, 9, STACK50));
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'level_up');
    await expect(card).toContainText('You hit all your reps on 4 lifts last week. Add weight?');
    await expect(card.getByTestId('coach-list').getByTestId('coach-change')).toHaveCount(3);
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    await card.getByTestId('coach-more').tap();
    const sheet = page.getByTestId('coach-more-sheet');
    await expect(sheet.getByTestId('coach-change')).toHaveCount(4);
    await shotOn(page, '3.5g', 'coach-more-sheet', SHOTS);
    await page.getByRole('dialog', { name: 'Add weight to these' }).getByRole('button', { name: 'Close' }).tap();
    await card.getByTestId('coach-later').tap();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    // Answered today: still no backup reminder today.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('(9) an empty abandoned quick workout: Discard beside Resume, with Undo @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await page.getByTestId('quick-card').tap();
    await expect(page).toHaveURL(/#\/workout\//);
    await page.goto('./');
    const discard = page.getByTestId('discard-empty');
    await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
    await expect(discard).toBeVisible();
    const b = (await discard.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(47.5);
    expect(b.width).toBeGreaterThanOrEqual(47.5);
    await shotOn(page, '3.5g', 'empty-resume-discard', SHOTS);
    await discard.tap();
    await expect(page.getByText('Empty workout discarded')).toBeVisible();
    await expect(page.getByRole('button', { name: /Resume/ })).toHaveCount(0);
    await expect(page.getByTestId('quick-card')).toBeVisible();
    expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).filter((s) => s.endedAt === undefined)).toHaveLength(0);
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
    expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).filter((s) => s.endedAt === undefined)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('(9) a workout with a set logged has no Discard', async ({ page }) => {
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.goto('./');
    await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
    await expect(page.getByTestId('discard-empty')).toHaveCount(0);
  });

  test('(11) missed workouts with Day 1 next: one Start Day 1 and Rebuild my week @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    const before = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
    await dbPut(page, { planState: [{ ...before, nextDayIndex: 0, doneDays: [] }] });
    await seedAt(page, Date.now() - 5 * DAY, three('barbell-back-squat', 8, BAR185));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'missed_days');
    await expect(card.getByTestId('coach-pick-up')).toHaveText('Start Day 1');
    await expect(card.getByTestId('coach-rebuild')).toHaveText('Rebuild my week');
    await expect(card.getByText(/Restart Day 1|Resume Day 1/)).toHaveCount(0);
    for (const id of ['coach-pick-up', 'coach-rebuild']) expect((await card.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    await shotOn(page, '3.5g', 'missed-single-button', SHOTS);
    await card.getByTestId('coach-pick-up').tap();
    await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
    await expect(page.getByTestId('workout-title')).toContainText('Day 1');
    expect(errors).toEqual([]);
  });

  test('(12) the effort question is asked on the day list row only @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, BAR185));
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    for (let i = 1; i <= 3; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
    }
    // While the "Nice" chip shows and the view waits to go back, nothing asks there.
    await expect(page.getByTestId('next-chip')).toBeVisible();
    await expect(view.getByTestId('effort')).toHaveCount(0);
    await expect(view).toHaveCount(0, { timeout: 6000 });
    const row = page.getByTestId('list-effort');
    await expect(row).toBeVisible();
    await expect(row).toContainText('How did that feel?');
    await page.getByTestId('list-effort-easy').tap();
    await expect.poll(async () => (await dbAll<{ effort: string }>(page, 'efforts')).map((e) => e.effort)).toEqual(['easy']);
    await expect(row).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('(7) Worked lately: honest title and legend, amber under 24 h, unmapped exercises named @matrix', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, Date.now() - 3 * 3_600_000, three('barbell-back-squat', 8, BAR185));
    await seedAt(page, Date.now() - 30 * 3_600_000, three('barbell-bicep-curl', 10, BAR95));
    await page.goto('./');
    const fresh = page.getByTestId('fresh-muscles');
    await expect(fresh).toContainText('Worked lately');
    await expect(fresh).toContainText('Gray: no logged sets we can map');
    const day = fresh.locator('[data-band="day"]').first();
    const fill = await day.evaluate((el) => getComputedStyle(el.closest('g')!).fill);
    expect(fill, 'amber under 24 h').toMatch(/rgb\(255, 176, 32\)/);
    await shotOn(page, '3.5g', 'worked-lately', SHOTS);
  });
});
