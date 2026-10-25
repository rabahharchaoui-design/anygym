import { expect, test, type Locator, type Page } from './fixtures';

// G's programs, early (PLAN 1.10): curated plans, the Today day card, plan day workouts.

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
  await (target ?? page).screenshot({ path: `reports/shots/1.10/${name}.png` });
};

/** Every record of an IndexedDB store, read straight from the database. */
const dbAll = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
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
  );


test('Classic 5 Day Split: pick it, see day 2 pairs, follow day 1, log, reload, finish', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');

  // No plan yet: one clear next step, Quick workout still there.
  await expect(page.getByRole('heading', { name: 'Pick a plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await page.getByRole('button', { name: 'See plans' }).tap();
  await expect(page).toHaveURL(/#\/plans$/);
  const card = page.getByTestId('plan-five-day-split');
  await expect(card).toContainText('Classic 5 Day Split');
  await expect(card).toContainText('5 days · Full gym');
  await expect(page.getByTestId('plan-six-week-volume')).toContainText('5 days · 6 weeks · Full gym');
  await shot(page, 'plans');

  // Plan viewer: plain words, pairs and warm ups labeled.
  await card.tap();
  await expect(page).toHaveURL(/#\/plans\/five-day-split$/);
  await expect(page.getByRole('heading', { name: 'Classic 5 Day Split' })).toBeVisible();
  const day1 = page.getByRole('region', { name: 'Day 1 · Legs (hamstring focus)' });
  await expect(day1.getByTestId('plan-item-barbell-back-squat')).toHaveText(/Barbell Back Squat4 sets × 8 to 12 reps · 90 s restWide stance/);
  await expect(day1.getByTestId('plan-item-static-quadricep-stretch')).toContainText('45 sec');
  await expect(day1).toContainText('~90 min');
  const day2 = page.getByRole('region', { name: 'Day 2 · Chest and triceps' });
  await expect(day2.getByText('Warm up · Pair: back to back')).toBeVisible();
  await expect(day2.getByText('Pair: back to back', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Week' })).toHaveCount(0);
  await expect(page.getByTestId('finisher-day-2')).toHaveText('Finisher Stair climbing · 15 min');
  await expect(page.getByTestId('finisher-day-5')).toHaveText('Finisher Cycling');
  await expect(page.getByTestId('finisher-day-1')).toHaveCount(0);
  await shot(page, 'plan-viewer');
  await page.getByRole('button', { name: 'Use this plan' }).tap();

  // Today: the day card, week strip, Change day.
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toHaveText('Day 1 · Legs (hamstring focus) · ~90 min');
  await expect(page.getByTestId('week-label')).toHaveText('This week');
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'next');
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'todo');
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await shot(page, 'today-day-card');

  // Day 2 via Change day: the pairs on their rail.
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 · Chest and triceps/ }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText('Day 2 · Chest and triceps · ~77 min');
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  // PLAN 1.7c: the day list first, the pairs on their rails.
  await expect(page.getByTestId('workout-title')).toHaveText('Day 2 · Chest and triceps');
  const pairs = page.getByTestId('pair-group');
  await expect(pairs).toHaveCount(2);
  await expect(pairs.nth(0).locator('p').first()).toHaveText('Warm up · Pair: back to back');
  await expect(pairs.nth(1).locator('p').first()).toHaveText('Pair: back to back');
  await expect(pairs.nth(1).getByTestId('row-barbell-incline-bench-press')).toBeVisible();
  await expect(pairs.nth(1).getByTestId('row-incline-plate-press')).toContainText('4 sets × 10 to 12');
  await expect(pairs.nth(1).getByTestId('row-incline-plate-press')).toContainText('90 s rest');
  await shot(page, 'workout-pair');
  await page.getByTestId('row-band-internal-shoulder-rotation-0-degrees').tap();
  // Band work is known to be reps only (PLAN 1.7c hand mapped list): nothing is asked.
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
  const first = page.getByTestId('exercise-band-internal-shoulder-rotation-0-degrees');
  await expect(first.getByTestId('set-target')).toHaveText('Set 1 of 3 · 10 to 12 reps');
  await expect(first.getByTestId('set-plan')).toHaveText('Warm up. Band, cable or dumbbell');
  await expect(first.getByTestId('set-type').first()).toHaveText('W');
  // A pair goes back to back: logging the first one opens its partner with no rest.
  await first.getByTestId('check-current').tap();
  const partner = page.getByTestId('exercise-band-internal-shoulder-rotation-90-degrees');
  await expect(partner).toBeVisible();
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  // Warm up block sets are stored as warm ups (SPEC 6 rule 1).
  await expect.poll(async () => (await dbAll(page, 'sets')).map((x) => x.kind)).toEqual(['warmup']);
  // The partner's set ends the round: rest, then back to the first one, its warm up set tagged.
  await partner.getByTestId('check-current').tap();
  await expect(first).toBeVisible();
  await expect(first.getByTestId('set-row')).toHaveCount(1);
  await expect(first.getByTestId('set-row').getByTestId('set-type')).toHaveText('W');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  // The finisher is the last row: plan minutes, no rest line.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const finisher = page.getByTestId('finisher');
  await expect(finisher).toContainText('Stair climbing');
  await expect(finisher).toContainText('15 min');
  await expect(finisher).not.toContainText('rest');
  const last = await page.locator('[data-row]').last().getAttribute('data-row');
  expect(last).toBe('finisher-stair-climbing');
  await expect(page.getByRole('main').getByText('Finisher', { exact: true })).toBeVisible();
  // Sets logged: finishing saves the day (finish screen). Only warm ups were done, so it would stay
  // up next (1.7e); moving on goes to day 3.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-title')).toHaveText(/^Saved · 0 of \d+ done$/);
  await page.getByRole('radio', { name: 'Go to Day 3' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 3 · Back and biceps/);
  expect((await dbAll(page, 'sets')).map((x) => x.kind)).toEqual(['warmup', 'warmup']);

  // Warm ups never become Last time: day 2 again still says first time.
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-band-internal-shoulder-rotation-0-degrees').tap();
  const again = page.getByTestId('exercise-band-internal-shoulder-rotation-0-degrees');
  await expect(again.getByTestId('set-guide')).toHaveText('First time: stop when you could do 2 more reps');
  await expect(again.getByTestId('set-next')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/#\/$/);

  // Back to day 1 and follow it.
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 1 · Legs/ }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText('Day 1 · Legs (hamstring focus) · ~90 min');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  const ids = await page.locator('[data-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-row')!));
  expect(ids).toEqual([
    'static-quadricep-stretch',
    'dynamic-hip-flexor-stretch',
    'static-proximal-hamstring-stretch',
    'static-pigeon-stretch',
    'barbell-back-squat',
    'angled-machine-leg-press',
    'machine-lying-leg-curl',
    'machine-seated-leg-extension',
    'dumbbell-walking-lunge',
    'barbell-straight-leg-romanian-deadlift',
    'lying-straight-leg-raise',
    'decline-bench-sit-up',
    'elbow-plank',
    'plate-russian-twist',
    'cross-body-mountain-climber',
    'curl-up-crunch',
  ]);
  // The first row is the next one; no demo images anywhere (none is certain yet).
  await expect(page.getByTestId('row-static-quadricep-stretch')).toHaveAttribute('data-state', 'next');
  await expect(page.getByRole('main').locator('img')).toHaveCount(0);
  await page.getByTestId('row-static-quadricep-stretch').tap();
  const stretch = page.getByTestId('exercise-static-quadricep-stretch');
  await expect(stretch.getByTestId('set-target')).toHaveText('Set 1 of 1 · 45 sec');
  await expect(stretch.getByTestId('hold-cell')).toHaveText(['45 sTap to start']);
  await page.getByRole('button', { name: 'Back to the list' }).tap();

  const squatRow = page.getByTestId('row-barbell-back-squat');
  await expect(squatRow).toContainText('4 sets × 8 to 12');
  await expect(squatRow).toContainText('90 s rest');
  await squatRow.tap();
  const squat = page.getByTestId('exercise-barbell-back-squat');
  await expect(squat.getByTestId('set-target')).toHaveText('Set 1 of 4 · 8 to 12 reps');
  await expect(squat.getByTestId('set-plan')).toHaveText('Wide stance');
  // First time: the first weight is picked (an empty bar here), never invented.
  await squat.getByTestId('weight-cell').first().tap();
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Done' }).tap();
  const log = squat.getByTestId('check-current');
  await expect(log).toHaveAccessibleName('Log set 1: 8 × 45 lb');
  await log.tap();
  await expect(squat.getByTestId('set-row')).toHaveCount(1);
  await expect(squat.getByTestId('set-target')).toHaveText('Set 2 of 4 · 8 to 12 reps');
  await expect(page.getByTestId('rest-timer')).toBeVisible();

  // Reload: same exercise, same set.
  await page.reload();
  await expect(squat.getByTestId('set-target')).toHaveText('Set 2 of 4 · 8 to 12 reps');
  await expect(squat.getByTestId('set-row')).toHaveCount(1);

  // Log the other 3 sets: "Nice. Next: …", back to the list with the leg press lit.
  for (let i = 0; i < 3; i++) {
    await squat.getByTestId('check-current').tap();
    await expect(squat.getByTestId('set-row')).toHaveCount(i + 2);
  }
  await expect(page.getByTestId('next-chip')).toHaveText('Nice. Next: Angled Machine Leg Press');
  const pressRow = page.getByTestId('row-angled-machine-leg-press');
  await expect(pressRow).toHaveAttribute('data-state', 'next');
  await expect(squatRow).toHaveAccessibleName(/4 of 4 done/);
  await pressRow.tap();
  // A plate loaded machine by the hand mapped list: no question.
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
  await expect(page.getByTestId('exercise-angled-machine-leg-press').getByTestId('set-target')).toHaveText('Set 1 of 3 · 8 to 12 reps');

  // Finish with lifts left: move on; Day 2 is next, Day 1 shows part done (a full tick needs every lift, 1.7e).
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('radio', { name: 'Go to Day 2' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 · Chest and triceps · ~\d+ min$/);
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'partial');
  expect(errors).toEqual([]);
});

test('Six Week Volume Builder: week picker, Week 1 of 6, day 1 at 5 sets × 6', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  await page.getByTestId('plan-six-week-volume').tap();
  const front = page.getByRole('region', { name: 'Day 1 · Quads' }).getByTestId('plan-item-front-squat');
  await expect(front).toHaveText(/Front Squat5 sets × 6 reps$/);
  await expect(page.getByRole('button', { name: 'Week 1' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Week 3' }).tap();
  await expect(front).toHaveText(/Front Squat5 sets × 8 reps$/);
  await expect(page.getByRole('button', { name: 'Week 3' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Use this plan' }).tap();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('week-label')).toHaveText('Week 1 of 6');
  await expect(page.getByTestId('day-card-title')).toHaveText('Day 1 · Quads · ~63 min');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await expect(page.getByTestId('row-front-squat')).toContainText('5 sets × 6');
  await page.getByTestId('row-front-squat').tap();
  const card = page.getByTestId('exercise-front-squat');
  await expect(card.getByTestId('set-target')).toHaveText('Set 1 of 5 · 6 reps');
  await expect(card.getByTestId('reps-cell')).toHaveText(['6', '6', '6', '6', '6']);
  expect(errors).toEqual([]);
});

test('Quick workout still starts empty while a plan is active', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await page.getByRole('dialog', { name: 'Add exercise' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Empty workout' })).toBeVisible();
  await expect(page.getByTestId('workout-title')).toHaveText('Quick workout');
  expect(errors).toEqual([]);
});

test('after a reload, Change day still updates Today and Start opens that day', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 ·/);
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 ·/);
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 4 ·/ }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 4 · Legs \(quad focus\) · ~\d+ min$/);
  await expect(page.getByTestId('week-day-4')).toHaveAttribute('data-state', 'next');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toHaveText('Day 4 · Legs (quad focus)');
  // A timed first exercise: no "Tap the check" hint on a hold.
  await page.locator('[data-row]').first().tap();
  await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Six Week: no invented rest, rests stated in notes shown, sprint in rounds', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/six-week-volume');
  const day1 = page.getByRole('region', { name: 'Day 1 · Quads' });
  await expect(day1.getByTestId('plan-item-front-squat')).not.toContainText('rest');
  await expect(day1.getByTestId('plan-item-leg-extension')).toContainText('10 sets × 10 reps · 10 s rest');
  await expect(day1.getByTestId('plan-item-leg-extension')).toContainText('10 seconds rest between sets');
  await expect(page.getByRole('region', { name: 'Day 4 · Hamstrings and glutes' }).getByTestId('plan-item-leg-curl')).toContainText('10 s rest');
  const sprint = page.getByRole('region', { name: 'Day 3 · HIIT cardio and abs' }).getByTestId('plan-item-30-second-interval-sprint');
  await expect(sprint).toHaveText(/^30 Second Interval Sprint10 rounds × 30 sec$/);
  await page.getByRole('button', { name: 'Week 6' }).tap();
  await expect(sprint).toHaveText(/20 rounds × 30 sec$/);
  // Only Leg extension and Leg curl state a rest in the whole plan.
  await expect(page.getByText(/ s rest$/)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('long names are fully readable: list title and exercise name wrap, the exercise view fits', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  const notClipped = (el: Element) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
  const header = page.getByTestId('workout-title');
  await expect(header).toHaveText('Day 2 · Chest and triceps');
  expect(await header.evaluate(notClipped)).toBe(true);
  await page.getByTestId('row-band-internal-shoulder-rotation-90-degrees').tap();
  const view = page.getByTestId('exercise-band-internal-shoulder-rotation-90-degrees');
  const title = view.getByRole('heading', { name: 'Band Internal Shoulder Rotation (90 degrees)' });
  await expect(title).toBeVisible();
  await page.waitForTimeout(400);
  expect(await title.evaluate(notClipped)).toBe(true);
  expect((await title.boundingBox())!.height).toBeLessThanOrEqual(3 * 27 + 2);
  // SPEC 13.5: the exercise view fits on every phone, SE included.
  expect(await page.getByRole('main').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
