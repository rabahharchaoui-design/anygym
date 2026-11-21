import { expect, test, type Page } from './fixtures';
import { DEVICE, note, shot } from './helpers/auditShot';
import { firstFix, holdFor, live, move, openRun, wake } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { join } from 'node:path';
import { card, pastIntake } from './helpers/quick';
import { seedHistory } from './helpers/history-fixture';
import { PARK, runRow } from './helpers/run';
import { bar185, dbAll, dbPut, exerciseView, seedFinished, usePlan } from './workout-helpers';

// PLAN M11 (1): a screenshot of every screen and menu as the app is now, on the iPhone 15 Pro
// (the "iPhone 15" project, 393 x 852) and the iPhone SE (375 x 667). One test per screen group.
// On demand: M11=1 PW_NO_BUILD=1 PW_PORT=4195 npx playwright test tests/audit-m11.spec.ts -g <group>
test.setTimeout(90_000);
test.beforeEach(() => {
  test.skip(!process.env.M11 || !DEVICE[test.info().project.name], 'audit run only');
});

const primary = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');

test.describe('fresh phone', () => {
  test.use({ intake: 'fresh' });
  test('onboarding', async ({ page }) => {
    const G = 'onboarding';
    const step = (s: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', s);
    const pick = (screen: string, v: string) => page.getByTestId(`q-${screen}-${v}`).tap();
    await page.goto('./');
    await step('goal');
    await shot(page, G, '01-goal', 'fresh phone, open #/: "What\'s your main goal?"');
    await pick('goal', 'muscle');
    await shot(page, G, '02-goal-picked', 'goal step, tap Build muscle');
    await primary(page).tap();
    await step('units');
    await shot(page, G, '03-units', 'tap Continue after goal');
    await page.getByTestId('units-weight').getByRole('radio', { name: 'lb', exact: true }).tap();
    await primary(page).tap();
    await step('focus');
    await shot(page, G, '04-focus', 'units, Continue: "What do you want to work on?"');
    await pick('focus', 'back');
    const sheet = page.getByRole('dialog', { name: / focus$/ });
    if (await sheet.isVisible().catch(() => false)) {
      await shot(page, G, '05-focus-parts-sheet', 'focus step, tap Back tile: body parts sheet');
      await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
      await expect(sheet).not.toBeVisible();
    } else note('onboarding/05-focus-parts-sheet not shown for back');
    await shot(page, G, '06-focus-picked', 'focus step with Back picked');
    await primary(page).tap();
    await step('experience');
    await shot(page, G, '07-experience', 'focus, Continue');
    await pick('experience', '3y');
    await step('days');
    await shot(page, G, '08-days', 'experience, tap 3 years: days per week');
    await pick('days', '5');
    await step('weekdays');
    await shot(page, G, '09-schedule', 'days, tap 5: schedule style');
    await pick('schedule', 'fixed');
    await shot(page, G, '10-weekdays-fixed', 'schedule, tap Same days each week: weekday chips');
    await pick('schedule', 'flexible');
    await primary(page).tap();
    await step('minutes');
    await shot(page, G, '11-minutes', 'schedule flexible, Continue');
    await pick('minutes', '60');
    await step('place');
    await shot(page, G, '12-place', 'minutes, tap 60');
    await pick('place', 'full');
    await step('equipment');
    await shot(page, G, '13-equipment', 'place, tap Full gym', true);
    await primary(page).tap();
    await step('style');
    await shot(page, G, '14-style', 'equipment, Continue');
    await pick('style', 'mix');
    await step('cardio');
    await shot(page, G, '15-cardio', 'style, tap mix');
    await pick('cardio', 'little');
    await primary(page).tap();
    await step('easyOn');
    await shot(page, G, '16-easy-on', 'cardio, Continue: easy on (joints)');
    await page.getByTestId('skip').tap();
    await step('exercises');
    await shot(page, G, '17-exercises-deck', 'easy on, Skip: exercises deck');
    await page.getByTestId('skip').tap();
    await step('about');
    await shot(page, G, '18-about-you', 'exercises, Skip: about you', true);
    await page.getByTestId('skip').tap();
    await step('reveal');
    await shot(page, G, '19-reveal', 'about, Skip: plan reveal', true);
    await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
    await expect(page).toHaveURL(/#\/$/);
    await shot(page, G, '20-first-today', 'reveal, Looks good: first Today with the welcome tour step 1');
    for (const n of [2, 3]) {
      const next = page.getByRole('button', { name: 'Next', exact: true });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.tap();
      await shot(page, G, `2${n - 1}-welcome-tour-${n}`, `first Today, tour Next x${n - 1}`);
    }
    note('onboarding: no separate welcome screen exists; the first screen is the goal question, and a 3 step welcome tour shows on first Today');
  });
});

test('run', async ({ page, context }) => {
  const G = 'run';
  await stubTiles(page);
  await openRun(page, context, { pocket: true });
  await shot(page, G, '01-start-free', 'Run tab, #/run: Free run selected');
  await page.getByTestId('run-type-distance').tap();
  await expect(page.getByTestId('goal-sheet-distance')).toBeVisible();
  await shot(page, G, '02-goal-sheet-distance', 'Run tab, tap Distance: goal sheet open');
  await page.getByTestId('distance-custom').tap();
  await shot(page, G, '02b-goal-sheet-distance-custom', 'distance goal sheet, tap Custom: wheel');
  await page.getByTestId('goal-done').tap();
  await expect(page.getByTestId('goal-sheet-distance')).toBeHidden();
  await shot(page, G, '03-start-distance-closed', 'goal sheet Done: start screen with a distance goal');
  await page.getByTestId('run-type-time').tap();
  await expect(page.getByTestId('goal-sheet-time')).toBeVisible();
  await shot(page, G, '04-goal-sheet-time', 'Run tab, tap Time: goal sheet open');
  await page.getByTestId('time-custom').tap();
  await shot(page, G, '04b-goal-sheet-time-custom', 'time goal sheet, tap Custom: wheel');
  await page.getByTestId('goal-done').tap();
  await expect(page.getByTestId('goal-sheet-time')).toBeHidden();
  await page.getByTestId('run-type-intervals').tap();
  await expect(page.getByTestId('goal-sheet-intervals')).toBeVisible();
  await shot(page, G, '05-goal-sheet-intervals', 'Run tab, tap Intervals: interval picker sheet');
  await page.getByTestId('interval-beginner').tap();
  await expect(page.getByTestId('goal-sheet-intervals')).toBeHidden();
  await shot(page, G, '06-start-intervals', 'intervals sheet, Beginner: start screen');
  await page.getByTestId('run-type-free').tap();
  await page.getByTestId('run-start').tap();
  await expect(page.getByTestId('pocket-sheet')).toBeVisible();
  await shot(page, G, '07-pocket-explainer-sheet', 'first Start tap: pocket mode explainer sheet');
  await page.getByTestId('pocket-go').tap();
  await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', '3');
  await page.clock.runFor(200);
  await shot(page, G, '08-countdown', 'pocket sheet Got it: countdown');
  await page.clock.runFor(3500);
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  const r = { page, context, north: 0 };
  await move(r, 12, 5);
  await wake(page);
  await shot(page, G, '09-live-numbers', 'live run, numbers page (page 1)');
  const vp = page.viewportSize()!;
  const y = vp.height * 0.45;
  await page.mouse.move(vp.width * 0.8, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(vp.width * (0.8 - 0.1 * i), y);
  await page.mouse.up();
  await expect(live(page)).toHaveAttribute('data-page', '1');
  await shot(page, G, '10-live-map', 'live run, swipe left: map page (tiles stubbed)');
  await page.getByTestId('live-dot-0').tap();
  await page.getByTestId('live-lock').tap();
  await expect(page.getByTestId('live-unlock')).toBeVisible();
  await shot(page, G, '11-locked', 'live run, tap Lock: locked, hold to unlock');
  await holdFor(page, page.getByTestId('live-unlock'), 1250);
  await expect(page.getByTestId('live-lock')).toBeVisible();
  await page.clock.runFor(12_000);
  await shot(page, G, '12-pocket-dim', 'live run left alone 12 s: pocket mode dimmed screen');
  await wake(page);
  await page.getByTestId('live-pause').tap();
  await expect(page.getByTestId('live-resume')).toBeVisible();
  await shot(page, G, '13-paused', 'live run, tap Pause: paused');
  await page.getByTestId('live-settings').tap();
  await shot(page, G, '14-run-settings-sheet', 'paused, tap settings: run settings sheet (auto pause, voice)');
  await page.keyboard.press('Escape');
  await page.getByTestId('live-hide').tap();
  await shot(page, G, '15-start-while-running', 'live run, tap hide: run start screen with the run going');
  await page.getByTestId('run-going-open').tap();
  await holdFor(page, page.getByTestId('live-end'), 1250).catch(() => undefined);
  if (!(await page.getByTestId('run-summary').isVisible())) {
    await page.getByTestId('live-resume').tap();
    await holdFor(page, page.getByTestId('live-end'), 1250);
  }
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await page.clock.runFor(4000);
  await shot(page, G, '16-summary', 'hold End: run summary', true);
  await page.getByTestId('run-summary').evaluate((el) => {
    for (const e of [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))]) if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight;
  });
  await shot(page, G, '16b-summary-scrolled', 'run summary scrolled to the bottom (splits, facts)');
  await page.getByTestId('run-share-card').tap();
  await expect(page.getByTestId('run-share-sheet')).toBeVisible();
  await shot(page, G, '17-share-card-sheet', 'summary, tap Share card: share sheet with the poster preview');
  await page.keyboard.press('Escape');
  await page.getByTestId('summary-done').tap();
  await expect(page.getByTestId('run-start')).toBeVisible();
  await shot(page, G, '18-start-after-done', 'summary, Done: back on the start screen');
  note('run: summary variants (saved, too short) not separate; Done path shown; the short-run discard variant is not shot');
});

async function openDay(page: Page) {
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }, { reps: 8, load: bar185 }] });
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
}

