import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { dbAll, navIdle, usePlan, watchErrors } from './workout-helpers';
import { exercisesForRegion, type NamedCatalogMuscles } from '../src/lib/muscleExercises';
import type { MuscleOverrides } from '../src/lib/muscles';

// PLAN 2.2c: tap a muscle on the map, see the catalog exercises that work it as primary, open one.
// Day 1 of the five day split starts on Barbell Back Squat (variant of Barbell_Squat, quads primary).

const json = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')) as T;
const CATALOG = json<{ exercises: NamedCatalogMuscles[] }>('data/catalog.json').exercises;
const OVERRIDES = json<MuscleOverrides>('data/muscle-overrides.json');
const expected = (region: Parameters<typeof exercisesForRegion>[0]) => exercisesForRegion(region, CATALOG, OVERRIDES);
// Day 1's exact or variant quad exercises (data/exercise-map.json); the plan's other days add more.
const DAY1_QUADS = ['Barbell Squat', 'Leg Extensions', 'Leg Press'];
const az = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

const device = () => test.info().project.name.replace(/ /g, '-');
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `reports/shots/2.2c/${name}-${device()}.png` });
};

async function openSquat(page: Page) {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view).toBeVisible();
  await page.waitForTimeout(400); // past the arrival guard
  await navIdle(page);
  const card = view.getByTestId('muscle-card');
  await card.scrollIntoViewIfNeeded();
  return { view, card };
}

const noSideScroll = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
};

/** Every element of the box sits inside the screen's width. */
const insideWidth = async (page: Page, selector: string) => {
  const over = await page.evaluate((sel) => {
    const w = document.documentElement.clientWidth;
    const root = document.querySelector(sel);
    if (!root) return ['missing'];
    return Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -0.5 || r.right > w + 0.5);
      })
      .map((el) => `${el.tagName}.${el.className}`);
  }, selector);
  expect(over).toEqual([]);
};

