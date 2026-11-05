// Independent verification of PLAN 3.4 (SPEC 7.2, 19, 20, 21.1): patterns data vs the catalog, the
// swap sheet, logged sets kept under the original, Always use this, the hotel gym, progression,
// backup and restore, 130% text, reduced motion. Shots only in reports/shots/3.4/verify/.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { formatTotal, sumLoad } from '../src/lib/load';
import { slugify, type PlanExercise } from '../src/lib/loadTypeRule';
import { dayIndexOf, normalizePlan, type Plan } from '../src/lib/plans';
import { dayWorkout, isWorkingEntry } from '../src/lib/planWorkout';
import { checkControls, checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, usePlan, watchErrors } from './workout-helpers';

type Req = string[][];
type Cand = { id: string; planId?: string; requires: Req; load?: string; timed?: boolean };
const PATTERNS = JSON.parse(readFileSync('data/patterns.json', 'utf8')) as { patterns: Record<string, { candidates: Cand[] }>; planExercises: Record<string, { pattern: string | null; requires: Req | null }> };
const CATALOG = (JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: Array<{ id: string; equipment: string | null; images: string[] }> }).exercises;
const MAP = JSON.parse(readFileSync('data/exercise-map.json', 'utf8')) as Array<{ planId: string; match: string; catalogId: string | null }>;
const planExercises = new Map((JSON.parse(readFileSync('data/plan-exercises.json', 'utf8')) as PlanExercise[]).map((e) => [e.id, e]));
const FIVE: Plan = normalizePlan(JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8')), (n: string) => planExercises.get(slugify(n)));

type Sess = { id: string; planId?: string; dayId?: string; exerciseIds: string[]; swaps?: Array<{ slot: string; current: string; kept?: string[]; noFit?: boolean; auto?: boolean; always?: boolean; reason?: string }>; endedAt?: number };
type Gym = { id: string; isActive: boolean; equipment: string[]; dumbbellRange: { min: number; max: number; step: number } | null };
type Settings = { exerciseId: string; alwaysUse?: Record<string, string> };

const HOTEL = ['dumbbells', 'adjustable_bench', 'cable_station', 'kettlebells'];
const shot = async (page: Page, name: string) => {
  const project = test.info().project.name;
  if (!['iPhone SE', 'iPhone 17 Pro Max', '320 floor'].includes(project)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.4/verify/${name}-${project.replace(/ /g, '-')}.png` });
};
const hotelGym = async (page: Page, equipment = HOTEL) => {
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, type: 'hotel', equipment, dumbbellRange: { min: 5, max: 50, step: 5 } }] });
};
const activeGym = async (page: Page) => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
const start = async (page: Page) => {
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
};
const session = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined)!;
const openReplace = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `More for ${name}` }).tap();
  await page.getByTestId('replace-row').tap();
  const sheet = page.getByRole('dialog', { name: `Replace ${name}` });
  await expect(sheet).toBeVisible();
  return sheet;
};
const supported = (req: Req, g: Gym) => req.every((grp) => grp.some((id) => g.equipment.includes(id) && (id !== 'dumbbells' || g.dumbbellRange !== null)));
const barSet = (id: string, sessionId: string, exerciseId: string, order: number, reps: number, perSide: number[], extra: Record<string, unknown> = {}) => {
  const total = sumLoad({ bar: 45, perSide, unit: 'lb' }).total!;
  return { id, sessionId, exerciseId, order, kind: 'work', uncertain: false, reps, load: { kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide, ...extra } };
};
async function logCurrent(page: Page, id: string) {
  const view = exerciseView(page, id);
  await expect(view).toBeVisible();
  const before = await loggedRows(view).count();
  if (!(await checkCurrent(view).isEnabled())) {
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
  }
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(before + 1);
}
const text130 = (page: Page, scope: string) =>
  page.evaluate((root) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`${root}, ${root} *`));
    const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);
const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });

// ------------------------------------------------------------------ (1) data

test('V1 every patterns.json id is in the catalog, equipment agrees with the catalog, no duplicates @matrix', () => {
  const byId = new Map(CATALOG.map((e) => [e.id, e]));
  const ids = Object.values(PATTERNS.patterns).flatMap((l) => l.candidates.map((c) => c.id));
  expect(ids.length).toBeGreaterThan(100);
  expect(ids.filter((id) => !byId.has(id))).toEqual([]);
  expect(new Set(ids).size).toBe(ids.length);
  // Catalog equipment word -> the gear ids that may satisfy it (a rule the test owns, not the app's).
  const ok: Record<string, string[]> = {
    barbell: ['barbell_rack'], dumbbell: ['dumbbells'], cable: ['cable_station', 'lat_pulldown', 'seated_row'], kettlebells: ['kettlebells'],
    bands: ['resistance_bands'], 'e-z curl bar': ['ez_curl_bar'], 'body only': [], machine: ['smith_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press_machine', 'pec_deck', 'shoulder_press_machine', 'calf_raise_machine', 'seated_row'],
  };
  const odd: string[] = [];
  for (const l of Object.values(PATTERNS.patterns)) {
    for (const c of l.candidates) {
      const eq = byId.get(c.id)!.equipment;
      const gear = c.requires.flat();
      if (eq === null) continue;
      const allowed = ok[eq];
      if (!allowed) continue;
      if (eq !== 'body only' && !gear.some((g) => allowed.includes(g))) odd.push(`${c.id} (${eq}) requires ${gear.join('/')}`);
      if (eq === 'body only' && gear.some((g) => ['barbell_rack', 'dumbbells', 'cable_station', 'smith_machine'].includes(g))) odd.push(`${c.id} body only requires ${gear.join('/')}`);
    }
  }
  expect(odd).toEqual([]);
  const spot: Array<[string, string, string]> = [
    ['Barbell_Squat', 'barbell', 'barbell_rack'], ['Goblet_Squat', 'kettlebells', 'kettlebells'], ['Pull_Through', 'cable', 'cable_station'],
    ['Smith_Machine_Squat', 'machine', 'smith_machine'], ['Dumbbell_Bench_Press', 'dumbbell', 'dumbbells'], ['EZ-Bar_Curl', 'e-z curl bar', 'ez_curl_bar'],
    ['Lateral_Raise_-_With_Bands', 'bands', 'resistance_bands'], ['Butterfly', 'machine', 'pec_deck'], ['Pushups', 'body only', ''], ['Wide-Grip_Lat_Pulldown', 'cable', 'lat_pulldown'],
  ];
  for (const [id, eq, gear] of spot) {
    expect(byId.get(id)!.equipment, id).toBe(eq);
    const c = Object.values(PATTERNS.patterns).flatMap((l) => l.candidates).find((x) => x.id === id)!;
    if (gear) expect(c.requires.flat(), id).toContain(gear);
    else expect(c.requires, id).toEqual([]);
  }
  expect(Object.keys(PATTERNS.planExercises).length).toBeGreaterThan(50);
});

// ------------------------------------------------------------------ (2) menu, candidates, photos

test('V2 Replace is first; every choice is a same pattern, gym supported candidate; photos only on exact or variant @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  const menu = page.getByRole('dialog', { name: 'Barbell Back Squat options' });
  await expect(menu.locator('button').first()).toHaveText('Replace');
  await checkControls(page, '[role="dialog"]');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to the list' }).tap();

  const eligible = new Set(MAP.filter((m) => m.match !== 'none' && m.catalogId).map((m) => m.catalogId!));
  const byPlan = new Map(MAP.map((m) => [m.planId, m]));
  let sheets = 0;
  let choices = 0;
  let photos = 0;
  for (const kit of ['full', 'hotel'] as const) {
    if (kit === 'hotel') {
      await page.getByRole('button', { name: 'Finish' }).tap();
      await page.getByRole('button', { name: 'Done' }).tap();
      await hotelGym(page);
      await page.goto('./');
      await start(page);
    }
    const gym = await activeGym(page);
    const rows = await page.locator('[data-testid^="row-"]:not([data-skip="true"])').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(4)));
    for (const slotNow of rows.slice(0, 7)) {
      const pat = PATTERNS.planExercises[slotNow]?.pattern ?? Object.entries(PATTERNS.patterns).find(([, l]) => l.candidates.some((c) => (c.planId ?? c.id) === slotNow))?.[0] ?? null;
      await page.getByTestId(`row-${slotNow}`).tap();
      const name = (await exerciseView(page, slotNow).getByRole('heading').first().innerText()).trim();
      const sheet = await openReplace(page, name);
      const got = await sheet.locator('[data-testid^="swap-choice-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(12)));
      sheets++;
      expect(got.length).toBeLessThanOrEqual(4);
      if (!pat) {
        await expect(sheet.getByTestId('swap-empty')).toBeVisible();
        expect(got).toEqual([]);
      }
      for (const g of got) {
        choices++;
        expect(g, 'not itself').not.toBe(slotNow);
        const c = pat ? PATTERNS.patterns[pat]!.candidates.find((x) => (x.planId ?? x.id) === g || x.id === g) : undefined;
        expect(c, `${g} is in the ${pat} ladder`).toBeTruthy();
        expect(supported(c!.requires, gym), `${g} is doable in ${kit} gym`).toBe(true);
        const hasPhoto = (await sheet.getByTestId(`swap-choice-${g}`).locator('[data-photo]').count()) > 0;
        const sure = c!.planId ? !!byPlan.get(c!.planId) && byPlan.get(c!.planId)!.match !== 'none' : eligible.has(c!.id);
        if (hasPhoto) {
          photos++;
          expect(sure, `${g} shows a photo`).toBe(true);
          await expect(sheet.getByTestId(`swap-choice-${g}`).locator('[data-photo] img').first()).toHaveAttribute('src', /.+/);
        }
      }
      if (slotNow === 'barbell-back-squat') await shot(page, `sheet-${kit}`);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await page.getByRole('button', { name: 'Back to the list' }).tap();
    }
  }
  expect(sheets).toBeGreaterThanOrEqual(10);
  expect(choices).toBeGreaterThan(10);
  test.info().annotations.push({ type: 'counts', description: `sheets ${sheets}, choices ${choices}, photos ${photos}` });
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ (3) logged sets, Finish math, Undo, reload

test('V3 swap mid exercise: logged sets stay under the original, pending rows Pick, Finish total is exact, Undo exact, reload keeps it @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await start(page);
  const s0 = await session(page);
  await dbPut(page, {
    sets: [
      barSet('o1', s0.id, 'barbell-back-squat', 0, 10, [45]),
      barSet('o2', s0.id, 'barbell-back-squat', 1, 8, [45, 25]),
      barSet('o3', s0.id, 'barbell-back-squat', 2, 6, [45, 45]),
    ],
  });
  await page.reload();
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(loggedRows(exerciseView(page, 'barbell-back-squat'))).toHaveCount(3);
  const before = await session(page);

  // Undo right away restores the document exactly.
  let sheet = await openReplace(page, 'Barbell Back Squat');
  await sheet.getByTestId('swap-choice-Smith_Machine_Squat').tap();
  const view = exerciseView(page, 'Smith_Machine_Squat');
  await expect(view).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(exerciseView(page, 'barbell-back-squat')).toBeVisible();
  await expect.poll(async () => JSON.stringify(await session(page))).toBe(JSON.stringify(before));
  expect((await dbAll(page, 'sets')).length).toBe(3);

  // Swap for real. The replacement shows Pick, never a carried weight.
  sheet = await openReplace(page, 'Barbell Back Squat');
  await sheet.getByTestId('swap-choice-Smith_Machine_Squat').tap();
  await expect(view).toBeVisible();
  await expect(view.getByText('Pick', { exact: true }).first()).toBeVisible();
  expect(await view.innerText()).not.toMatch(/\b(135|185|225)\b/);
  await shot(page, 'replacement-pick');
  await page.reload();
  await expect(exerciseView(page, 'Smith_Machine_Squat')).toBeVisible();
  await expect(exerciseView(page, 'Smith_Machine_Squat').getByText('Pick', { exact: true }).first()).toBeVisible();
  await logCurrent(page, 'Smith_Machine_Squat');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toContainText('3 sets');
  await shot(page, 'list-after-swap');

  const sets = await dbAll<{ id: string; exerciseId: string; reps: number; load: { total: number }; kind: string }>(page, 'sets');
  expect(sets.filter((x) => x.exerciseId === 'barbell-back-squat').map((x) => x.id).sort()).toEqual(['o1', 'o2', 'o3']);
  const per: Record<string, number[]> = { o1: [45], o2: [45, 25], o3: [45, 45] };
  for (const o of sets.filter((x) => x.id in per)) expect(o.load.total).toBe(sumLoad({ bar: 45, perSide: per[o.id]!, unit: 'lb' }).total);
  const expectTotal = sets.filter((x) => x.kind !== 'warmup').reduce((a, x) => a + x.reps * x.load.total, 0);

  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-total')).toHaveText(formatTotal(expectTotal, 'lb'));
  await expect(page.getByTestId('finish-sets')).toHaveText('4');
  await expect(page.getByTestId('finish-exercise').filter({ hasText: 'Barbell Back Squat' })).toHaveCount(1);
  await expect(page.getByTestId('finish-exercise').filter({ hasText: 'Smith Machine Squat' })).toHaveCount(1);
  await shot(page, 'finish-swapped');
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ (4) Always use this

test('V4 Always use this persists across workouts, Stop restores, the plan data is untouched @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const sheet = await openReplace(page, 'Barbell Back Squat');
  await expect(sheet.getByText('For this workout only')).toBeVisible();
  await sheet.getByText('Always use this').tap();
  await sheet.getByTestId('swap-choice-Smith_Machine_Squat').tap();
  await expect(exerciseView(page, 'Smith_Machine_Squat')).toBeVisible();
  await expect.poll(async () => (await dbAll<Settings>(page, 'exerciseSettings')).find((x) => x.alwaysUse)?.alwaysUse).toEqual({ 'five-day-split': 'Smith_Machine_Squat' });
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const s = await session(page);
  await dbPut(page, { sets: [barSet('a1', s.id, 'Smith_Machine_Squat', 0, 5, [45])] });
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  for (let i = 0; i < 2; i++) {
    await start(page);
    await expect(page.getByTestId('row-Smith_Machine_Squat')).toBeVisible();
    await expect(page.getByTestId('row-barbell-back-squat')).toHaveCount(0);
    await expect(page.getByTestId('swap-line-Smith_Machine_Squat')).toContainText('Swapped: your pick for this plan');
    if (i === 0) {
      await page.getByRole('button', { name: 'Finish' }).tap();
      await page.getByRole('button', { name: 'Done' }).tap();
    }
  }
  await page.reload();
  await expect(page.getByTestId('row-Smith_Machine_Squat')).toBeVisible();
  await page.getByTestId('swap-line-Smith_Machine_Squat').getByRole('button', { name: /^Change/ }).tap();
  const again = page.getByRole('dialog', { name: 'Replace Smith Machine Squat' });
  await shot(page, 'always-stop');
  await again.getByTestId('swap-stop-always').tap();
  await expect.poll(async () => (await dbAll<Settings>(page, 'exerciseSettings')).some((x) => x.alwaysUse)).toBe(false);
  await expect(page.getByTestId('row-Smith_Machine_Squat')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  await start(page);
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await expect(page.getByTestId('row-Smith_Machine_Squat')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ (5) hotel gym, nothing fits, 60% rule

async function seedDoable(page: Page, fraction: number, roundUp: boolean) {
  const cur = await session(page);
  const planned = dayWorkout(FIVE, dayIndexOf(FIVE, cur.dayId), 0).filter(isWorkingEntry);
  const noFit = new Set(cur.swaps!.filter((x) => x.noFit).map((x) => x.slot));
  const idOf = (slot: string) => cur.swaps!.find((x) => x.slot === slot && !x.noFit)?.current ?? slot;
  const live = planned.filter((e) => !noFit.has(e.exerciseId));
  const total = live.reduce((a, e) => a + Math.max(1, e.sets), 0);
  const need = roundUp ? Math.ceil(total * fraction) : Math.floor(total * fraction);
  const rows: unknown[] = [];
  let order = 100;
  outer: for (const e of live) {
    for (let k = 0; k < Math.max(1, e.sets); k++) {
      if (rows.length >= need) break outer;
      const timed = e.seconds !== undefined && e.reps === undefined;
      rows.push({ id: `h-${e.exerciseId}-${k}`, sessionId: cur.id, exerciseId: idOf(e.exerciseId), order: order++, kind: 'work', uncertain: false, ...(timed ? { seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } } : { reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 } }) });
    }
  }
  await dbPut(page, { sets: rows, orderCounters: [{ sessionId: cur.id, next: order }] });
  return { total, logged: rows.length, all: planned.reduce((a, e) => a + Math.max(1, e.sets), 0) };
}

test('V5 hotel gym: auto swap line, Change and Restore, nothing fits, 70% of the doable sets moves on @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await hotelGym(page, HOTEL);
  await start(page);
  const s = await session(page);
  expect(s.swaps?.some((x) => x.auto)).toBe(true);
  const stuck = s.swaps!.filter((x) => x.noFit);
  expect(stuck.length).toBeGreaterThan(0);
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toContainText('Swapped: no barbell here');
  await expect(page.getByTestId(`swap-line-${stuck[0]!.slot}`)).toContainText(/^Nothing fits: no .+ here\. Skip it\.$/);
  await shot(page, 'hotel-list');
  await checkLayout(page);
  await checkControls(page);

  await page.getByTestId('swap-line-Dumbbell_Squat').getByRole('button', { name: /^Change/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Replace Dumbbell Squat' });
  await expect(sheet.getByTestId('swap-restore')).toContainText('Barbell Back Squat');
  await sheet.getByTestId('swap-restore').tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await expect(page.getByTestId('swap-line-barbell-back-squat')).toHaveCount(0);
  await page.getByTestId('row-barbell-back-squat').tap();
  const s2 = await openReplace(page, 'Barbell Back Squat');
  await s2.getByTestId('swap-choice-Dumbbell_Squat').tap();
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByTestId('row-Dumbbell_Squat')).toBeVisible();

  const counts = await seedDoable(page, 0.7, true);
  await page.reload();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-next')).toContainText('Day 2');
  await expect(page.getByTestId('finish-progress')).toHaveText(/^\d+ of \d+ lifts finished/);
  await shot(page, 'hotel-finish');
  test.info().annotations.push({ type: 'counts', description: `doable ${counts.total}, logged ${counts.logged}, all ${counts.all}` });
  expect(errors).toEqual([]);
});

test('V5b hotel: 50% of the doable sets keeps the day', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await hotelGym(page, HOTEL);
  await start(page);
  await seedDoable(page, 0.5, false);
  await page.reload();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-next')).toContainText('Day 1');
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ (6) progression and Last time

test('V6 Last time and the next target follow the exercise performed @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await hotelGym(page);
  const gym = await activeGym(page);
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
  await expect(view).toContainText('30');
  await expect(view).not.toContainText('405');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('swap-line-Dumbbell_Squat').getByRole('button', { name: /^Change/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Replace Dumbbell Squat' });
  await sheet.getByTestId('swap-choice-Bodyweight_Squat').tap();
  const bw = exerciseView(page, 'Bodyweight_Squat');
  await expect(bw).toBeVisible();
  await expect(bw).not.toContainText('405');
  await expect(bw).not.toContainText(/\b30\b/);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('swap-line-Bodyweight_Squat').getByRole('button', { name: /^Restore/ }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const orig = exerciseView(page, 'barbell-back-squat');
  await expect(orig).toBeVisible();
  await expect(orig).not.toContainText(/\b60\b/);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ (7) backup and restore

test('V7 backup then restore keeps swaps and alwaysUse; an old backup without them still loads @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await noShare(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const sheet = await openReplace(page, 'Barbell Back Squat');
  await sheet.getByText('Always use this').tap();
  await sheet.getByTestId('swap-choice-front-squat').tap();
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const s = await session(page);
  await dbPut(page, { sets: [barSet('b1', s.id, 'front-squat', 0, 5, [45]), barSet('b2', s.id, 'front-squat', 1, 5, [45])] });
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  const sessions = (await dbAll<Sess>(page, 'sessions')).sort((a, b) => a.id.localeCompare(b.id));
  const settings = (await dbAll<Settings>(page, 'exerciseSettings')).filter((x) => x.alwaysUse);
  expect(sessions.some((x) => x.swaps?.length)).toBe(true);
  expect(settings.length).toBe(1);

  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const path = await download.path();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.tables.sessions.some((x: Sess) => x.swaps?.length)).toBe(true);
  expect(file.tables.exerciseSettings.some((x: Settings) => x.alwaysUse)).toBe(true);

  const wipe = async () => {
    await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
    await page.goto('./#/history');
    await page.reload();
    await expect(page.getByText('No workouts yet')).toBeVisible();
  };
  const restore = async (p: string | { name: string; mimeType: string; buffer: Buffer }) => {
    await page.goto('./#/settings');
    await page.getByTestId('restore-file').setInputFiles(p);
    await page.getByTestId('restore-replace').tap();
    await page.getByTestId('restore-replace').tap();
    await expect(page.getByRole('dialog', { name: 'Restore backup' })).toHaveCount(0);
  };
  await wipe();
  await restore(path);
  expect((await dbAll<Sess>(page, 'sessions')).sort((a, b) => a.id.localeCompare(b.id))).toEqual(sessions);
  expect((await dbAll<Settings>(page, 'exerciseSettings')).filter((x) => x.alwaysUse)).toEqual(settings);
  await page.goto('./');
  await start(page);
  await expect(page.getByTestId('row-front-squat')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();

  const old = JSON.parse(JSON.stringify(file));
  for (const x of old.tables.sessions) delete x.swaps;
  for (const x of old.tables.exerciseSettings) delete x.alwaysUse;
  await wipe();
  await restore({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  const back = await dbAll<Sess>(page, 'sessions');
  expect(back.length).toBe(sessions.length);
  expect(back.some((x) => x.swaps)).toBe(false);
  await page.goto('./');
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ (8) 130% text, reduced motion, break it

test('V8 130% text, reduced motion, back with the sheet open, offline double tap @matrix', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
    await shot(page, big ? 'sheet-130' : 'sheet-100');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toBeVisible();
  const before = JSON.stringify(await session(page));
  // Browser back with the sheet open must not strand us.
  await page.getByTestId('swap-line-Dumbbell_Squat').getByRole('button', { name: /^Change/ }).tap();
  await expect(page.getByRole('dialog', { name: 'Replace Dumbbell Squat' })).toBeVisible();
  await page.goBack();
  await page.waitForTimeout(400);
  expect(JSON.stringify(await session(page))).toBe(before);
  await page.goto(`./#/workout/${(await session(page)).id}`);
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toBeVisible();
  // Offline, double tap.
  await context.setOffline(true);
  await page.getByTestId('swap-line-Dumbbell_Squat').getByRole('button', { name: /^Change/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Replace Dumbbell Squat' });
  await sheet.getByTestId('swap-choice-Bodyweight_Squat').evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
  await expect(page.getByTestId('row-Bodyweight_Squat')).toBeVisible();
  await context.setOffline(false);
  const after = await session(page);
  expect(after.exerciseIds.filter((x) => x === 'Bodyweight_Squat')).toHaveLength(1);
  expect(after.swaps!.filter((x) => x.slot === 'barbell-back-squat')).toHaveLength(1);
  expect(errors).toEqual([]);
});
