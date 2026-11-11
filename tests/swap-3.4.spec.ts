// PLAN 3.4 (SPEC 7.2, 7.5, 21.1): swap with Undo, always use, auto swap in a hotel gym, nothing fits,
// SE and 320 fit, 130% text, no console errors.
import { expect, test, type Locator, type Page } from './fixtures';
import { checkControls, checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { dbAll, dbPut, exerciseView, loggedRows, shotOn, usePlan, watchErrors } from './workout-helpers';

type Sess = { id: string; exerciseIds: string[]; swaps?: Array<{ slot: string; current: string; kept?: string[]; noFit?: boolean }>; endedAt?: number };

/** The active gym becomes a hotel gym (SPEC 3 preset), or `equipment` if given. */
const hotelGym = async (page: Page, equipment = ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike']) => {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, type: 'hotel', equipment, dumbbellRange: { min: 5, max: 50, step: 5 } }] });
};

const start = async (page: Page) => {
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
};

const session = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined)!;

/** Text at 130% (SPEC 13.4), the way text-130-1.7e.spec.ts scales it: every computed size × 1.3, once per element. */
const text130 = (page: Page, scope: string) =>
  page.evaluate((root) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`${root}, ${root} *`));
    const sizes = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);

/** 3.5f: Replace opens as a swipe deck (one option per card); "Show all" lists the options as before. One option is a row straight away. */
const showAll = async (sheet: Locator) => {
  await expect(sheet.getByTestId('swap-sheet')).toBeVisible();
  if ((await sheet.getByTestId('swap-sheet').getAttribute('data-mode')) === 'deck') await sheet.getByTestId('swap-all').tap();
};

const openReplace = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `More for ${name}` }).tap();
  await page.getByTestId('replace-row').tap();
  const sheet = page.getByRole('dialog', { name: `Replace ${name}` });
  await expect(sheet).toBeVisible();
  await showAll(sheet);
  return sheet;
};

test('Replace comes first in the ⋯ menu; one tap swaps for this workout; Undo puts it back @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  const before = (await session(page)).exerciseIds;
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(exerciseView(page, 'barbell-back-squat')).toBeVisible();

  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  const menu = page.getByRole('dialog', { name: 'Barbell Back Squat options' });
  await expect(menu.locator('button').first()).toHaveText('Replace');
  await shotOn(page, '3.4', 'menu');
  await menu.getByTestId('replace-row').tap();

  const sheet = page.getByRole('dialog', { name: 'Replace Barbell Back Squat' });
  await expect(sheet.getByText('For this workout only')).toBeVisible();
  await showAll(sheet);
  // SPEC 7.2: each with its reason. 3.5f: up to 6 at once in the list (the deck shows them one by one).
  const choices = sheet.locator('[data-testid^="swap-choice-"]');
  await expect(choices).toHaveCount(6);
  await expect(sheet.getByTestId('swap-choice-front-squat')).toContainText('Same movement · uses a barbell');
  // A demo photo only for a sure match (SPEC 4.3): Front Squat has one, Smith Machine Squat has none.
  await expect(sheet.getByTestId('swap-choice-Smith_Machine_Squat').locator('[data-photo]')).toHaveCount(0);
  await shotOn(page, '3.4', 'sheet');

  await sheet.getByTestId('swap-choice-Smith_Machine_Squat').tap();
  await expect(sheet).toHaveCount(0);
  const view = exerciseView(page, 'Smith_Machine_Squat');
  await expect(view).toBeVisible();
  await expect(view.getByRole('heading', { name: 'Smith Machine Squat' })).toBeVisible();
  // The slot's targets, and no weight from the other exercise: the row says Pick.
  await expect(view.getByTestId('set-target')).toContainText('of 4 · 8 to 12 reps');
  await expect(view.getByText('Pick', { exact: true }).first()).toBeVisible();
  expect((await session(page)).exerciseIds).toContain('Smith_Machine_Squat');
  // The plan file is not touched: nothing was saved as the plan's pick.
  expect((await dbAll<{ alwaysUse?: unknown }>(page, 'exerciseSettings')).some((x) => x.alwaysUse)).toBe(false);

  const toast = page.getByRole('button', { name: 'Undo' });
  await expect(toast).toBeVisible();
  await shotOn(page, '3.4', 'swapped');
  await toast.tap();
  await expect(exerciseView(page, 'barbell-back-squat')).toBeVisible();
  await expect.poll(async () => (await session(page)).exerciseIds).toEqual(before);
  expect((await session(page)).swaps).toBeUndefined();
  expect(errors).toEqual([]);
});