test('workout: tap quads, the list of quad exercises opens, one opens its sheet, Back and Close return, nothing logged @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const { view, card } = await openSquat(page);
  const setsBefore = await dbAll(page, 'sets');
  const sessionsBefore = await dbAll(page, 'sessions');

  const pick = card.getByTestId('muscle-pick');
  await expect(pick).toHaveText('Tap a muscle to see its exercises');
  await expect(card.getByTestId('muscle-exercises-link')).toHaveCount(0);
  // The tap lands on the drawing's quads (front body).
  await card.locator('svg[data-view="front"] [data-region="quadriceps"]').first().tap();
  await expect(pick).toHaveText('Quads · primary');
  const quads = expected('quadriceps');
  expect(quads.length).toBeGreaterThan(3);
  const link = card.getByRole('button', { name: `${quads.length} exercises for Quads` });
  await expect(link).toHaveText(`${quads.length} exercises`);
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await noSideScroll(page);
  await shot(page, 'card-picked');

  await link.tap();
  const list = page.getByRole('dialog', { name: 'Quads exercises' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Quads' })).toBeVisible();
  const rows = list.getByTestId('muscle-exercise');
  await expect(rows).toHaveCount(quads.length);
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  // Exactly the catalog exercises with quads as a primary muscle: nothing more, nothing less.
  expect([...ids].sort()).toEqual(quads.map((q) => q.id).sort());
  for (const id of ids) expect(CATALOG.find((e) => e.id === id)!.primaryMuscles).toContain('quadriceps');
  // The plan's exercises first (marked "In your plan"), then A to Z.
  const names = await rows.evaluateAll((els) => els.map((e) => e.querySelector('[class*="name"]')!.textContent!));
  const marked = await rows.evaluateAll((els) => els.map((e) => (e.textContent ?? '').includes('In your plan')));
  const nPlan = marked.indexOf(false);
  expect(nPlan).toBeGreaterThanOrEqual(DAY1_QUADS.length);
  expect(marked.slice(nPlan).every((m) => !m)).toBe(true);
  const planned = names.slice(0, nPlan);
  for (const n of DAY1_QUADS) expect(planned).toContain(n);
  expect(planned).toEqual(az(planned));
  expect(names.slice(nPlan)).toEqual(az(names.slice(nPlan)));
  // Each row: 44 pt or taller, its own photo (loaded), a one line "also works".
  for (let i = 0; i < Math.min(4, quads.length); i++) expect((await rows.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const squat = list.locator('[data-id="Barbell_Squat"]');
  const img = squat.locator('img');
  await expect(img).toHaveAttribute('src', /ex\/Barbell_Squat\/0\.jpg$/);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  const also = quads.find((q) => q.id === 'Barbell_Squat')!.also!;
  await expect(squat).toContainText(also);
  await page.waitForTimeout(300);
  await insideWidth(page, '[data-testid="muscle-exercises"]');
  await shot(page, 'list');

  // Open one: the exercise sheet on top, with a Back to the list.
  const target = quads.find((q) => q.id === 'Leg_Extensions')!;
  await list.locator(`[data-id="${target.id}"]`).tap();
  const sheet = page.getByRole('dialog', { name: `How to do ${target.name}` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: target.name })).toBeVisible();
  await expect(sheet.getByTestId('exercise-sheet')).toHaveAttribute('data-match', 'exact');
  await expect(sheet.getByTestId('muscle-line')).toContainText('Quads');
  await page.waitForTimeout(300);
  await shot(page, 'exercise-sheet');
  await sheet.getByRole('button', { name: 'Back to Quads exercises' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(list).toBeVisible();
  await expect(rows).toHaveCount(quads.length);

  // Close the list: back on the workout, exactly as it was.
  await page.waitForTimeout(300);
  await list.getByRole('button', { name: 'Close', exact: true }).first().tap();
  await expect(list).toHaveCount(0);
  await expect(view).toBeVisible();
  await expect(view.getByTestId('set-row')).toHaveCount(0);
  await expect(view.getByTestId('set-target')).toHaveText(/^Set 1 of 4/);
  expect(await dbAll(page, 'sets')).toEqual(setsBefore);
  expect(await dbAll(page, 'sessions')).toEqual(sessionsBefore);
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test('workout: a muscle with no catalog exercise says so honestly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const { card } = await openSquat(page);
  expect(expected('forearm')).toEqual([]);
  await card.locator('svg[data-view="front"] [data-region="forearm"]').first().tap();
  await expect(card.getByTestId('muscle-pick')).toHaveText('Forearms · not used here');
  await card.getByRole('button', { name: 'Exercises for Forearms' }).tap();
  const list = page.getByRole('dialog', { name: 'Forearms exercises' });
  await expect(list).toBeVisible();
  await expect(list.getByTestId('muscle-exercises-empty')).toHaveText('No exercises for this muscle yet');
  await expect(list.getByTestId('muscle-exercise')).toHaveCount(0);
  await expect(list.locator('img')).toHaveCount(0);
  await shot(page, 'empty');
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('muscle preview: tap chest, the presses are listed and open their sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?dev#/dev/muscles');
  const map = page.getByTestId('muscle-map');
  await map.locator('svg[data-view="front"] [data-region="chest"]').first().click();
  await expect(page.getByTestId('muscle-pick')).toHaveText('Upper chest · primary');
  const chest = expected('chest');
  await map.getByRole('button', { name: `${chest.length} exercises for Chest` }).click();
  const list = page.getByRole('dialog', { name: 'Chest exercises' });
  await expect(list.getByTestId('muscle-exercise')).toHaveCount(chest.length);
  await list.locator('[data-id="Barbell_Incline_Bench_Press_-_Medium_Grip"]').click();
  const sheet = page.getByRole('dialog', { name: /^How to do Barbell Incline Bench Press/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Back to Chest exercises' }).click();
  await expect(list).toBeVisible();
  expect(errors).toEqual([]);
});

test('SE and 320 wide, text at 130%: card, list and sheet stay inside the screen @matrix', async ({ page }) => {
  const name = test.info().project.name;
  test.skip(name !== 'iPhone SE' && name !== '320 floor', 'the small screens');
  const { card } = await openSquat(page);
  // Scale every text size by 1.3 (like the phone's larger text setting).
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
    for (const { el, size } of sizes) el.style.fontSize = `${size * 1.3}px`;
  });
  await card.locator('svg[data-view="front"] [data-region="quadriceps"]').first().tap();
  const link = card.getByTestId('muscle-exercises-link');
  await expect(link).toBeVisible();
  await insideWidth(page, '[data-testid="muscle-card"]');
  // The readout never overflows its reserved row.
  const row = (await card.getByTestId('muscle-pick').boundingBox())!;
  expect(row.height).toBeLessThanOrEqual(45);
  await noSideScroll(page);
  await shot(page, 'card-130');
  await link.tap();
  const list = page.getByRole('dialog', { name: 'Quads exercises' });
  await expect(list).toBeVisible();
  await page.waitForTimeout(300);
  await insideWidth(page, '[data-testid="muscle-exercises"]');
  await noSideScroll(page);
  await shot(page, 'list-130');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the list and the sheet open and close without errors', async ({ page }) => {
    const errors = watchErrors(page);
    const { card } = await openSquat(page);
    await card.locator('svg[data-view="back"] [data-region="hamstring"]').first().tap();
    await expect(card.getByTestId('muscle-pick')).toHaveText('Hamstrings · secondary');
    const n = expected('hamstring').length;
    await card.getByRole('button', { name: `${n} exercises for Hamstrings` }).tap();
    const list = page.getByRole('dialog', { name: 'Hamstrings exercises' });
    await expect(list.getByTestId('muscle-exercise')).toHaveCount(n);
    await list.getByTestId('muscle-exercise').first().tap();
    const sheet = page.getByRole('dialog', { name: /^How to do / });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Back to Hamstrings exercises' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(list).toBeVisible();
    await shot(page, 'reduced-list');
    expect(errors).toEqual([]);
  });
});

// Gate s2 (Codex 2.2c review, SPEC 13.3): the drawing is tap only, so VoiceOver and keyboards pick a
// lit muscle from a labelled native picker wired to the same pick, then reach its exercises link.
test('workout: the lit muscles are also a labelled picker for VoiceOver and keyboards @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const { card } = await openSquat(page);
  const picker = card.getByRole('combobox', { name: 'Pick a muscle to see its exercises' });
  await expect(picker).toHaveCount(1);
  const options = await picker.locator('option').allTextContents();
  expect(options[0]).toBe('No muscle picked');
  expect(options[1]).toMatch(/· primary$/);
  // Invisible to a finger: the drawing keeps every tap.
  expect(await picker.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await picker.selectOption('quadriceps');
  await expect(card.getByTestId('muscle-pick')).toHaveText(/· primary$/);
  const link = card.getByTestId('muscle-exercises-link');
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('muscle-exercises')).toBeVisible();
  await expect(page.getByTestId('muscle-exercises')).toHaveAttribute('data-region', 'quadriceps');
  // The drawn pick and the picker agree.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('muscle-exercises')).toHaveCount(0);
  await expect(picker).toHaveValue('quadriceps');
  expect(errors).toEqual([]);
});

// PLAN 2.0j: the picker lists every drawn muscle, lit or not, and the Abs list shows no photo for
// exercises the 2.5 audit rejected (Plank), while a kept one keeps its photo.
test('workout: an unlit muscle is selectable without tapping, and Abs lists Plank without a photo @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const { view, card } = await openSquat(page);
  const picker = card.getByRole('combobox', { name: 'Pick a muscle to see its exercises' });
  await expect(picker.locator('option[value="forearm"]')).toHaveCount(1);
  await picker.selectOption('forearm');
  await expect(card.getByTestId('muscle-pick')).toHaveText(/^Forearms · /);
  await picker.selectOption('abs');
  const link = card.getByTestId('muscle-exercises-link');
  await link.focus();
  await page.keyboard.press('Enter');
  const list = page.getByTestId('muscle-exercises');
  await expect(list).toBeVisible();
  const plank = list.locator('[data-id="Plank"]');
  await expect(plank).toHaveCount(1);
  await expect(plank.locator('img')).toHaveCount(0);
  await expect(list.locator('[data-id="Crunches"] img')).toHaveCount(1);
  // A rejected exercise still opens its sheet, with no photos.
  await plank.tap();
  const sheet = page.getByRole('dialog', { name: 'How to do Plank' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(view.getByTestId('set-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});
