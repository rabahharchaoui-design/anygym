import { expect, test, type Locator, type Page } from '@playwright/test';

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

/** How far the card's top is below the top of the workout list. */
const offsetInMain = async (page: Page, card: Locator) => {
  const main = (await page.getByRole('main').boundingBox())!;
  const box = (await card.boundingBox())!;
  return box.y - main.y;
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

const answerLoadType = async (page: Page, choice: string) => {
  const sheet = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: new RegExp(`^${choice}`) }).tap();
  await expect(sheet).toHaveCount(0);
};

test('The OhRabah Split: pick it, see day 2 pairs, follow day 1, log, reload, finish', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');

  // No plan yet: one clear next step, Quick workout still there.
  await expect(page.getByRole('heading', { name: 'Pick a plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await page.getByRole('button', { name: 'See plans' }).tap();
  await expect(page).toHaveURL(/#\/plans$/);
  const card = page.getByTestId('plan-ohrabah-split');
  await expect(card).toContainText('The OhRabah Split');
  await expect(card).toContainText('5 days · Full gym');
  await expect(page.getByTestId('plan-six-week-volume')).toContainText('5 days · 6 weeks · Full gym');
  await shot(page, 'plans');

  // Plan viewer: plain words, pairs and warm ups labeled.
  await card.tap();
  await expect(page).toHaveURL(/#\/plans\/ohrabah-split$/);
  await expect(page.getByRole('heading', { name: 'The OhRabah Split' })).toBeVisible();
  const day1 = page.getByRole('region', { name: 'Day 1 · Legs (hamstring focus)' });
  await expect(day1.getByTestId('plan-item-barbell-back-squat')).toHaveText(/Barbell Back Squat4 sets × 8 to 12 · 90 s restWide stance/);
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
  await expect(page.getByTestId('workout-title')).toHaveText('Day 2 · Chest and triceps');
  // The first exercise's load type is not known yet: asked once, right away.
  await answerLoadType(page, 'Bodyweight');
  const pairs = page.getByTestId('pair-group');
  await expect(pairs).toHaveCount(2);
  await expect(pairs.nth(0).locator('p').first()).toHaveText('Warm up · Pair: back to back');
  await expect(pairs.nth(1).locator('p').first()).toHaveText('Pair: back to back');
  await expect(pairs.nth(1).getByTestId('exercise-barbell-incline-bench-press')).toBeVisible();
  await expect(pairs.nth(1).getByTestId('exercise-incline-plate-press')).toContainText('4 sets × 10 to 12 · 90 s rest');
  const first = page.getByTestId('exercise-band-internal-shoulder-rotation-0-degrees');
  await expect(first.getByTestId('set-target')).toHaveText('Set 1 of 3 · 10 to 12 reps');
  await expect(first.getByTestId('set-plan')).toHaveText('Warm up. Band, cable or dumbbell · 3 sets × 10 to 12');
  // A pair goes back to back: logging the first one opens its partner with no rest.
  await page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ }).tap();
  const partner = page.getByTestId('exercise-band-internal-shoulder-rotation-90-degrees');
  await expect(partner).toHaveAttribute('data-expanded', 'true');
  await answerLoadType(page, 'Bodyweight');
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  await shot(page, 'workout-pair');
  // Warm up block sets are stored as warm ups (SPEC 6 rule 1).
  await expect.poll(async () => (await dbAll(page, 'sets')).map((x) => x.kind)).toEqual(['warmup']);
  // The partner's set ends the round: rest, then back to the first one, its warm up set tagged.
  await page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ }).tap();
  await expect(first).toHaveAttribute('data-expanded', 'true');
  await expect(first.getByTestId('set-row')).toHaveCount(1);
  await expect(first.getByTestId('set-row')).toContainText('Warm up');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  // The finisher is the last row: timed, plan minutes, no rest line.
  const finisher = page.getByTestId('finisher');
  await expect(finisher).toContainText('Stair climbing');
  await expect(finisher).toContainText('15 min');
  await expect(finisher).not.toContainText('rest');
  const last = await page.locator('[data-exercise]').last().getAttribute('data-exercise');
  expect(last).toBe('finisher-stair-climbing');
  await expect(page.getByRole('main').getByText('Finisher', { exact: true })).toBeVisible();
  // One set logged: finishing saves the day and moves the plan on to day 3.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 3 · Back and biceps/);
  expect((await dbAll(page, 'sets')).map((x) => x.kind)).toEqual(['warmup', 'warmup']);

  // Warm ups never become Last time: day 2 again still says first time.
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
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
  const ids = await page.locator('[data-testid^="exercise-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(9)));
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
  const stretch = page.getByTestId('exercise-static-quadricep-stretch');
  await expect(stretch).toHaveAttribute('data-expanded', 'true');
  await expect(stretch.getByTestId('set-target')).toHaveText('Set 1 of 1 · 45 sec');
  await expect(stretch.getByTestId('timer-seconds')).toHaveText('0 s of 45 s');
  // No demo images anywhere: none is certain yet.
  await expect(page.getByRole('main').locator('img')).toHaveCount(0);

  const squat = page.getByTestId('exercise-barbell-back-squat');
  await expect(squat).toContainText('4 sets × 8 to 12 · 90 s rest');
  await squat.getByRole('button').first().tap();
  await expect(squat.getByTestId('set-target')).toHaveText('Set 1 of 4 · 8 to 12 reps');
  await expect(squat.getByTestId('set-plan')).toHaveText('Wide stance · 4 sets × 8 to 12 · 90 s rest');
  const log = page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ });
  await expect(log).toHaveText('Log set · 8 × 45 lb');
  await log.tap();
  await expect(squat.getByTestId('set-row')).toHaveCount(1);
  await expect(squat.getByTestId('set-target')).toHaveText('Set 2 of 4 · 8 to 12 reps');
  await expect(page.getByTestId('rest-timer')).toBeVisible();

  // Reload: same card, same set, and the current card is at the top and fits one screen.
  await page.reload();
  await expect(squat).toHaveAttribute('data-expanded', 'true');
  await expect(squat.getByTestId('set-target')).toHaveText('Set 2 of 4 · 8 to 12 reps');
  await expect(squat.getByTestId('set-row')).toHaveCount(1);
  await expect.poll(() => offsetInMain(page, squat)).toBeLessThan(16);
  const mainH = await page.getByRole('main').evaluate((el) => el.clientHeight);
  expect((await squat.boundingBox())!.height).toBeLessThanOrEqual(mainH);

  // Log the other 3 sets: the next exercise comes up at the top on its own.
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(400); // a person, not a double tap
    await page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ }).tap();
    // The last set closes the card (the next exercise opens), so count the open card's rows only.
    if (i < 2) await expect(squat.getByTestId('set-row')).toHaveCount(i + 2);
  }
  const press = page.getByTestId('exercise-angled-machine-leg-press');
  await expect(press).toHaveAttribute('data-expanded', 'true');
  await answerLoadType(page, 'Plates on a machine');
  await expect(press.getByTestId('set-target')).toHaveText('Set 1 of 3 · 8 to 12 reps');
  await expect.poll(() => offsetInMain(page, press)).toBeLessThan(16);
  await expect(squat).toContainText('4 of 4');

  // Finish: Day 2 is next, Day 1 checked.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 · Chest and triceps · ~\d+ min$/);
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'done');
  expect(errors).toEqual([]);
});