test('workout', async ({ page }) => {
  const G = 'workout';
  await openDay(page);
  await shot(page, G, '01-day-list', 'Today, Start: workout day list (Day 1 of the 5 day split)', true);
  await page.getByRole('button', { name: /How much time today/ }).tap({ timeout: 3000 }).catch(() => undefined);
  if (await page.getByRole('dialog').isVisible().catch(() => false)) {
    await shot(page, G, '02-time-budget-sheet', 'day list, tap the minutes line: time budget sheet');
    await page.keyboard.press('Escape');
  } else note('workout/02-time-budget-sheet not reachable by the minutes button');
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await shot(page, G, '03-exercise', 'day list, tap Barbell Back Squat: exercise view with demo hero', false);
  await shot(page, G, '03b-exercise-scrolled', 'exercise view, full page (muscles, how to, watch out)', true);
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, G, '04-weight-sheet-empty', 'exercise, tap Set 1 weight: weight sheet, bar only');
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await shot(page, G, '05-weight-sheet-plates', 'weight sheet, add 45 and 25 lb plates: plate diagram, 185 lb');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(sheet).toHaveCount(0);
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await shot(page, G, '06-set-logged-rest-running', 'log set 1 with the check: rest timer running');
  await page.getByTestId('rest-timer').tap().catch(() => undefined);
  await shot(page, G, '06b-rest-timer-tapped', 'tap the rest timer');
  await page.getByRole('button', { name: /^Set 1.*\. Edit$/ }).first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  if (await edit.isVisible().catch(() => false)) {
    await shot(page, G, '07-edit-set-sheet', 'tap the logged set 1 row: Edit set sheet');
    await page.keyboard.press('Escape');
    await expect(edit).toHaveCount(0);
  } else note('workout/07-edit-set-sheet not reachable');
  await page.getByRole('button', { name: /Change set type/ }).first().tap();
  await shot(page, G, '08-set-type-sheet', 'tap the set number chip: set type sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await shot(page, G, '09-exercise-menu', 'exercise, tap the ... button: exercise menu');
  await page.getByTestId('rest-row').tap();
  await shot(page, G, '10-rest-setting', 'exercise menu, Rest after each set');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap().catch(() => undefined);
  await page.getByRole('button', { name: /^Remove/ }).first().tap().catch(() => undefined);
  await shot(page, G, '11-remove-exercise', 'exercise menu, tap Remove: confirm or toast, whatever shows');
});