test('logged sets stay under the original; the rest of its rows move to the replacement; Finish lists both @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await dbPut(page, { sets: [{ id: 'kept-1', sessionId: (await session(page)).id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', uncertain: false, reps: 10, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } }] });
  await page.reload();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await expect(loggedRows(view)).toHaveCount(1);
  const sheet = await openReplace(page, 'Barbell Back Squat');
  await sheet.getByTestId('swap-choice-Smith_Machine_Squat').tap();
  const next = exerciseView(page, 'Smith_Machine_Squat');
  await expect(next).toBeVisible();
  await expect(next.getByTestId('set-target')).toContainText('of 3');
  await page.getByRole('button', { name: 'Back to the list' }).tap();

  // Both rows, the original's set where it was.
  await expect(page.getByTestId('row-barbell-back-squat')).toContainText('1 set');
  await expect(page.getByTestId('row-Smith_Machine_Squat')).toContainText('3 sets');
  await expect(page.getByTestId('swap-line-Smith_Machine_Squat')).toContainText('Swapped: your pick today');
  const saved = (await dbAll<{ id: string; exerciseId: string; reps: number }>(page, 'sets')).find((s) => s.id === 'kept-1')!;
  expect(saved).toMatchObject({ exerciseId: 'barbell-back-squat', reps: 10 });

  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-exercise')).toHaveCount(1);
  await expect(page.getByTestId('finish-exercise')).toContainText('Barbell Back Squat');
  expect(errors).toEqual([]);
});

test('Always use this: the next workout starts with the pick, the plan stays, Stop brings the plan back @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const sheet = await openReplace(page, 'Barbell Back Squat');
  await sheet.getByText('Always use this').tap();
  await expect(sheet.getByText('From now on in this plan')).toBeVisible();
  await sheet.getByTestId('swap-choice-Smith_Machine_Squat').tap();
  await expect(exerciseView(page, 'Smith_Machine_Squat')).toBeVisible();
  await expect
    .poll(async () => (await dbAll<{ exerciseId: string; alwaysUse?: Record<string, string> }>(page, 'exerciseSettings')).find((x) => x.alwaysUse)?.alwaysUse)
    .toEqual({ 'five-day-split': 'Smith_Machine_Squat' });
  await dbPut(page, { sets: [{ id: 'x1', sessionId: (await session(page)).id, exerciseId: 'Smith_Machine_Squat', order: 0, kind: 'work', uncertain: false, reps: 10, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45], barId: 'smith' } }] });
  await page.reload();
  await expect(exerciseView(page, 'Smith_Machine_Squat')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);

  // Below 60%, so the same day is up next, with the pick.
  await start(page);
  await expect(page.getByTestId('row-Smith_Machine_Squat')).toBeVisible();
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveCount(0);
  await expect(page.getByTestId('swap-line-Smith_Machine_Squat')).toContainText('Swapped: your pick for this plan');

  // Stop: this workout stays, the next one is the plan's.
  await page.getByTestId('swap-line-Smith_Machine_Squat').getByRole('button', { name: /^Change/ }).tap();
  const again = page.getByRole('dialog', { name: 'Replace Smith Machine Squat' });
  await again.getByTestId('swap-stop-always').tap();
  await expect.poll(async () => (await dbAll<{ alwaysUse?: unknown }>(page, 'exerciseSettings')).some((x) => x.alwaysUse)).toBe(false);
  await expect(page.getByTestId('row-Smith_Machine_Squat')).toBeVisible();
  expect(errors).toEqual([]);
});

