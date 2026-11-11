import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { card, pastIntake } from './helpers/quick';
import { bar185, exerciseView, quickWith, seedFinished } from './workout-helpers';

// PLAN 3.5t report: every main screen in Titanium Glass, on the SE and the iPhone 15.
// On demand only: SHOTS_35T=1 npx playwright test tests/shots-3.5t.spec.ts
const PROFILES = ['iPhone SE', 'iPhone 15'];
const DIR = 'reports/shots/3.5t';

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${DIR}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
}

test.beforeEach(() => {
  test.skip(!process.env.SHOTS_35T || !PROFILES.includes(test.info().project.name), 'report run only');
});

test('3.5t shots: Today, plans, the day list, history, settings, gyms', async ({ page }) => {
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
  await page.goto('./#/history');
  await shot(page, 'history');
  await page.locator('a[href*="history/"]').first().tap();
  await shot(page, 'history-detail');
  await page.goto('./#/run');
  await shot(page, 'run');
  await page.goto('./#/settings');
  await shot(page, 'settings');
  await page.goto('./#/settings/gyms');
  await shot(page, 'gyms');
  await page.goto('./');
  await page.getByRole('button', { name: /^Start/ }).first().tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await shot(page, 'workout-day-list');
});

test('3.5t shots: the exercise view, the weight sheet, a logged set and the finish screen', async ({ page }) => {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await shot(page, 'exercise-view');
  // No weight yet: Pick opens the weight picker (a sheet).
  await view.getByRole('button', { name: 'Set 1: set the weight' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await shot(page, 'sheet');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(sheet).toHaveCount(0);
  await view.getByTestId('check-current').tap();
  await view.getByTestId('check-current').tap();
  await shot(page, 'exercise-set-logged');
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/done$/);
  await shot(page, 'finish');
});

test('3.5t shots: Quick workout ideas and the deck', async ({ page }) => {
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await page.getByTestId('min-30').tap();
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await shot(page, 'quick-ideas');
  await page.locator('[data-concept]').first().tap();
  await expect(card(page)).toBeVisible();
  await shot(page, 'quick-deck');
  await page.getByTestId('deck-info').tap();
  await shot(page, 'quick-deck-info-sheet');
});

test('3.5t shots: review', async ({ page }) => {
  await page.goto('./#/review');
  await shot(page, 'review');
  await page.goto('./#/review/new');
  await shot(page, 'review-new');
});

test('3.5t shots: the UI kit', async ({ page }) => {
  await page.goto('./?dev#/dev/ui');
  await shot(page, 'ui-kit');
  await page.evaluate(() => document.querySelector('[class*="screen"], main')?.scrollTo(0, 700));
  await shot(page, 'ui-kit-2');
});

test.describe('fresh phone', () => {
  test.use({ intake: 'fresh' });
  test('3.5t shots: the intake and the reveal', async ({ page }) => {
    const intake = page.getByTestId('intake');
    const step = (s: string) => expect(intake).toHaveAttribute('data-step', s);
    const pick = (screen: string, id: string) => page.getByTestId(`q-${screen}-${id}`).tap();
    const next = () => page.getByTestId('intake-cta').locator('button[data-variant="primary"]').tap();
    const skip = () => page.getByTestId('skip').tap();
    await page.goto('./');
    await step('goal');
    await shot(page, 'intake-goal');
    await pick('goal', 'muscle');
    await shot(page, 'intake-goal-picked');
    await next();
    await step('units');
    await next();
    await step('focus');
    await pick('focus', 'balance');
    await next();
    await step('win');
    await pick('win', 'energy');
    await next();
    await step('experience');
    await pick('experience', '3y');
    await step('days');
    await shot(page, 'intake-days');
    await pick('days', '5');
    await step('weekdays');
    await skip();
    await step('minutes');
    await pick('minutes', '60');
    await step('place');
    await pick('place', 'full');
    await step('equipment');
    await shot(page, 'intake-equipment');
    await next();
    await step('style');
    await pick('style', 'mix');
    await step('cardio');
    await pick('cardio', 'little');
    await next();
    await step('easyOn');
    await skip();
    await step('exercises');
    await shot(page, 'intake-exercises-deck');
    await skip();
    await step('when');
    await pick('when', 'after_work');
    await step('bodyweight');
    await shot(page, 'intake-bodyweight');
    await skip();
    await step('about');
    await skip();
    await step('reveal');
    await page.waitForTimeout(1200);
    await shot(page, 'intake-reveal');
  });
});