test('workout sheets and demo', async ({ page }) => {
  const G = 'workout';
  await openDay(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await page.waitForTimeout(500);
  await view.getByRole('button', { name: 'How to do Barbell Back Squat' }).first().tap();
  await page.waitForTimeout(600);
  await shot(page, G, '12-demo-viewer-or-info-sheet', 'exercise, tap the demo picture: full screen demo / info sheet with the demo');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-decline-bench-sit-up').tap();
  const none = exerciseView(page, 'decline-bench-sit-up');
  await expect(none).toBeVisible();
  await shot(page, G, '15-exercise-no-demo', 'day list, tap Decline Bench Sit Up: exercise with no demo');
  await none.getByRole('button', { name: 'How to do Decline Bench Sit Up' }).tap();
  await expect(page.getByTestId('exercise-sheet')).toHaveAttribute('data-match', 'none');
  await shot(page, G, '16-info-sheet-demo-hidden', 'tap the picture of an exercise with no demo: info sheet, Demo coming soon');
});

test('workout finish', async ({ page }) => {
  const G = 'workout';
  await openDay(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await view.getByTestId('check-current').tap();
  await view.getByTestId('check-current').tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.waitForTimeout(500);
  if (!/done$/.test(page.url())) {
    await shot(page, G, '17-finish-confirm', 'tap Finish with sets left: confirm sheet');
    await page.getByRole('button', { name: /Finish|End|Yes/ }).last().tap();
  }
  await expect(page).toHaveURL(/done$/);
  await shot(page, G, '18-workout-finished', 'Finish: "Workout finished" screen', true);
  await page.getByTestId('finish-change').tap({ timeout: 2000 }).catch(() => undefined);
  await shot(page, G, '19-finish-change-day', 'finish screen, change next day sheet (if any)');
});

test('workout quick-start picker', async ({ page }) => {
  const G = 'workout';
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  const picker = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(picker).toBeVisible();
  await shot(page, G, '13-add-exercise-picker', 'Today, Quick workout (the empty one): Add exercise picker sheet');
  await picker.getByRole('searchbox', { name: 'Search exercises' }).fill('zzzz');
  await shot(page, G, '14-add-exercise-no-results', 'picker, search for zzzz: empty state');
  await picker.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await picker.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await shot(page, G, '14b-add-exercise-one-picked', 'picker, one exercise picked: Add 1 button');
  await picker.getByRole('button', { name: 'Add 1' }).tap();
  await expect(picker).toHaveCount(0);
  await shot(page, G, '14c-quick-day-list', 'quick workout day list after adding exercises (empty-ish quick list with + Add exercise)', true);
});

test('today', async ({ page }) => {
  const G = 'today';
  await page.goto('./');
  await shot(page, G, '01-no-plan', 'fresh data past intake, open #/: Today without a plan');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
  await usePlan(page);
  await shot(page, G, '02-with-plan', 'See plans, Five day split, Use this plan: Today with a plan');
  await page.getByTestId('gym-pill').first().tap().catch(() => undefined);
  await shot(page, G, '03-gym-sheet', 'Today, tap the gym pill: gym picker sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Change day', exact: true }).tap({ timeout: 3000 }).catch(() => undefined);
  await shot(page, G, '04-change-day-sheet', 'Today, tap Change day: change day sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Preview', exact: true }).tap({ timeout: 3000 }).catch(() => undefined);
  await shot(page, G, '05-preview', 'Today, tap Preview: day preview');
  await page.keyboard.press('Escape');
  await page.goto('./#/');
  await page.getByTestId('day-card-time').tap({ timeout: 3000 }).catch(() => undefined);
  await shot(page, G, '06-time-sheet', 'Today, tap the ~min line: time budget sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await shot(page, G, '07-workout-in-progress', 'workout, tap minimize: Today with a workout in progress (resume)');
});

test('quick', async ({ page }) => {
  const G = 'quick';
  await pastIntake(page);
  await shot(page, G, '01-today-quick-entry', 'past intake, Today (build card)');
  await page.getByTestId('build-card').tap();
  await shot(page, G, '02-time-step', 'Today, tap the build card: Quick, how much time');
  await page.getByTestId('min-30').tap();
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await shot(page, G, '03-ideas', 'Quick, tap 30 min: idea cards', true);
  await page.locator('[data-concept]').first().getByTestId('concept-info').tap();
  await expect(page.getByTestId('idea-sheet')).toBeVisible();
  await shot(page, G, '04-idea-sheet', 'idea card, tap info: idea sheet');
  await page.keyboard.press('Escape');
  await page.locator('[data-concept]').first().tap();
  await expect(card(page)).toBeVisible();
  await shot(page, G, '05-deck', 'tap an idea: exercise deck, first card');
  for (let i = 0; i < 12 && !(await page.getByTestId('ready-list').isVisible()); i++) {
    await page.getByTestId('deck-keep').tap({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    if (i === 1) await shot(page, G, '06-deck-card-3', 'deck after two Keep taps');
  }
  if (await page.getByTestId('ready-list').isVisible()) await shot(page, G, '07-review-ready', 'keep every card: Ready to go review list', true);
  else note('quick/07-review-ready not reached in 12 keeps');
});

test('history', async ({ page }) => {
  const G = 'history';
  await stubTiles(page);
  await page.goto('./#/history');
  await shot(page, G, '01-empty', 'fresh data, History tab: empty state');
  await page.goto('./');
  await seedHistory(page, { weeks: 20 });
  const base = Date.now() - 3 * 86_400_000;
  await dbPut(page, { runs: [runRow('audit-run-1', 3200, base), runRow('audit-run-2', 5100, base - 5 * 86_400_000), runRow('audit-run-3', 1700, base - 9 * 86_400_000)] });
  await page.goto('./#/history');
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  await shot(page, G, '02-list', 'History tab with 20 weeks of workouts and 3 runs', true);
  await page.getByTestId('history-runs-link').tap();
  await expect(page.getByTestId('run-records')).toBeVisible();
  await shot(page, G, '03-run-records', 'History, tap the runs link: personal records', true);
  await page.getByRole('radio', { name: /heatmap/i }).tap({ timeout: 3000 }).catch(() => undefined);
  await shot(page, G, '04-run-heatmap', 'run records, switch to Heatmap');
  await page.goto('./#/history/run/audit-run-1');
  await expect(page.getByRole('main')).toBeVisible();
  await shot(page, G, '05-run-detail', '#/history/run/<id>: run detail', true);
  await page.goto('./#/history');
  await page.locator('[data-testid="history-row"] a, a[data-testid="history-row"]').first().tap().catch(async () => page.getByTestId('history-row').first().tap());
  await expect(page.getByTestId('history-meta')).toBeVisible();
  await shot(page, G, '06-workout-detail', 'History, tap a workout: workout detail', true);
  await page.getByTestId('history-set').first().tap().catch(() => undefined);
  await shot(page, G, '07-workout-detail-set-tapped', 'workout detail, tap a set (edit sheet if any)');
  note('history: no calendar view exists in the app');
});

test('plans', async ({ page }) => {
  const G = 'plans';
  await page.goto('./#/plans');
  await shot(page, G, '01-plans-list', 'Plans tab', true);
  const place = page.locator('[data-testid^="place-"]').first();
  if (await place.count()) {
    await place.tap();
    await shot(page, G, '02-place-plans', 'Plans, tap the first place: plans for that place', true);
    await page.goBack();
  }
  await page.goto('./#/plans/five-day-split');
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await shot(page, G, '03-plan-detail', '#/plans/five-day-split: plan viewer', true);
  const tips = page.getByTestId('coach-tips-toggle');
  if (await tips.count()) {
    await tips.tap();
    await shot(page, G, '04-coach-tips-open', 'plan detail, open Coach tips', true);
  } else note('plans/coach tips not on the plan detail without an active plan');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await page.goto('./#/plans');
  await shot(page, G, '05-plans-list-with-active', 'Plans tab with an active plan', true);
  await page.goto('./#/plans/five-day-split');
  await shot(page, G, '06-plan-detail-active', 'plan viewer of the active plan (coach tips if any)', true);
  const tips2 = page.getByTestId('coach-tips-toggle');
  if (await tips2.count()) {
    await tips2.tap();
    await shot(page, G, '07-coach-tips-open-active', 'active plan viewer, open Coach tips', true);
  } else note('plans/coach tips: none on the active plan viewer');
});

test('settings', async ({ page }) => {
  const G = 'settings';
  await page.goto('./#/settings');
  await expect(page.getByTestId('backup')).toBeVisible();
  await shot(page, G, '01-settings', '#/settings top', false);
  await shot(page, G, '01b-settings-full', '#/settings whole page (units, feel, gyms, data, privacy, help, about)', true);
  await page.getByRole('main').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await shot(page, G, '01c-settings-bottom', '#/settings scrolled to the bottom (about, voice credit)');
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByTestId('gyms-list')).toBeVisible();
  await shot(page, G, '02-gyms', 'Settings, tap Gyms: gyms list', true);
  await page.getByTestId('settings-new-gym').tap();
  await shot(page, G, '03-new-gym-sheet', 'Gyms, tap new gym: new gym sheet');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid^="gyms-row-"]').first().tap();
  await shot(page, G, '04-gym-detail', 'Gyms, tap a gym: gym detail', true);
  await page.getByTestId('detail-equipment').tap().catch(() => undefined);
  await expect(page.getByTestId('gym-equipment')).toBeVisible();
  await shot(page, G, '05-gym-equipment', 'gym detail, tap equipment: equipment picker', true);
  await page.goto('./#/settings');
  await page.getByTestId('report-problem').tap();
  await shot(page, G, '06-report-problem-sheet', 'Settings, tap Report a problem: sheet');
  await page.keyboard.press('Escape');
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await shot(page, G, '07-restore-error', 'Settings, pick a file that is not a backup: error line');
  const tables = Object.fromEntries(['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones'].map((t) => [t, []]));
  const good = JSON.stringify({ format: 'anygym-backup-v1', schemaVersion: 6, appVersion: '0.1.0', exportedAt: 1, tables, drafts: {} });
  await page.getByTestId('restore-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(good) });
  await page.getByRole('dialog', { name: 'Restore backup' }).waitFor({ timeout: 4000 }).catch(() => undefined);
  await shot(page, G, '08-restore-sheet', 'Settings, pick a backup file: Restore backup sheet');
  await page.keyboard.press('Escape');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.getByTestId('backup').tap()]);
  void download;
  await shot(page, G, '09-after-backup', 'Settings, tap Back up: toast');
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles(join('src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json'));
  await expect(page).toHaveURL(/settings\/import/);
  await shot(page, G, '10-import-review', 'Settings, pick an import file: import review', true);
  await page.goto('./#/review');
  await shot(page, G, '11-review', '#/review screen', true);
  note('settings: no separate units/voice/about sub screens exist; units, voice credit and about live on the settings page');
});

test('load errors and offline', async ({ page, context }) => {
  const G = 'errors';
  await page.addInitScript(() => ((window as unknown as { __anygymFailReads: boolean }).__anygymFailReads = true));
  await page.goto('./#/history');
  await expect(page.getByTestId('load-error')).toBeVisible();
  await shot(page, G, '01-history-load-error', 'history read fails (test flag __anygymFailReads): "Could not load workouts" with Try again');
  await page.goto('./#/');
  await expect(page.getByTestId('load-error')).toBeVisible();
  await shot(page, G, '02-today-load-error', 'today read fails: load error with Try again');
  await page.evaluate(() => ((window as unknown as { __anygymFailReads: boolean }).__anygymFailReads = false));
  await page.getByRole('button', { name: 'Try again', exact: true }).tap();
  await shot(page, G, '03-today-after-try-again', 'Try again with reads working again');
  await context.setOffline(true);
  await page.goto('./#/run').catch(() => undefined);
  await shot(page, G, '04-run-offline', 'offline, Run tab (map offline state)');
  await context.setOffline(false);
});