test('auto swap in a hotel gym: the quiet line, change it, restore it, Undo, a reload keeps it @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await hotelGym(page, ['dumbbells', 'adjustable_bench', 'cable_station', 'kettlebells']);
  await start(page);

  await expect(page.getByTestId('row-barbell-back-squat')).toHaveCount(0);
  const row = page.getByTestId('row-Dumbbell_Squat');
  await expect(row).toContainText('Dumbbell Squat');
  await expect(row).toContainText('4 sets × 8 to 12');
  const line = page.getByTestId('swap-line-Dumbbell_Squat');
  await expect(line).toContainText('Swapped: no barbell here');
  await shotOn(page, '3.4', 'hotel-day');
  await checkLayout(page);
  await checkControls(page);

  // One tap to change.
  await line.getByRole('button', { name: /^Change/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Replace Dumbbell Squat' });
  await expect(sheet.getByTestId('swap-restore')).toContainText('Barbell Back Squat');
  await expect(sheet.getByTestId('swap-choice-Bodyweight_Squat')).toContainText('No barbell here · just your body');
  await expect(sheet.getByTestId('swap-choice-Smith_Machine_Squat')).toHaveCount(0);
  await sheet.getByTestId('swap-choice-Bodyweight_Squat').tap();
  await expect(page.getByTestId('row-Bodyweight_Squat')).toBeVisible();
  await expect(page.getByTestId('swap-line-Bodyweight_Squat')).toContainText('Swapped: no barbell here');

  // One tap to restore: the plan's exercise, with Undo.
  await page.getByTestId('swap-line-Bodyweight_Squat').getByRole('button', { name: /^Restore/ }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await expect(page.getByTestId('swap-line-barbell-back-squat')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(1); // the last toast has faded
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('row-Bodyweight_Squat')).toBeVisible();

  // A reload keeps it all: the swap is stored, never worked out again.
  await page.reload();
  await expect(page.getByTestId('row-Bodyweight_Squat')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Last time and the next target follow the exercise really performed, never the plan one @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await hotelGym(page);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const past = Date.now() - 2 * 86_400_000;
  await dbPut(page, {
    sessions: [{ id: 'past', gymId: gym.id, startedAt: past, endedAt: past + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat', 'Dumbbell_Squat'] }],
    sets: [
      { id: 'p1', sessionId: 'past', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', uncertain: false, reps: 8, load: { kind: 'barbell', unit: 'lb', total: 405, barWeight: 45, perSide: [45, 45, 45, 45] } },
      { id: 'p2', sessionId: 'past', exerciseId: 'Dumbbell_Squat', order: 1, kind: 'work', uncertain: false, reps: 9, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 } },
    ],
  });
  await start(page);
  await page.getByTestId('row-Dumbbell_Squat').tap();
  const view = exerciseView(page, 'Dumbbell_Squat');
  await expect(view).toBeVisible();
  // Its own 30 lb dumbbells, nothing from the 405 lb squat.
  await expect(view).toContainText('30');
  await expect(view).toContainText('9');
  await expect(view).not.toContainText('405');
  expect(errors).toEqual([]);
});

test('nothing fits: the row says so, stays skippable, is never up next, Replace offers no guess @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  // Day 1 has a leg curl machine: the hotel has none, and no other hamstring move needs less.
  await hotelGym(page);
  await start(page);
  const s = await session(page);
  const stuck = s.swaps?.find((x) => x.noFit);
  expect(stuck, 'day 1 at a hotel has something nothing fits').toBeTruthy();
  const id = stuck!.slot;
  const line = page.getByTestId(`swap-line-${id}`);
  await expect(line).toContainText(/^Nothing fits: no .+ here\. Skip it\.$/);
  await expect(line.getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId(`row-${id}`)).toHaveAttribute('data-skip', 'true');
  await expect(page.getByTestId(`row-${id}`)).not.toHaveAttribute('aria-current', 'step');
  await line.scrollIntoViewIfNeeded();
  await shotOn(page, '3.4', 'nothing-fits');

  // Replace on it says so too, and offers no guess.
  await page.getByTestId(`row-${id}`).tap();
  await expect(exerciseView(page, id)).toBeVisible();
  const name = (await exerciseView(page, id).getByRole('heading').first().innerText()).trim();
  const sheet = await openReplace(page, name);
  await expect(sheet.getByTestId('swap-empty')).toContainText('Nothing else fits this gym');
  await expect(sheet.locator('[data-testid^="swap-choice-"]')).toHaveCount(0);
  await shotOn(page, '3.4', 'empty-sheet');
  await sheet.getByRole('button', { name: 'Keep it' }).tap();
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a hold swaps only for a hold, and an exercise in no ladder says it has no sure swap', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-static-quadricep-stretch').tap();
  const sheet = await openReplace(page, 'Static Quadricep Stretch');
  await expect(sheet.getByTestId('swap-empty')).toContainText('No sure swap for this one');
  expect(errors).toEqual([]);
});

test('the sheet and the day list fit SE and the 320 floor, at normal and 130% text, with a long reason @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await hotelGym(page);
  await start(page);
  for (const big of [false, true]) {
    if (big) await text130(page, 'main');
    const line = page.getByTestId('swap-line-Dumbbell_Squat');
    await line.scrollIntoViewIfNeeded();
    await checkLayout(page);
    expect(await fullyShown(line.getByText('Swapped: no barbell here'))).toBe(true);
    await line.getByRole('button', { name: /^Change/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Replace Dumbbell Squat' });
    await expect(sheet).toBeVisible();
    if (big) await text130(page, '[role="dialog"]');
    await checkLayout(page, { scope: '[role="dialog"]' });
    await checkControls(page, '[role="dialog"]');
    for (const c of await sheet.locator('[data-testid^="swap-choice-"] span span').all()) expect(await fullyShown(c)).toBe(true);
    await shotOn(page, '3.4', big ? 'sheet-130' : 'sheet-hotel', ['iPhone SE', 'iPhone 17 Pro Max', '320 floor']);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('double tap on a choice swaps once', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const sheet = await openReplace(page, 'Barbell Back Squat');
  const c = sheet.getByTestId('swap-choice-Smith_Machine_Squat');
  await c.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
  await expect(exerciseView(page, 'Smith_Machine_Squat')).toBeVisible();
  const s = await session(page);
  expect(s.swaps).toEqual([{ slot: 'barbell-back-squat', current: 'Smith_Machine_Squat' }]);
  expect(s.exerciseIds.filter((x) => x === 'Smith_Machine_Squat')).toHaveLength(1);
  expect(errors).toEqual([]);
});
