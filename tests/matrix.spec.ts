import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from './fixtures';
import { checkActiveWorkout, checkControls, checkLayout, matrixShot, simulateSafeAreas } from './helpers/layout';
import { checkContrast } from './helpers/contrast';
import { bar185, seedFinished, usePlan } from './workout-helpers';

// SPEC 13.4 on every phone of the matrix (WebKit iPhones, Chromium Androids, the 320 floor):
// every main screen and sheet with the phone's safe areas, no horizontal scroll, nothing wider
// than the screen, nothing tappable under a system bar, and the primary action never covered.
// SHOTS_112=1 also saves a screenshot of each screen per phone for the session report.
// PLAN 1.7i: the active workout is checked BEFORE anything scrolls (title, current row, reps, ✓ on
// one screen, also at 130% text), and every screen's enabled text meets WCAG AA contrast.

const IMPORT_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json');

test.beforeEach(async ({ page }) => {
  await simulateSafeAreas(page);
});

const squat4 = () => ({ 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });

async function startDay(page: Page) {
  await usePlan(page);
  await seedFinished(page, squat4());
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
}

test.describe('every screen fits every phone @matrix', () => {
  test('a brand new user: Today, History, Run, Plans, Settings', async ({ page }) => {
    await page.goto('./');
    await checkLayout(page, { primary: page.getByRole('button', { name: 'See plans' }) });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'today-new');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'History' }).tap();
    await expect(page.getByText('No workouts yet')).toBeVisible();
    await checkLayout(page, { primary: page.getByRole('button', { name: 'Go to Today' }) });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'history-empty');
    await nav.getByRole('link', { name: 'Run' }).tap();
    await expect(page.getByText('No runs yet')).toBeVisible();
    await checkLayout(page);
    await checkControls(page);
    await nav.getByRole('link', { name: 'Plans' }).tap();
    await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
    await checkLayout(page, { primary: page.getByTestId('plan-five-day-split') });
    await checkControls(page);
    await matrixShot(page, 'plans');
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await checkLayout(page);
    await checkControls(page);
    await matrixShot(page, 'settings');
  });

  test('plans: the viewer, Today with a plan, Change day', async ({ page }) => {
    await page.goto('./#/plans/five-day-split');
    await checkLayout(page, { primary: page.getByRole('button', { name: 'Use this plan' }) });
    await checkControls(page);
    await matrixShot(page, 'plan-viewer');
    await page.getByRole('button', { name: 'Use this plan' }).tap();
    await expect(page.getByTestId('day-card-title')).toBeVisible();
    await checkLayout(page, { primary: page.getByRole('button', { name: 'Start', exact: true }) });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'today-plan');
    await page.getByRole('button', { name: 'Change day' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Change day' });
    await expect(sheet).toBeVisible();
    await checkLayout(page, { primary: sheet.getByRole('button', { name: /Day 2 ·/ }) });
    await checkControls(page);
    await checkContrast(page, '[role="dialog"]');
    await matrixShot(page, 'change-day');
  });

  test('the workout: day list, exercise view with the rest bar, weight sheet, picker, finish', async ({ page }) => {
    await startDay(page);
    // Gate 2: the day list's one primary action is the Start pill in the thumb zone.
    await checkLayout(page, { primary: page.getByTestId('start-next') });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'day-list');
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await expect(view.getByTestId('check-current')).toBeEnabled();
    // SPEC 13.5, before anything scrolls: the current set is on one screen.
    await checkActiveWorkout(page);
    await checkLayout(page, { primary: view.getByTestId('check-current') });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'exercise-view');
    await view.getByTestId('check-current').tap();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await checkActiveWorkout(page);
    // SPEC 13.4: the rest bar never covers the next ✓.
    await checkLayout(page, { primary: view.getByTestId('check-current') });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'exercise-rest');
    await view.getByTestId('weight-cell').first().tap();
    const weight = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(weight).toBeVisible();
    await checkLayout(page, { primary: weight.getByRole('button', { name: 'Done' }) });
    await checkControls(page);
    await checkContrast(page, '[role="dialog"]');
    await matrixShot(page, 'weight-sheet');
    await weight.getByRole('button', { name: 'Done' }).tap();
    await expect(weight).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    const done = page.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeVisible();
    await checkLayout(page, { primary: done });
    await checkControls(page);
    await matrixShot(page, 'finish');
  });

  test('the exercise picker of a quick workout', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    const picker = page.getByRole('dialog', { name: 'Add exercise' });
    await expect(picker).toBeVisible();
    await checkLayout(page);
    await checkControls(page);
    await picker.getByRole('searchbox', { name: 'Search exercises' }).fill('curl');
    await picker.getByRole('button', { name: /curl/i }).first().tap();
    await checkLayout(page, { primary: picker.getByRole('button', { name: 'Add 1' }) });
    await checkControls(page);
    await matrixShot(page, 'picker');
    await picker.getByRole('button', { name: 'Add 1' }).tap();
    await expect(picker).toHaveCount(0);
    await checkLayout(page);
    await checkControls(page);
  });

  test('History: the list and a workout', async ({ page }) => {
    await page.goto('./');
    await seedFinished(page, squat4(), 3);
    await seedFinished(page, { 'barbell-bench-press': [{ reps: 8, load: bar185 }] }, 1);
    await page.goto('./#/history');
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(2);
    await checkLayout(page, { primary: rows.first() });
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'history');
    await rows.last().tap();
    await expect(page.getByTestId('history-set')).toHaveCount(4);
    await checkLayout(page);
    await checkControls(page);
    await checkContrast(page);
    await matrixShot(page, 'history-detail');
  });

  test('Settings: import review and the restore sheet', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('import-file').setInputFiles(IMPORT_FIXTURE);
    await expect(page).toHaveURL(/#\/settings\/import$/);
    await checkLayout(page, { primary: page.getByTestId('import-confirm') });
    await checkControls(page);
    await matrixShot(page, 'import-review');
    // A real backup file (Back up downloads when the phone cannot share files), then Restore.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
      Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    });
    await page.goto('./#/settings');
    await page.reload();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
    await page.getByTestId('restore-file').setInputFiles(await download.path());
    const sheet = page.getByRole('dialog').last();
    await expect(sheet).toBeVisible();
    await checkLayout(page);
    await checkControls(page);
    await checkContrast(page, '[role="dialog"]');
    await matrixShot(page, 'restore');
  });

  test('the active workout at 130% text: title, current row, reps and ✓ on one screen before any scrolling', async ({ page }) => {
    await startDay(page);
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await expect(view.getByTestId('check-current')).toBeEnabled();
    await scaleText(page);
    await checkActiveWorkout(page);
    await view.getByTestId('check-current').tap();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await scaleText(page);
    await checkActiveWorkout(page);
  });
});

/** The phone's text at 130%: every computed font size and line height scaled (as in text-130-1.7e.spec.ts). */
async function scaleText(page: Page) {
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const base = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(el.dataset.baseFont ?? s.fontSize), line: parseFloat(el.dataset.baseLine ?? s.lineHeight) };
    });
    for (const { el, size, line } of base) {
      el.dataset.baseFont = String(size);
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) {
        el.dataset.baseLine = String(line);
        el.style.lineHeight = `${line * 1.3}px`;
      }
    }
  });
  await page.waitForTimeout(200);
}
