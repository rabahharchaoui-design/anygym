import { expect, test, type Locator, type Page } from './fixtures';
import { card, pastIntake } from './helpers/quick';
import { openRun } from './helpers/run';
import { quickWith, usePlan } from './workout-helpers';

// PLAN M1: with the Monolith tab bar docked to the bottom edge, the primary action of a screen
// sits fully above the bar (or above the screen's bottom edge where the bar is hidden) with at
// least a 44 pt target, on the iPhone SE and the 320 x 568 floor.
test.beforeEach(() => {
  test.skip(!['iPhone SE', '320 floor'].includes(test.info().project.name), 'the small phones');
});

async function clearsBar(page: Page, button: Locator, what: string) {
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const b = (await button.boundingBox())!;
  const nav = page.getByRole('navigation', { name: 'Main', includeHidden: true });
  const shown = (await nav.count()) > 0 && (await nav.getAttribute('data-hidden')) === null;
  const floor = shown ? (await nav.boundingBox())!.y : page.viewportSize()!.height;
  expect(b.y + b.height, `${what}: bottom ${b.y + b.height} vs ${shown ? 'tab bar top' : 'screen bottom'} ${floor}`).toBeLessThanOrEqual(floor + 0.5);
  expect(b.height, `${what}: 44 pt target`).toBeGreaterThanOrEqual(44);
  expect(b.width, `${what}: 44 pt target`).toBeGreaterThanOrEqual(44);
}

test('M1 the Run Start sits above the tab bar @matrix', async ({ page, context }) => {
  await openRun(page, context);
  await clearsBar(page, page.getByTestId('run-start'), 'Run Start');
});

test("M1 Today's Start sits above the tab bar @matrix", async ({ page }) => {
  await usePlan(page);
  await clearsBar(page, page.getByRole('button', { name: /^Start/ }).first(), 'Today Start');
});

test('M1 Quick: the deck Start sits above the tab bar or the screen edge @matrix', async ({ page }) => {
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await page.getByTestId('min-30').tap();
  await page.locator('[data-concept]').first().tap();
  await expect(card(page)).toBeVisible();
  await clearsBar(page, page.getByTestId('quick-start').locator('button'), 'Quick Start');
});

test('M1 the workout Finish sits above the screen edge @matrix', async ({ page }) => {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  await clearsBar(page, page.getByRole('button', { name: 'Finish', exact: true }), 'Finish');
});
