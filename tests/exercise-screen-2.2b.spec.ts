import { expect, test, type Page } from './fixtures';
import { navIdle, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.2b: the exercise screen fills the screen, nothing hidden. Day 1 of the five day split:
// Barbell Back Squat (variant, demo, 4 sets), Machine Lying Leg Curl (exact, demo, 3 sets) and
// Decline Bench Sit Up (match none: no demo, no sure muscles).

const SHOTS = 'reports/shots/2.2b';
const device = () => test.info().project.name.replace(/ /g, '-');
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${device()}-${name}.png` });
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

/** Every set row and its ✓ is fully on screen without scrolling, above the space the rest bar uses. */
async function tableInFirstScreen(page: Page) {
  const view = page.getByRole('main');
  expect(await view.evaluate((el) => el.scrollTop)).toBe(0);
  const vh = page.viewportSize()!.height;
  const rest = await view.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--rest-height')) || 0);
  const bottom = vh - rest;
  const list = (await page.getByRole('list', { name: 'Sets' }).boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(bottom);
  const checks = page.getByRole('list', { name: 'Sets' }).locator('[data-testid="check-current"], [data-testid="check"]');
  const n = await checks.count();
  expect(n).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < n; i++) {
    const b = (await checks.nth(i).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(bottom);
  }
}

const noSideScroll = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.getByRole('main').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
};

test('demo exercise: hero on top, the whole table in the first screen, muscles and tips below', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'barbell-back-squat');
  const vh = page.viewportSize()!.height;

  // (a) The hero: on top, about 30% of the height (less on short phones), photos loaded.
  const hero = view.getByTestId('ex-hero');
  await expect(hero).toBeVisible();
  const hb = (await hero.boundingBox())!;
  expect(hb.height).toBeGreaterThanOrEqual(110);
  expect(hb.height).toBeLessThanOrEqual(vh * 0.34);
  await expect(hero.locator('img[alt$="start position"]')).toHaveJSProperty('complete', true);
  expect(await hero.locator('img[alt$="start position"]').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // It crossfades like a gif.
  const anim = await hero.locator('[data-frame="1"]').evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).not.toBe('none');
  // Name and set line sit on the hero's foot; the ⋯ is reachable there.
  const name = view.getByRole('heading', { name: 'Barbell Back Squat' });
  const nb = (await name.boundingBox())!;
  expect(nb.y).toBeGreaterThan(hb.y);
  expect(nb.y + nb.height).toBeLessThanOrEqual(hb.y + hb.height);
  await expect(view.getByTestId('set-target')).toHaveText(/^Set 1 of 4 · 8 to 12 reps$/);
  await expect(view.getByRole('button', { name: 'More for Barbell Back Squat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to the list' })).toBeVisible();

  // (b) The whole table is in the first screen; (d) no orange "Pick a weight" line, no cue line.
  await tableInFirstScreen(page);
  // Only for screen readers now: a 1 px clipped box, no orange line on screen.
  const status = (await view.getByTestId('set-status').boundingBox())!;
  expect(status.width * status.height).toBeLessThanOrEqual(1);
  await expect(view.getByTestId('cue-line')).toHaveCount(0);
  await expect(view.getByText('More', { exact: true })).toHaveCount(0);
  // First time: one quiet line inside the table area, on one line.
  const guide = view.getByTestId('set-guide').first();
  await expect(guide).toHaveText('First time: pick a weight you could do 2 more reps with');
  expect((await guide.boundingBox())!.height).toBeLessThanOrEqual(20);
  // The ✓ coach mark never covers the table header or the title.
  const coach = page.getByTestId('hint');
  if (await coach.count()) {
    const cb = (await coach.boundingBox())!;
    const headBottom = (await page.getByRole('list', { name: 'Sets' }).boundingBox())!.y;
    expect(cb.y).toBeGreaterThanOrEqual(headBottom);
  }
  await noSideScroll(page);
  await shot(page, 'demo');

  // The disabled ✓ is clearly quieter than an enabled one, drawn solid (not dashed).
  const circle = view.locator('[data-testid="check-current"] span').first();
  expect(Number(await circle.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.35);
  expect(await circle.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  // (2) A tap on a ✓ with no weight opens the picker for that row, saying why; nothing is logged.
  const blocked = view.getByTestId('check-blocked').nth(1);
  const bb = (await blocked.boundingBox())!;
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId('weight-sheet-sub')).toHaveText('Pick a weight first');
  await expect(picker).toContainText('Set 2');
  await page.waitForTimeout(350);
  await shot(page, 'blocked-tap');
  // Once a weight is chosen the normal sub line is back.
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await expect(picker.getByTestId('weight-sheet-sub')).toHaveText('This set and the ones below');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(view.getByTestId('set-row')).toHaveCount(0);

  // (c) Below the table: front and back side by side, the plain line, 2 or 3 tips.
  const card = view.getByTestId('muscle-card');
  await card.scrollIntoViewIfNeeded();
  const bodies = card.locator('svg[data-still]');
  await expect(bodies).toHaveCount(2);
  const [front, back] = [(await bodies.nth(0).boundingBox())!, (await bodies.nth(1).boundingBox())!];
  expect(Math.abs(front.y - back.y)).toBeLessThan(2);
  expect(back.x).toBeGreaterThan(front.x + front.width - 1);
  await expect(bodies.nth(0)).toHaveAttribute('data-view', 'front');
  await expect(bodies.nth(1)).toHaveAttribute('data-view', 'back');
  await expect(card.getByTestId('muscle-line')).toHaveText(/^Quads · /);
  const tips = view.getByTestId('form-tips').locator('li');
  const count = await tips.count();
  expect(count).toBeGreaterThanOrEqual(2);
  expect(count).toBeLessThanOrEqual(3);
  // (5) The variant caveat is a quiet note above the steps, not a step.
  await expect(view.getByTestId('variant-note')).toContainText('Plan uses a wide stance');
  await expect(tips.first()).not.toContainText('Plan uses');
  await noSideScroll(page);

  // (7) Scrolled: the hero folds into a compact title bar (name, set, ⋯), the picture faded out.
  await view.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(hero).toHaveAttribute('data-folded', 'true');
  await page.waitForTimeout(350);
  const after = (await hero.boundingBox())!;
  const mainTop = (await view.boundingBox())!.y;
  const barHeight = after.y + after.height - mainTop;
  expect(barHeight).toBeGreaterThan(40);
  expect(barHeight).toBeLessThanOrEqual(80);
  await expect(view.getByRole('button', { name: 'More for Barbell Back Squat' })).toBeInViewport();
  await expect(name).toBeInViewport();
  expect(Number(await hero.getByRole('button', { name: 'Show Barbell Back Squat full screen' }).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.05);
  // (9) The end of the page clears the rest bar's room.
  const rest = await view.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--rest-height')) || 0);
  const tipsBox = (await view.getByTestId('form-tips').boundingBox())!;
  expect(tipsBox.y + tipsBox.height).toBeLessThanOrEqual(page.viewportSize()!.height - rest);
  await shot(page, 'demo-scrolled');
  await view.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(hero).not.toHaveAttribute('data-folded');

  // (3) Tap the hero: a real full screen viewer, photo uncropped at full width, crossfade running.
  await hero.getByRole('button', { name: 'Show Barbell Back Squat full screen' }).tap();
  const viewer = page.getByTestId('demo-viewer');
  await expect(viewer).toBeVisible();
  await page.waitForTimeout(350);
  const vb = (await viewer.locator('[data-testid="demo-hero"]').boundingBox())!;
  expect(vb.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  expect(vb.width / vb.height).toBeCloseTo(1.5, 1);
  expect(await viewer.locator('[data-frame="1"]').evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
  await shot(page, 'viewer');
  await viewer.getByRole('button', { name: 'Close demo' }).tap();
  await expect(viewer).toHaveCount(0);
  // A tap anywhere closes it too.
  await hero.getByRole('button', { name: 'Show Barbell Back Squat full screen' }).tap();
  await expect(viewer).toBeVisible();
  await page.waitForTimeout(350);
  await page.touchscreen.tap(20, page.viewportSize()!.height / 2 + 200);
  await expect(viewer).toHaveCount(0);
  // Nothing is hidden behind a details sheet: watch out and good for are on the page.
  await expect(view.getByTestId('watch-out')).toBeVisible();
  await expect(view.getByTestId('good-for')).toBeVisible();
  await expect(view.getByTestId('muscle-body')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('swipe down closes the full screen demo', async ({ page }) => {
  const view = await openExercise(page, 'machine-lying-leg-curl');
  await view.getByRole('button', { name: 'Show Machine Lying Leg Curl full screen' }).tap();
  const viewer = page.getByTestId('demo-viewer');
  await expect(viewer).toBeVisible();
  await page.waitForTimeout(350);
  const b = (await viewer.locator('[data-testid="demo-hero"]').boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + i * 25);
  await page.mouse.up();
  await expect(viewer).toHaveCount(0);
});

test('three set exact match: the whole table and every ✓ fit too', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'machine-lying-leg-curl');
  await expect(view.getByTestId('ex-hero')).toBeVisible();
  await tableInFirstScreen(page);
  await expect(view.getByTestId('muscle-line')).toContainText('Hamstrings');
  await expect(view.getByTestId('form-tips').locator('li')).toHaveCount(3);
  await expect(view.getByTestId('variant-note')).toHaveCount(0);
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test('no demo: a compact header, no picture, no guessed muscles', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openExercise(page, 'decline-bench-sit-up');
  await expect(view.getByTestId('ex-hero')).toHaveCount(0);
  await expect(view.locator('img, picture')).toHaveCount(0);
  await expect(view.getByTestId('ex-head')).toBeVisible();
  await expect(view.getByRole('heading', { name: 'Decline Bench Sit Up' })).toBeVisible();
  await expect(view.getByRole('button', { name: 'More for Decline Bench Sit Up' })).toBeVisible();
  await expect(view.getByTestId('muscle-card')).toHaveCount(0);
  await expect(view.getByTestId('form-tips')).toHaveCount(0);
  await expect(view.getByTestId('muscle-map-empty')).toHaveCount(0);
  await tableInFirstScreen(page);
  await noSideScroll(page);
  // (1) "Just you" fits its cell, never cut off.
  const cells = view.getByTestId('weight-cell');
  await expect(cells.first()).toHaveText('Just you');
  for (let i = 0; i < (await cells.count()); i++) {
    expect(await cells.nth(i).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await cells.nth(i).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  }
  // Nothing sure to show: one small honest card, never a guessed step or muscle.
  await expect(view.getByTestId('no-demo')).toHaveText("Form guide coming soon. We only show form we're sure of.");
  // The ✓ coach mark hangs under the rows: never over a number or a column header.
  const coach = page.getByTestId('hint');
  await expect(coach).toBeVisible();
  const rowsBox = (await page.getByRole('list', { name: 'Sets' }).boundingBox())!;
  const cbox = (await coach.boundingBox())!;
  expect(cbox.y).toBeGreaterThanOrEqual(rowsBox.y + rowsBox.height);
  // In the flow: it pushes "+ Add set" down, never covers it or the first time line.
  const add = (await view.getByRole('button', { name: '+ Add set' }).boundingBox())!;
  expect(add.y).toBeGreaterThanOrEqual(cbox.y + cbox.height - 1);
  const firstTime = (await view.getByTestId('set-guide').first().boundingBox())!;
  expect(cbox.y).toBeGreaterThanOrEqual(firstTime.y + firstTime.height - 1);
  await shot(page, 'no-demo');
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the hero shows the start photo still', async ({ page }) => {
    const view = await openExercise(page, 'machine-lying-leg-curl');
    const hero = view.getByTestId('ex-hero');
    const end = hero.locator('[data-frame="1"]');
    expect(await end.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await end.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    expect(await hero.locator('[data-frame="0"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await shot(page, 'reduced');
  });
});

test('320 wide: nothing sideways', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone SE', 'one width floor run is enough');
  await page.setViewportSize({ width: 320, height: 568 });
  const view = await openExercise(page, 'barbell-back-squat');
  await expect(view.getByTestId('ex-hero')).toBeVisible();
  await noSideScroll(page);
  await view.getByTestId('form-tips').scrollIntoViewIfNeeded();
  await noSideScroll(page);
  await shot(page, '320-scrolled');
});

test('320 wide: "Just you" still fits', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone SE', 'one width floor run is enough');
  await page.setViewportSize({ width: 320, height: 568 });
  const view = await openExercise(page, 'decline-bench-sit-up');
  const cell = view.getByTestId('weight-cell').first();
  await expect(cell).toHaveText('Just you');
  expect(await cell.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  expect(await cell.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  await noSideScroll(page);
  await shot(page, '320-no-demo');
});
