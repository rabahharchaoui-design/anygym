import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { card, pastIntake } from './helpers/quick';
import { firstFix, holdFor, live, move, openRun, wake } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { bar185, exerciseView, quickWith, seedFinished } from './workout-helpers';

// PLAN M0: before and after screenshots of every screen for the Monolith move, on the iPhone SE
// (375 x 667) and the iPhone 15 (393 x 852, the iPhone 15 Pro's size).
// On demand only: SHOTS_M0=before (or after-m0, after-m1...) npx playwright test tests/shots-m0.spec.ts
// The PNGs land in test-results/shots-m0/<set>/; scripts/shots-webp.sh turns them into small
// WebP files in reports/monolith/<set>/.
const PROFILES = ['iPhone SE', 'iPhone 15'];
const SET = process.env.SHOTS_M0 ?? '';
const DIR = `test-results/shots-m0/${SET}`;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${DIR}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
}

test.beforeEach(() => {
  test.skip(!SET || !PROFILES.includes(test.info().project.name), 'report run only');
});

test('M0 shots: Today, plans, day list, history, settings, gyms', async ({ page }) => {
  await page.goto('./');
  await shot(page, 'today-no-plan');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }, { reps: 8, load: bar185 }] });
  await page.getByRole('button', { name: 'See plans' }).tap();
  await shot(page, 'plans');
  await page.getByTestId('plan-five-day-split').tap();
  await shot(page, 'plan-viewer');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await shot(page, 'today');
  await page.getByTestId('gym-pill').first().tap().catch(() => undefined);
  await shot(page, 'gym-sheet');
  await page.goto('./#/history');
  await shot(page, 'history');
  await page.locator('a[href*="history/"]').first().tap();
  await shot(page, 'history-detail');
  await page.goto('./#/settings');
  await shot(page, 'settings');
  await page.goto('./#/settings/gyms');
  await shot(page, 'gyms');
  await page.goto('./');
  await page.getByRole('button', { name: /^Start/ }).first().tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await shot(page, 'workout-day-list');
});

test('M0 shots: empty history', async ({ page }) => {
  await page.goto('./#/history');
  await shot(page, 'history-empty');
});

test('M0 shots: exercise view, weight sheet, logged set, finish', async ({ page }) => {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await shot(page, 'exercise-view');
  await view.getByRole('button', { name: 'Set 1: set the weight' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await shot(page, 'weight-sheet');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(sheet).toHaveCount(0);
  await view.getByTestId('check-current').tap();
  await view.getByTestId('check-current').tap();
  await shot(page, 'exercise-set-logged');
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/done$/);
  await shot(page, 'finish');
});

test('M0 shots: Quick ideas and the deck', async ({ page }) => {
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await page.getByTestId('min-30').tap();
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await shot(page, 'quick-ideas');
  await page.locator('[data-concept]').first().tap();
  await expect(card(page)).toBeVisible();
  await shot(page, 'quick-deck');
});

test('M0 shots: run start, countdown, live, map, summary', async ({ page, context }) => {
  await stubTiles(page);
  await openRun(page, context);
  await shot(page, 'run-start');
  await page.getByTestId('run-start').tap();
  await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', '3');
  await page.clock.runFor(200);
  await shot(page, 'run-countdown');
  await page.clock.runFor(3500);
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  const r = { page, context, north: 0 };
  await move(r, 12, 5);
  await wake(page);
  await shot(page, 'run-live');
  const vp = page.viewportSize()!;
  const y = vp.height * 0.45;
  await page.mouse.move(vp.width * 0.8, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(vp.width * (0.8 - 0.1 * i), y);
  await page.mouse.up();
  await expect(live(page)).toHaveAttribute('data-page', '1');
  await shot(page, 'run-live-map');
  await holdFor(page, page.getByTestId('live-end'), 1250);
  await expect(page.getByTestId('run-summary')).toBeVisible();
  // The page clock is held: run the summary's draw in so the shot shows the settled screen.
  await page.clock.runFor(4000);
  await shot(page, 'run-summary');
});

test('M0 shots: review', async ({ page }) => {
  await page.goto('./#/review');
  await shot(page, 'review');
});

test.describe('fresh phone', () => {
  test.use({ intake: 'fresh' });
  test('M0 shots: the intake', async ({ page }) => {
    const intake = page.getByTestId('intake');
    const step = (s: string) => expect(intake).toHaveAttribute('data-step', s);
    await page.goto('./');
    await step('goal');
    await shot(page, 'intake-goal');
    await page.getByTestId('q-goal-muscle').tap();
    await page.getByTestId('intake-cta').locator('button[data-variant="primary"]').tap();
    await step('units');
    await shot(page, 'intake-units');
  });
});