test('Six Week Volume Builder: week picker, Week 1 of 6, day 1 at 5 sets × 6', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  await page.getByTestId('plan-six-week-volume').tap();
  const front = page.getByRole('region', { name: 'Day 1 · Quads' }).getByTestId('plan-item-front-squat');
  await expect(front).toHaveText(/Front Squat5 sets × 6$/);
  await expect(page.getByRole('button', { name: 'Week 1' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Week 3' }).tap();
  await expect(front).toHaveText(/Front Squat5 sets × 8$/);
  await expect(page.getByRole('button', { name: 'Week 3' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Use this plan' }).tap();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('week-label')).toHaveText('Week 1 of 6');
  await expect(page.getByTestId('day-card-title')).toHaveText('Day 1 · Quads · ~63 min');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await answerLoadType(page, 'Plates on a bar');
  const card = page.getByTestId('exercise-front-squat');
  await expect(card).toHaveAttribute('data-expanded', 'true');
  await expect(card.getByTestId('set-plan')).toContainText('5 sets × 6');
  await expect(card.getByTestId('set-target')).toHaveText('Set 1 of 5 · 6 reps');
  await expect(page.getByTestId('stepper-reps')).toHaveText('6');
  expect(errors).toEqual([]);
});

test('Quick workout still starts empty while a plan is active', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/ohrabah-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: 'Empty workout' })).toBeVisible();
  await expect(page.getByTestId('workout-title')).toHaveText('Workout');
  expect(errors).toEqual([]);
});

test('after a reload, Change day still updates Today and Start opens that day', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/ohrabah-split');
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
  // A timed first card: no "Tap Log set" hint next to "Start the timer".
  await expect(page.getByTestId('action-bar').getByRole('button', { name: 'Start the timer' })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Six Week: no invented rest, rests stated in notes shown, sprint in rounds', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/six-week-volume');
  const day1 = page.getByRole('region', { name: 'Day 1 · Quads' });
  await expect(day1.getByTestId('plan-item-front-squat')).not.toContainText('rest');
  await expect(day1.getByTestId('plan-item-leg-extension')).toContainText('10 sets × 10 · 10 s rest');
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

test('long names are fully readable: expanded title and header wrap, the current card still fits', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/ohrabah-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await answerLoadType(page, 'Bodyweight');
  await page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ }).tap();
  const card = page.getByTestId('exercise-band-internal-shoulder-rotation-90-degrees');
  await expect(card).toHaveAttribute('data-expanded', 'true');
  await answerLoadType(page, 'Bodyweight');
  await page.waitForTimeout(400);
  const notClipped = (el: Element) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
  const title = card.getByRole('heading', { name: 'Band Internal Shoulder Rotation (90 degrees)' });
  await expect(title).toBeVisible();
  expect(await title.evaluate(notClipped)).toBe(true);
  expect((await title.boundingBox())!.height).toBeLessThanOrEqual(2 * 24 + 2);
  const header = page.getByTestId('workout-title');
  await expect(header).toHaveText('Day 2 · Chest and triceps');
  expect(await header.evaluate(notClipped)).toBe(true);
  // SPEC 13.5: the current card fits the visible list on every phone, SE included.
  const mainH = await page.getByRole('main').evaluate((el) => el.clientHeight);
  expect((await card.boundingBox())!.height).toBeLessThanOrEqual(mainH);
  const cardFits = await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  expect(cardFits).toBe(true);
  expect(errors).toEqual([]);
});
