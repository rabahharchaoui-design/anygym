// PLAN 3.1: finish curated plans. Routines by place (only tiles with a real plan behind them), the
// plan viewer's pair cards and week by week tables, Use this plan with Undo, and starting a day.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { dbAll, watchErrors } from './workout-helpers';

const SHOTS = 'reports/shots/3.1';
const shot = async (page: Page, name: string) => {
  const project = test.info().project.name;
  if (!['iPhone SE', 'iPhone 17 Pro Max', '320 floor'].includes(project)) return;
  await page.waitForTimeout(450); // springs settled
  await page.screenshot({ path: `${SHOTS}/${name}-${project.replace(/ /g, '-')}.png` });
};

// The phone's real insets, so a control under the status bar or home indicator fails the layout check.
test.beforeEach(async ({ page }) => {
  await simulateSafeAreas(page);
});

type RawWeek = { sets?: number; reps?: number; rounds?: number };
const sixWeek = JSON.parse(readFileSync('data/plans/six-week-volume.json', 'utf8')) as { days: Array<{ n: number; name: string; items: Array<{ exercise: string; weeks: RawWeek[] }> }> };
const split5 = JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8')) as {
  days: Array<{ n: number; name: string; blocks: Array<{ type: string; restSec?: number; warmup?: boolean; items?: Array<{ exercise: string }> }> }>;
};
const map = JSON.parse(readFileSync('data/exercise-map.json', 'utf8')) as Array<{ planId: string; match: string }>;
const sure = new Set(map.filter((e) => e.match !== 'none').map((e) => e.planId));

/** The number that changes week to week, straight from the JSON (the same rule the strip states). */
const expectedCells = (weeks: RawWeek[]): string[] => {
  if (weeks[0]!.rounds !== undefined) return weeks.map((w) => String(w.rounds));
  const sets = new Set(weeks.map((w) => w.sets));
  const reps = new Set(weeks.map((w) => w.reps));
  if (sets.size === 1 && reps.size > 1) return weeks.map((w) => String(w.reps));
  if (reps.size === 1 && sets.size > 1) return weeks.map((w) => String(w.sets));
  return weeks.map((w) => `${w.sets} × ${w.reps}`);
};

