import { expect, test, type Page } from './fixtures';
import { navIdle, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.3: the exercise sheet (SPEC 4.4) and its collapsed block in the workout (SPEC 13.5).
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

/** The set table's rows and their ✓ sit fully on screen, the main area does not scroll (SPEC 13.5). */
async function tableOnScreen(page: Page) {
  const vh = page.viewportSize()!.height;
  await expect(page.getByTestId('check-current')).toBeVisible();
  const list = (await page.getByRole('list', { name: 'Sets' }).boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(vh);
  const main = page.getByRole('main');
  expect(await main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
}

test('variant: collapsed block shows the photo tile and the map cue, More opens the full sheet', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'barbell-back-squat');
  const tile = view.getByTestId('demo-tile');
  await expect(tile).toBeVisible();
  await expect(tile.locator('source[type="image/webp"]')).toHaveCount(2);
  await expect(tile.locator('img')).toHaveCount(2);
  const line = view.getByTestId('cue-line');
  await expect(line).toContainText('Plan uses a wide stance');
  await expect(line).toContainText('More');
  // One line only: never wraps onto a second line.
  expect((await line.boundingBox())!.height).toBeLessThanOrEqual(20);
  await tableOnScreen(page);
  await shot(page, 'collapsed-variant');

  await line.tap();
  const sheet = page.getByTestId('exercise-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-match', 'variant');
  await expect(sheet.getByTestId('form-demo')).toBeVisible();
  await expect(sheet.getByTestId('demo-dots')).toContainText('1 / 2');
  await expect(sheet.getByTestId('muscle-map')).toBeVisible();
  const cues = sheet.getByTestId('cues').locator('li');
  await expect(cues.first()).toContainText('Plan uses a wide stance');
  expect(await cues.count()).toBeGreaterThanOrEqual(2);
  expect(await cues.count()).toBeLessThanOrEqual(4); // the variant note plus up to 3 cues
  await expect(sheet.getByTestId('watch-out')).toBeVisible();
  await expect(sheet.getByTestId('good-for')).toBeVisible();
  // Images load from the app's own files, lazily, inside a fixed box.
  const img = sheet.locator('img').first();
  await expect(img).toHaveAttribute('loading', 'lazy');
  await expect(img).toHaveAttribute('src', /ex\/Barbell_Squat\/0\.jpg$/);
  const stage = sheet.getByRole('button', { name: 'Pause demo' });
  const before = (await stage.boundingBox())!;
  expect(before.width / before.height).toBeCloseTo(1.5, 1);
  await shot(page, 'sheet-variant');

  // Tap to pause: the crossfade stops, tap again plays.
  await stage.tap();
  await expect(sheet.getByRole('button', { name: 'Play demo' })).toHaveAttribute('aria-pressed', 'true');
  const state = await sheet.locator('[data-frame="1"]').first().evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(state).toBe('paused');
  await sheet.getByRole('button', { name: 'Play demo' }).tap();
  await expect(sheet.getByRole('button', { name: 'Pause demo' })).toBeVisible();
  // Same box after the press settles (scale 0.97 while pressed): nothing shifts.
  await expect.poll(async () => Math.round((await sheet.getByRole('button', { name: 'Pause demo' }).boundingBox())!.height)).toBe(Math.round(before.height));
  expect(errors).toEqual([]);
});

test('the crossfade timing is 1.2 s, 0.35 s, 1.2 s', async ({ page }) => {
  await openExercise(page, 'machine-lying-leg-curl');
  await page.getByTestId('cue-line').tap();
  const end = page.getByTestId('exercise-sheet').locator('[data-frame="1"]');
  const anim = await end.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { duration: cs.animationDuration, timing: cs.animationTimingFunction, count: cs.animationIterationCount };
  });
  expect(anim).toEqual({ duration: '3.1s', timing: 'ease-in-out', count: 'infinite' });
});

test('exact: full sheet with demo, muscles, cues and good for', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'machine-lying-leg-curl');
  await expect(view.getByTestId('demo-tile')).toBeVisible();
  await expect(view.getByTestId('cue-line')).toContainText('Lie face down');
  await tableOnScreen(page);
  await shot(page, 'collapsed-exact');
  // The demo tile itself also opens the sheet.
  await view.getByRole('button', { name: 'How to do Machine Lying Leg Curl' }).tap();
  const sheet = page.getByTestId('exercise-sheet');
  await expect(sheet).toHaveAttribute('data-match', 'exact');
  await expect(sheet.getByTestId('form-demo')).toBeVisible();
  await expect(sheet.getByTestId('muscle-text')).toContainText('Hamstrings');
  await expect(sheet.getByTestId('cues').locator('li')).toHaveCount(3);
  await expect(sheet.getByTestId('good-for')).toContainText('hamstrings');
  await shot(page, 'sheet-exact');
  await sheet.getByRole('button', { name: 'Close', exact: true }).first().tap();
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('match none: "Demo coming soon", no photos, no muscle map, no cue line', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'decline-bench-sit-up');
  await expect(view.getByTestId('demo-tile')).toHaveCount(0);
  await expect(view.getByTestId('cue-line')).toHaveCount(0);
  await expect(view.getByTestId('thumb')).toBeVisible();
  await shot(page, 'collapsed-none');
  await view.getByRole('button', { name: 'How to do Decline Bench Sit Up' }).tap();
  const sheet = page.getByTestId('exercise-sheet');
  await expect(sheet).toHaveAttribute('data-match', 'none');
  await expect(sheet.getByTestId('demo-soon')).toContainText('Demo coming soon');
  await expect(sheet.locator('img, picture')).toHaveCount(0);
  await expect(sheet.getByTestId('muscle-map')).toHaveCount(0);
  await expect(sheet.getByTestId('muscle-map-empty')).toHaveCount(0);
  await expect(sheet.getByTestId('watch-out')).toHaveCount(0);
  await expect(sheet.getByTestId('good-for')).toHaveCount(0);
  await shot(page, 'sheet-none');
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('shows the two photos side by side, still', async ({ page }) => {
    await openExercise(page, 'machine-lying-leg-curl');
    await page.getByTestId('cue-line').tap();
    const sheet = page.getByTestId('exercise-sheet');
    const a = (await sheet.locator('[data-frame="0"]').boundingBox())!;
    const b = (await sheet.locator('[data-frame="1"]').boundingBox())!;
    expect(b.x).toBeGreaterThan(a.x + a.width - 4);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(await sheet.locator('[data-frame="1"]').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await sheet.locator('[data-frame="1"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });
});
