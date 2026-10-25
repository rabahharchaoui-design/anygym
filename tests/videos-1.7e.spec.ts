import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { bar185, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7e proof (SPEC 23.4): screen recordings of the main flows on iPhone SE and 17 Pro Max.
// On demand only:  VIDEOS_17E=1 npx playwright test tests/videos-1.7e.spec.ts
const ON = !!process.env.VIDEOS_17E;
const PROFILES = ['iPhone SE', 'iPhone 17 Pro Max'];
test.use({ video: 'on' });

async function save(page: Page, flow: string) {
  const project = test.info().project.name.replace(/ /g, '-');
  await page.waitForTimeout(600);
  const video = page.video();
  await page.close();
  if (!video) return;
  mkdirSync('reports/videos', { recursive: true });
  copyFileSync(await video.path(), `reports/videos/1.7e-${project}-${flow}.webm`);
}

async function swipe(page: Page, x0: number, y0: number, dx: number, dy: number, ms: number) {
  const steps = Math.max(2, Math.round(ms / 16));
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    await page.waitForTimeout(ms / steps);
  }
  await page.mouse.up();
}

test.beforeEach(() => {
  test.skip(!ON || !PROFILES.includes(test.info().project.name), 'report run only');
});

test('tabs', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.waitForTimeout(800);
  for (const name of ['Run', 'History', 'Plans', 'Today', 'Plans', 'Today']) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).tap();
    await page.waitForTimeout(700);
  }
  expect(errors).toEqual([]);
  await save(page, 'tabs');
});

test('push-pop-swipe', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.waitForTimeout(600);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }).tap();
  await page.waitForTimeout(700);
  await page.getByTestId('plan-five-day-split').tap();
  await page.waitForTimeout(900);
  await page.locator('[data-scroller]').evaluate((el) => el.scrollTo({ top: 420, behavior: 'smooth' }));
  await page.waitForTimeout(900);
  await page.getByRole('link', { name: 'Back to Plans' }).tap();
  await page.waitForTimeout(900);
  await page.getByTestId('plan-five-day-split').tap();
  await page.waitForTimeout(900);
  // Drag halfway and let go slowly: it springs back. Then a real swipe back.
  await swipe(page, 6, 420, 120, 0, 700);
  await page.waitForTimeout(800);
  await swipe(page, 6, 420, 260, 0, 260);
  await expect(page).toHaveURL(/#\/plans$/);
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
  await save(page, 'push-pop-swipe');
});

test('workout', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForTimeout(1000);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await page.waitForTimeout(1000);
  await view.getByTestId('check-current').tap();
  await page.waitForTimeout(1000);
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
  await save(page, 'workout');
});

test('weight-sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('check-current')).toBeEnabled();
  await page.waitForTimeout(800);
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(900);
  await sheet.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
  await page.waitForTimeout(700);
  // Drag the sheet down by its grabber and flick: it closes by velocity.
  const grab = (await sheet.getByRole('button', { name: 'Close', exact: true }).boundingBox())!;
  await swipe(page, grab.x + grab.width / 2, grab.y + grab.height - 8, 0, 260, 180);
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(900);
  expect(errors).toEqual([]);
  await save(page, 'weight-sheet');
});

test('finish', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Done' }).tap();
  await page.waitForTimeout(1200);
  expect(errors).toEqual([]);
  await save(page, 'finish');
});