test('routines by place: only tiles with a plan, tap one for its plans, every plan still listed @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  const tiles = page.locator('[data-testid^="place-"]');
  // PLAN 3.5: home, travel and bodyweight have real plans now; still no empty tile, ever.
  await expect(tiles).toHaveCount(4);
  const full = page.getByTestId('place-full');
  await expect(full).toHaveAccessibleName('Full gym, 5 plans');
  await expect(full).toContainText('Full gym');
  await expect(full).toContainText('5 plans');
  await expect(page.getByTestId('place-travel')).toHaveAccessibleName('Travel or hotel gym, 2 plans');
  await expect(page.getByTestId('place-home')).toHaveAccessibleName('At home, 1 plan');
  await expect(page.getByTestId('place-bodyweight')).toHaveAccessibleName('Bodyweight, 1 plan');
  for (const t of await tiles.all()) await expect(t).toContainText(/[1-9]\d* plans?/);
  for (const id of ['dumbbells', 'bands', 'cardio']) await expect(page.getByTestId(`place-${id}`)).toHaveCount(0);
  await expect(page.getByText('No plans here yet')).toHaveCount(0);
  // The picker still lists every plan below the tiles.
  await expect(page.getByRole('heading', { name: 'All plans' })).toBeVisible();
  await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
  await expect(page.getByTestId('plan-six-week-volume')).toBeVisible();
  expect(await fullyShown(full.locator('span').first())).toBe(true);
  await checkLayout(page, { primary: full });
  await shot(page, 'plans-picker');

  await full.tap();
  await expect(page).toHaveURL(/#\/plans\/place\/full$/);
  await expect(page.getByRole('heading', { name: 'Full gym', level: 1 })).toBeVisible();
  const cards = page.locator('[data-testid^="plan-"]');
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0)).toHaveAttribute('data-testid', 'plan-five-day-split');
  await expect(cards.nth(1)).toHaveAttribute('data-testid', 'plan-six-week-volume');
  await expect(cards.nth(2)).toHaveAttribute('data-testid', 'plan-hotel-gym-3-day');
  await checkLayout(page, { primary: cards.nth(0) });
  await shot(page, 'place-full');

  // A plan opened from the place goes back to the place, then to Plans.
  await page.getByTestId('plan-six-week-volume').tap();
  await expect(page).toHaveURL(/#\/plans\/place\/full\/six-week-volume$/);
  await expect(page.getByRole('heading', { name: 'Six Week Volume Builder', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Full gym' }).tap();
  await expect(page).toHaveURL(/#\/plans\/place\/full$/);
  await page.getByRole('link', { name: 'Back to Plans' }).tap();
  await expect(page).toHaveURL(/#\/plans$/);
  await expect(page.getByTestId('place-full')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a place with no plan is never a tile; an old link to one gets the calm empty state @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  await expect(page.getByTestId('place-full')).toBeVisible();
  await expect(page.getByTestId('place-cardio')).toHaveCount(0);
  await page.goto('./#/plans/place/cardio');
  await expect(page.getByRole('heading', { name: 'No plans here yet' })).toBeVisible();
  await expect(page.getByText('Every plan we have is on the Plans tab.')).toBeVisible();
  await expect(page.locator('[data-testid^="plan-"]')).toHaveCount(0);
  const back = page.getByRole('button', { name: 'See all plans' });
  await checkLayout(page, { primary: back });
  await shot(page, 'place-empty');
  await back.tap();
  await expect(page).toHaveURL(/#\/plans$/);
  expect(errors).toEqual([]);
});

test('plan viewer: each pair is one card with its one rest, labeled Pair @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/five-day-split');
  for (const day of split5.days) {
    const region = page.getByRole('region', { name: `Day ${day.n} · ${day.name}` });
    const pairs = day.blocks.filter((b) => b.type === 'superset');
    const cards = region.getByTestId('plan-pair');
    await expect(cards).toHaveCount(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      const b = pairs[i]!;
      const card = cards.nth(i);
      await expect(card.locator('p').first()).toHaveText(b.warmup ? 'Warm up · Pair: back to back' : 'Pair: back to back');
      // Both exercises inside the one card, in order.
      const names = await card.locator('[data-testid^="plan-item-"] > span:first-child').allInnerTexts();
      expect(names).toEqual(b.items!.map((x) => x.exercise));
      // The rest once, under both, never on each row.
      if (b.restSec !== undefined) await expect(card.getByTestId('pair-rest')).toHaveText(`${b.restSec} s rest after both`);
      else await expect(card.getByTestId('pair-rest')).toHaveCount(0);
      for (const row of await card.locator('[data-testid^="plan-item-"]').all()) await expect(row).not.toContainText('rest');
    }
  }
  const day2 = page.getByRole('region', { name: 'Day 2 · Chest and triceps' });
  await day2.getByTestId('plan-pair').first().scrollIntoViewIfNeeded();
  await checkLayout(page);
  await day2.getByTestId('plan-pair').nth(1).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'viewer-pairs');
  expect(errors).toEqual([]);
});

test('six week viewer: every week by week table equals the JSON, the shown week follows the picker @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/six-week-volume');
  let tables = 0;
  for (const day of sixWeek.days) {
    const region = page.getByRole('region', { name: `Day ${day.n} · ${day.name}` });
    // evaluateAll does not wait, and the app boots asynchronously after page.goto: wait for the rows.
    await expect(region.locator('[data-testid^="week-table-"]')).toHaveCount(day.items.length);
    const got = await region.locator('[data-testid^="week-table-"]').evaluateAll((els) => els.map((t) => [...t.querySelectorAll('[data-testid="week-cell"]')].map((c) => c.textContent ?? '')));
    expect(got, `Day ${day.n}`).toEqual(day.items.map((it) => expectedCells(it.weeks)));
    tables += got.length;
  }
  expect(tables).toBe(48);
  const front = page.getByTestId('week-table-front-squat');
  await expect(front.getByText('Reps each week · 5 sets')).toBeVisible();
  await expect(front.locator('li[data-current]')).toHaveAccessibleName('Week 1: 6');
  await page.getByRole('button', { name: 'Week 3' }).tap();
  await expect(front.locator('li[data-current]')).toHaveAccessibleName('Week 3: 8');
  await expect(page.getByTestId('plan-item-front-squat')).toHaveText(/5 sets × 8 reps$/);
  await expect(page.getByTestId('week-table-28-method-squat').getByText('Sets each week · 28 reps')).toBeVisible();
  await expect(page.getByTestId('week-table-30-second-interval-sprint').getByText('Rounds each week · 30 sec each')).toBeVisible();
  // Six cells fit on one line on every phone, every number whole.
  await front.scrollIntoViewIfNeeded();
  for (const cell of await front.getByTestId('week-cell').all()) expect(await fullyShown(cell)).toBe(true);
  const rows = await front.locator('li').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(rows).toBe(1);
  await checkLayout(page);
  await front.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'viewer-weeks');
  // Browsing a week never changes the plan in use.
  expect(await dbAll(page, 'planState')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('Use this plan from a place: Plan saved with Undo, then start the day into its workout @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/place/full/five-day-split');
  const use = page.getByRole('button', { name: 'Use this plan' });
  await checkLayout(page, { primary: use });
  await use.tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Plan saved' })).toBeVisible();
  expect(await dbAll(page, 'planState')).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(async () => (await dbAll(page, 'planState')).length).toBe(0);
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();

  // Again, and this time start it (SPEC 20): Start opens the day list of Day 1.
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 · Legs \(hamstring focus\)/);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await expect(page.getByTestId('workout-title')).toHaveText('Day 1 · Legs (hamstring focus)');
  const rows = page.locator('[data-row]:not([data-testid="finisher"])');
  await rows.first().waitFor();
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-row')!));
  expect(ids.length).toBeGreaterThan(0);
  // A demo photo on exactly the rows with a sure catalog match, never on the others.
  await expect
    .poll(async () => rows.evaluateAll((els) => els.filter((e) => e.querySelector('[data-photo] img')).map((e) => e.getAttribute('data-row'))))
    .toEqual(ids.filter((id) => sure.has(id)));
  const mapped = ids.find((id) => sure.has(id))!;
  const unmapped = ids.find((id) => !sure.has(id))!;

  // A sure one opens with its demo hero; an unsure one with no picture at all.
  await page.getByTestId(`row-${mapped}`).tap();
  const view = page.getByTestId(`exercise-${mapped}`);
  // The hero on most phones; on short screens (the 320 floor) the same photo as the header tile.
  await expect(view.locator('[data-testid="demo-hero"], [data-testid="demo-tile"]').first()).toBeVisible();
  await expect(view.locator('img').first()).toBeVisible();
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId(`row-${unmapped}`).tap();
  const plain = page.getByTestId(`exercise-${unmapped}`);
  await expect(plain).toBeVisible();
  await expect(plain).not.toHaveAttribute('data-hero', '');
  await expect(plain.locator('img')).toHaveCount(0);
  await shot(page, 'start-unmapped');
  expect(errors).toEqual([]);
});

test('six week plan: the day starts in the week the plan is in, with that week of the table', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/six-week-volume');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('week-label')).toHaveText('Week 1 of 6');
  // Move the plan to week 3 the way finishing a week would (planState.weekIndex), then start.
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('planState', 'readwrite');
          const st = tx.objectStore('planState');
          const g = st.get('active');
          g.onsuccess = () => st.put({ ...g.result, weekIndex: 2 });
          tx.oncomplete = () => (req.result.close(), res());
          tx.onerror = () => rej(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByTestId('week-label')).toHaveText('Week 3 of 6');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-front-squat')).toContainText('5 sets × 8');
  await expect(page.getByTestId('row-leg-press')).toContainText('5 sets × 14');
  await page.getByTestId('row-front-squat').tap();
  await expect(page.getByTestId('exercise-front-squat').getByTestId('reps-cell')).toHaveText(['8', '8', '8', '8', '8']);
  expect(errors).toEqual([]);
});
