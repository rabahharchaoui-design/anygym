import { expect, test, type Locator, type Page } from './fixtures';
import { bar185, dbAll, seedFinished, usePlan, watchErrors } from './workout-helpers';

// SPEC 20.4: tap count tests the way G uses the app. Every page tap goes through `tap`, which
// counts it; the test fails if the flow takes more taps than the spec allows.
//   1. Today with a plan → Start → Barbell Back Squat → 4 checks: at most 6 taps.
//   2. Change the weight of one set on a barbell lift: at most 3 extra taps
//      (weight cell → one plate → Done).
//   3. Quick workout, one exercise, 3 sets logged: at most 7 taps including search
//      (Quick workout → search field → result → Add 1 → 3 checks; adding one exercise opens it).
//   3b. The same with no history at all: the first weight is never invented, so it is picked once
//      (weight cell → one plate → Done): at most 10 taps. Documented, honest by design (SPEC 0).

const counter = () => {
  let n = 0;
  return {
    tap: async (l: Locator) => {
      await l.tap();
      n++;
    },
    get count() {
      return n;
    },
  };
};

// Last time: 4 sets of 10 × 185 (plan range 8 to 12) → today's targets are already filled in.
const seedSquat = (page: Page) => seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });

test('1. start today\'s plan day and log all 4 squat sets at target in at most 6 taps @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  const t = counter();

  await t.tap(page.getByRole('button', { name: 'Start', exact: true }));
  await t.tap(page.getByTestId('row-barbell-back-squat'));
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('set-guide')).toContainText('Last time 10 × 185 · 10 × 185 · 10 × 185 · 10 × 185 lb');
  for (let i = 0; i < 4; i++) {
    await t.tap(view.getByTestId('check-current'));
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  expect(t.count).toBeLessThanOrEqual(6);
  const sets = await dbAll<{ id: string; order: number; reps: number; load: { total: number } }>(page, 'sets');
  const today = sets.filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
  expect(today).toHaveLength(4);
  expect(today.map((s) => s.load.total)).toEqual([185, 185, 185, 185]);
  expect(today.map((s) => s.reps)).toEqual([11, 10, 10, 10]);
  // After the last set: "Nice. Next: …", then back on the list with the next row lit.
  await expect(page.getByTestId('next-chip')).toContainText('Nice. Next:');
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('[data-state="next"]')).toHaveCount(1);
  console.log(`tap count 1: ${t.count}`);
  expect(errors).toEqual([]);
});

test('2. changing the weight of one barbell set takes at most 3 extra taps', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);

  const t = counter();
  await t.tap(view.getByTestId('weight-cell').first());
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet.getByTestId('plate-total')).toHaveText('185lb');
  await t.tap(sheet.getByRole('button', { name: 'Add 5 lb plate to each side' }));
  await t.tap(sheet.getByRole('button', { name: 'Done' }));
  expect(t.count).toBeLessThanOrEqual(3);
  // That row and the rows below it changed; the logged set did not.
  await expect(view.getByTestId('weight-cell')).toHaveText(['195', '195', '195']);
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  const sets = (await dbAll<{ id: string; order: number; load: { total: number; perSide: number[] } }>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
  expect(sets.map((s) => s.load.total)).toEqual([185, 195]);
  expect(sets[1]!.load.perSide).toEqual([45, 25, 5]);
  console.log(`tap count 2: ${t.count}`);
  expect(errors).toEqual([]);
});

test('3. quick workout with one exercise and 3 sets logged in at most 7 taps including search', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedSquat(page);
  await page.reload();
  const t = counter();

  await t.tap(page.getByRole('button', { name: /Quick workout/ }));
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' });
  await t.tap(search);
  await search.pressSequentially('squat');
  await t.tap(sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }));
  await t.tap(sheet.getByRole('button', { name: 'Add 1' }));
  const view = page.getByTestId('exercise-barbell-back-squat');
  for (let i = 0; i < 3; i++) {
    await t.tap(view.getByTestId('check-current'));
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  expect(t.count).toBeLessThanOrEqual(7);
  const sets = (await dbAll<{ id: string; reps: number; load: { total: number } }>(page, 'sets')).filter((s) => !s.id.startsWith('seed-'));
  expect(sets).toHaveLength(3);
  expect(sets.every((s) => s.load.total === 185)).toBe(true);
  console.log(`tap count 3: ${t.count}`);
  expect(errors).toEqual([]);
});

test('3b. first time ever: quick workout, one exercise, first weight picked, 3 sets in at most 10 taps', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const t = counter();
  await t.tap(page.getByRole('button', { name: /Quick workout/ }));
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' });
  await t.tap(search);
  await search.pressSequentially('squat');
  await t.tap(sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }));
  await t.tap(sheet.getByRole('button', { name: 'Add 1' }));
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('weight-cell')).toHaveText(['Pick', '–', '–']);
  await t.tap(view.getByTestId('weight-cell').first());
  const w = page.getByRole('dialog', { name: 'Pick the weight' });
  await t.tap(w.getByRole('button', { name: 'Add 45 lb plate to each side' }));
  await t.tap(w.getByRole('button', { name: 'Done' }));
  for (let i = 0; i < 3; i++) {
    await t.tap(view.getByTestId('check-current'));
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  expect(t.count).toBeLessThanOrEqual(10);
  const sets = await dbAll<{ load: { total: number } }>(page, 'sets');
  expect(sets.map((s) => s.load.total)).toEqual([135, 135, 135]);
  console.log(`tap count 3b: ${t.count}`);
  expect(errors).toEqual([]);
});
