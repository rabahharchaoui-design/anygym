import { expect, test, type Page } from './fixtures';
import { navIdle, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.3: what each exercise shows (SPEC 4.4). Since PLAN 2.2b it is all on the exercise page
// (demo hero, muscles, How to, Watch out, Good for) with a full screen demo viewer; the sheet is
// left for match none (tests/exercise-screen-2.2b.spec.ts covers the layout).
// Day 1 of the five day split has a variant (Barbell Back Squat), an exact match (Machine Lying
// Leg Curl) and a match none (Decline Bench Sit Up).

const SHOTS = 'reports/shots/2.3';
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

async function openExercise(page: Page, id: string) {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId(`row-${id}`).tap();
  const view = page.getByTestId(`exercise-${id}`);
  await expect(view).toBeVisible();
  await page.waitForTimeout(400); // past the arrival guard
  await navIdle(page);
  return view;
}

/** The set table's rows and their ✓ sit fully in the first screen, unscrolled (SPEC 13.5, PLAN 2.2b). */
async function tableOnScreen(page: Page) {
  const vh = page.viewportSize()!.height;
  await expect(page.getByTestId('check-current')).toBeVisible();
  const main = page.getByRole('main');
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  const list = (await page.getByRole('list', { name: 'Sets' }).boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(vh);
}

const openViewer = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `How to do ${name}` }).tap();
  const viewer = page.getByTestId('demo-viewer');
  await expect(viewer).toBeVisible();
  return viewer;
};

test('variant: photos, the map caveat as a note, numbered cues, watch out and good for, all on the page', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'barbell-back-squat');
  const hero = view.getByTestId('demo-hero');
  await expect(hero).toBeVisible();
  // Two frames (webp with a jpg fallback) plus the blurred fill behind them, from the app's own files.
  await expect(hero.locator('[data-frame] source[type="image/webp"]')).toHaveCount(2);
  await expect(hero.locator('[data-frame] img')).toHaveCount(2);
  await expect(hero.locator('[data-frame] img').first()).toHaveAttribute('src', /ex\/Barbell_Squat\/0\.jpg$/);
  await expect(view.getByTestId('cue-line')).toHaveCount(0);
  await tableOnScreen(page);
  await expect(view.getByTestId('variant-note')).toContainText('Plan uses a wide stance');
  const cues = view.getByTestId('form-tips').locator('li');
  expect(await cues.count()).toBeGreaterThanOrEqual(2);
  expect(await cues.count()).toBeLessThanOrEqual(3);
  await expect(view.getByTestId('watch-out')).toBeVisible();
  await expect(view.getByTestId('good-for')).toBeVisible();
  await expect(view.getByTestId('muscle-pair')).toBeVisible();
  await shot(page, 'collapsed-variant');

  // The viewer: no "1 / 2" counter, no dots, no Form details (nothing is left to show there).
  const viewer = await openViewer(page, 'Barbell Back Squat');
  await expect(viewer.getByText('1 / 2')).toHaveCount(0);
  await expect(viewer.getByTestId('demo-dots')).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Form details' })).toHaveCount(0);
  await shot(page, 'sheet-variant');
  await viewer.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(viewer).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the crossfade timing is 1.2 s, 0.35 s, 1.2 s', async ({ page }) => {
  await openExercise(page, 'machine-lying-leg-curl');
  const viewer = await openViewer(page, 'Machine Lying Leg Curl');
  const end = viewer.locator('[data-frame="1"]');
  const anim = await end.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { duration: cs.animationDuration, timing: cs.animationTimingFunction, count: cs.animationIterationCount };
  });
  expect(anim).toEqual({ duration: '3.1s', timing: 'ease-in-out', count: 'infinite' });
});

test('exact: demo, muscles, cues and good for on the page', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'machine-lying-leg-curl');
  await expect(view.getByTestId('demo-hero')).toBeVisible();
  await expect(view.getByTestId('form-tips')).toContainText('Lie face down');
  await tableOnScreen(page);
  await expect(view.getByTestId('muscle-line')).toContainText('Hamstrings');
  await expect(view.getByTestId('form-tips').locator('li')).toHaveCount(3);
  await expect(view.getByTestId('good-for')).toContainText('hamstrings');
  await shot(page, 'collapsed-exact');
  expect(errors).toEqual([]);
});

test('match none: "Demo coming soon", no photos, no muscle map, no tips', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'decline-bench-sit-up');
  await expect(view.getByTestId('demo-hero')).toHaveCount(0);
  await expect(view.getByTestId('form-tips')).toHaveCount(0);
  await expect(view.getByTestId('thumb')).toBeVisible();
  await shot(page, 'collapsed-none');
  await view.getByRole('button', { name: 'How to do Decline Bench Sit Up' }).tap();
  const sheet = page.getByTestId('exercise-sheet');
  await expect(sheet).toHaveAttribute('data-match', 'none');
  await expect(sheet.getByTestId('demo-soon')).toContainText('Demo coming soon');
  await expect(sheet.locator('img, picture')).toHaveCount(0);
  await expect(sheet.getByTestId('muscle-pair')).toHaveCount(0);
  await expect(sheet.getByTestId('muscle-map-empty')).toHaveCount(0);
  await expect(sheet.getByTestId('watch-out')).toHaveCount(0);
  await expect(sheet.getByTestId('good-for')).toHaveCount(0);
  await shot(page, 'sheet-none');
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the full screen demo shows the start photo still', async ({ page }) => {
    await openExercise(page, 'machine-lying-leg-curl');
    const viewer = await openViewer(page, 'Machine Lying Leg Curl');
    const end = viewer.locator('[data-frame="1"]');
    expect(await end.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await end.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    expect(await viewer.locator('[data-frame="0"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });
});
