import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, navIdle, quickWith, usePlan, watchErrors } from './workout-helpers';
import { DB_NAME, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9 } from '../src/db/schema';

// Independent tester checks for PLAN 3.8 (SPEC 15). Screenshots: reports/shots/3.8-verify/.

const DAY = 86_400_000;
const lb = (total: number, perSide: number[]) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide });
const kg = (total: number, perSide: number[]) => ({ kind: 'barbell', unit: 'kg', total, barWeight: 20, perSide });
const BAR200 = lb(200, [45, 25, 10, 2.5]);
const BAR135 = lb(135, [45]);
const DB25 = { kind: 'dumbbell_each', unit: 'lb', total: 50 };

function lastWeek(day = 2): number {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back - 7 + day, 18).getTime();
}

type S = { exerciseId: string; reps: number; load: Record<string, unknown>; kind?: string };
let seq = 0;
async function seedAt(page: Page, startedAt: number, sets: S[], over: Record<string, unknown> = {}) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `vseed-${startedAt}-${seq++}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((s) => s.exerciseId))], ...over }],
    sets: sets.map((s, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: s.exerciseId, order: i, kind: s.kind ?? 'work', reps: s.reps, load: s.load, uncertain: false })),
  });
  return id;
}
const rep = (exerciseId: string, reps: number[], load: Record<string, unknown>): S[] => reps.map((r) => ({ exerciseId, reps: r, load }));
const three = (id: string, reps: number, load: Record<string, unknown>) => rep(id, [reps, reps, reps], load);

async function snap(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/3.8-verify/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
}

/** Every given locator is at least 48 css px (pt) tall and wide enough to tap. */
async function tapSize(loc: Locator, label: string, bad: string[]) {
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const b = await loc.nth(i).boundingBox();
    if (b && (b.height < 47.5 || b.width < 47.5)) bad.push(`${label}[${i}] ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
}

async function noOverflow(page: Page) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  // Round 2: non-null assertions only, so `npm run build` (tsc over tests) passes; same check.
  expect(w[0]!).toBeLessThanOrEqual(w[1]!);
}

async function setKgGym(page: Page) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Record<string, unknown>>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, {
    gyms: [
      {
        ...gym,
        unit: 'kg',
        dumbbellRange: { min: 2, max: 40, step: 2 },
        bars: { olympic: 20, womens: 15, ez_curl: null, trap: null, smith: null },
        stackStep: 2.5,
        plateInventory: [25, 20, 15, 10, 5, 2.5, 1.25].map((w) => ({ weight: w, enabled: true })),
      },
    ],
    profile: [{ id: 'me', defaultUnit: 'kg', createdAt: 1 }],
  });
}

test.describe('verify 3.8', () => {
  test('1+2 a lift that missed reps holds steady with a reason; only the one that hit everything is raised; one card; no 1RM wording @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...rep('barbell-back-squat', [12, 10, 6], BAR200), ...three('barbell-incline-bench-press', 12, BAR135)]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'level_up');
    await expect(page.getByTestId('coach-card')).toHaveCount(1);
    await expect(page.getByTestId('coach-line')).toHaveCount(0);
    const rows = card.getByTestId('coach-change');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Barbell Incline Bench Press');
    await expect(rows).toContainText('135 → 140 lb');
    await card.getByTestId('coach-holding-toggle').tap();
    const hold = card.getByTestId('coach-holding');
    await expect(hold).toContainText('Barbell Back Squat');
    await expect(hold).toContainText('Holding steady: 1 set fell short of 8 reps');
    await snap(page, 'v2-level-up-holding');
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/1rm|e1rm|one rep max|estimated max/);
    await card.getByTestId('coach-apply').tap();
    await expect(page.getByText('Added weight to 1 lift')).toBeVisible();
    const lifts = await dbAll<{ exerciseId: string; target?: { value: number } }>(page, 'coachLifts');
    expect(lifts.filter((l) => l.target).map((l) => [l.exerciseId, l.target!.value])).toEqual([['barbell-incline-bench-press', 140]]);
    expect(errors).toEqual([]);
  });

  test('1 a kg gym: level up and welcome back weights are 2.5 kg loadable with SPEC minimums @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await setKgGym(page);
    await page.reload();
    await seedAt(page, lastWeek(1), [...three('barbell-back-squat', 12, kg(100, [25, 15])), ...three('overhead-press', 12, kg(60, [20]))]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, { kind: 'dumbbell_each', unit: 'kg', total: 20 }));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'level_up');
    const rows = card.getByTestId('coach-change');
    await expect(rows.filter({ hasText: 'Barbell Back Squat' })).toContainText('100 → 105 kg');
    await expect(rows.filter({ hasText: 'Overhead Press' })).toContainText('60 → 62.5 kg');
    await expect(rows.filter({ hasText: 'Overhead Press' })).toContainText('+2.5 kg');
    await snap(page, 'v1-level-up-kg');
    await card.getByTestId('coach-apply').tap();
    await expect(page.getByText('Added weight to 2 lifts')).toBeVisible();
    await quickWith(page, [['overhead press', 'Overhead Press']]);
    const view = exerciseView(page, 'overhead-press');
    await expect(view.getByTestId('set-next')).toContainText('62.5 kg');
    await expect(view.getByTestId('weight-cell').first()).toHaveText('62.5');
    expect(errors).toEqual([]);
  });

  test('4 priority: welcome back (7+ days off) beats a level up and missed days; one card, no coach line @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    const before = (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]!;
    await dbPut(page, { planState: [{ ...before, nextDayIndex: 2, doneDays: [0, 1] }] });
    await seedAt(page, Date.now() - 9 * DAY, [...three('barbell-back-squat', 12, lb(225, [45, 35, 10, 2.5])), ...three('barbell-incline-bench-press', 12, BAR135)]);
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'welcome_back');
    await expect(page.getByTestId('coach-card')).toHaveCount(1);
    await expect(page.getByTestId('coach-line')).toHaveCount(0);
    const txt = await card.innerText();
    expect(txt).toMatch(/lb/);
    await snap(page, 'v4-welcome-back');
    // every number on the card is a multiple of 5 lb (barbell steps)
    for (const m of txt.matchAll(/(\d+(?:\.\d+)?) lb/g)) expect(Number(m[1]) % 5, `${m[0]} in ${txt}`).toBe(0);
    // nothing about the plan changed
    expect((await dbAll<{ nextDayIndex: number }>(page, 'planState'))[0]!.nextDayIndex).toBe(2);
    expect(errors).toEqual([]);
  });

  test('3 Settings Auto level up: off, wording, sheet with real lift, Turn on/Not now, survives reload, then Leveled up card + Undo changes Next @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...three('barbell-back-squat', 12, BAR200), ...three('overhead-press', 12, lb(95, [25]))]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await page.goto('./#/settings');
    await page.reload();
    await navIdle(page);
    const coach = page.getByTestId('settings-coach');
    const sw = coach.getByRole('switch', { name: /Auto level up/ });
    await expect(sw).toBeEnabled();
    await expect(sw).not.toBeChecked();
    await expect(coach).toContainText('When you hit all your reps on a lift for a week, AnyGym adds a little weight for next week on its own (about 5% on big leg lifts, 2.5 to 5% on upper body, more reps first on small exercises). You can always change any weight.');
    await snap(page, 'v3-settings');
    // Not now: nothing changes; flag still off after reload.
    await coach.getByText('Auto level up', { exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Auto level up' });
    await expect(sheet.getByTestId('auto-example')).toContainText(/(Barbell Back Squat200 → 210 lb|Overhead Press95 → 100 lb)/);
    await snap(page, 'v3-auto-sheet');
    await sheet.getByRole('button', { name: 'Not now' }).tap();
    await page.reload();
    await expect(page.getByTestId('settings-coach').getByRole('switch', { name: /Auto level up/ })).not.toBeChecked();
    // Turn on, reload, still on.
    await page.getByTestId('settings-coach').getByText('Auto level up', { exact: true }).tap();
    await page.getByRole('dialog', { name: 'Auto level up' }).getByRole('button', { name: 'Turn on' }).tap();
    // The app closes the sheet only after the IndexedDB write is saved; reloading before that raced the write on Chromium (tester 3.8b).
    await expect(page.getByRole('dialog', { name: 'Auto level up' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('settings-coach').getByRole('switch', { name: /Auto level up/ })).toBeChecked();
    // Today: quiet card once.
    await page.goto('./');
    const quiet = page.getByTestId('coach-card');
    await expect(quiet).toHaveAttribute('data-kind', 'leveled_up');
    await expect(page.getByTestId('coach-card')).toHaveCount(1);
    await expect(quiet.getByTestId('coach-title')).toHaveText('Leveled up 2 lifts for this week');
    await snap(page, 'v3-leveled-up');
    await quiet.getByTestId('coach-see-changes').tap();
    const list = page.getByRole('dialog', { name: 'Leveled up this week' });
    const rows = list.getByTestId('coach-change');
    await expect(rows).toHaveCount(2);
    for (const r of await rows.all()) {
      const t = await r.innerText();
      expect(t).toMatch(/→/);
      expect(t).toMatch(/you hit/);
    }
    await snap(page, 'v3-see-changes');
    await rows.filter({ hasText: 'Barbell Back Squat' }).getByTestId('change-undo').tap();
    await expect(rows.filter({ hasText: 'Barbell Back Squat' }).getByTestId('change-undone')).toHaveText('Back to 200 lb');
    await list.getByRole('button', { name: 'Close' }).tap();
    // Exercise Next after Undo: squat is back, press stays raised.
    await quickWith(page, [['back squat', 'Barbell Back Squat'], ['overhead press', 'Overhead Press']]);
    await page.getByTestId('row-barbell-back-squat').tap();
    const sq = exerciseView(page, 'barbell-back-squat');
    const nextSq = await sq.getByTestId('set-next').innerText();
    expect(nextSq).not.toMatch(/210/);
    console.log('SQUAT NEXT AFTER UNDO:', nextSq);
    await page.goBack();
    await page.getByTestId('row-overhead-press').tap();
    const press = exerciseView(page, 'overhead-press');
    await expect(press.getByTestId('set-next')).toContainText('100 lb');
    // never applied twice
    expect((await dbAll(page, 'coachChanges')).length).toBe(2);
    expect(errors).toEqual([]);
  });

  test('C5 Leveled up card is built from stored changes: stays after training again, shrinks per Undo, gone when all undone @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...three('barbell-back-squat', 12, BAR200), ...three('overhead-press', 12, lb(95, [25]))]);
    await seedAt(page, Date.now() - 4 * 3_600_000, three('bicep-curl', 9, DB25));
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, coach: { autoLevelUp: true, autoIntroAt: 1 } }] });
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card.getByTestId('coach-title')).toHaveText('Leveled up 2 lifts for this week');
    await expect.poll(async () => (await dbAll(page, 'coachChanges')).length).toBe(2);
    // Train both lifts again today (they no longer "qualify" for last week).
    await seedAt(page, Date.now() - 3_600_000, [...three('barbell-back-squat', 10, lb(210, [45, 25, 10, 5])), ...three('overhead-press', 10, lb(100, [25, 2.5]))]);
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('coach-card').getByTestId('coach-title')).toHaveText('Leveled up 2 lifts for this week');
    await expect(page.getByTestId('coach-card')).toHaveCount(1);
    await page.getByTestId('coach-see-changes').tap();
    const list = page.getByRole('dialog', { name: 'Leveled up this week' });
    await list.getByTestId('coach-change').filter({ hasText: 'Barbell Back Squat' }).getByTestId('change-undo').tap();
    await expect.poll(async () => (await dbAll<{ undoneAt?: number }>(page, 'coachChanges')).filter((c) => c.undoneAt).length).toBe(1);
    await list.getByRole('button', { name: 'Close' }).tap();
    await page.reload();
    await expect(page.getByTestId('coach-card').getByTestId('coach-title')).toHaveText('Leveled up 1 lift for this week');
    await snap(page, 'c5-one-left');
    await page.getByTestId('coach-see-changes').tap();
    await page.getByRole('dialog', { name: 'Leveled up this week' }).getByTestId('coach-change').filter({ hasText: 'Overhead Press' }).getByTestId('change-undo').tap();
    await expect.poll(async () => (await dbAll<{ undoneAt?: number }>(page, 'coachChanges')).filter((c) => c.undoneAt).length).toBe(2);
    await page.reload();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('3b with empty history the sheet is honest, and the flag survives reload @matrix', async ({ page }) => {
    await page.goto('./#/settings');
    const coach = page.getByTestId('settings-coach');
    await coach.getByText('Auto level up', { exact: true }).tap();
    await expect(page.getByTestId('auto-example-none')).toBeVisible();
    await snap(page, 'v3-auto-sheet-none');
  });

  test('3c Leveled up card: shows on repeat visits until hidden? (once per week)', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, lastWeek(1), three('barbell-back-squat', 12, BAR200));
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, coach: { autoLevelUp: true, autoIntroAt: 1 } }] });
    await page.goto('./');
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'leveled_up');
    await page.goto('./#/settings');
    await page.goto('./');
    await page.reload();
    const n = await page.getByTestId('coach-card').count();
    console.log('LEVELED CARD AFTER RELOAD WITHOUT HIDING:', n);
  });

  test('5 missed workouts: nothing changes on its own, Rebuild double tap is one rebuild, Undo restores @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    const before = (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]!;
    await dbPut(page, { planState: [{ ...before, nextDayIndex: 2, doneDays: [0, 1] }] });
    await seedAt(page, Date.now() - 5 * DAY, three('barbell-back-squat', 8, lb(185, [45, 25])));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'missed_days');
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'missed_days');
    expect((await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]).toMatchObject({ nextDayIndex: 2, doneDays: [0, 1] });
    await snap(page, 'v5-missed');
    await page.getByTestId('coach-rebuild').dblclick();
    await expect.poll(async () => (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]).toMatchObject({ nextDayIndex: 0, doneDays: [] });
    await expect(page.getByText('Week rebuilt: Day 1 is next').first()).toBeVisible();
    console.log('REBUILD TOASTS', await page.getByText('Week rebuilt: Day 1 is next').count());
    await snap(page, 'v5-rebuilt');
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(async () => (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]).toMatchObject({ nextDayIndex: 2, doneDays: [0, 1] });
    expect(errors).toEqual([]);
  });

  test('6 Fresh muscles: absent with nothing, bands follow the 24/48/72 h rule, warm ups count for nothing, absent after 3 days @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await expect(page.getByTestId('fresh-muscles')).toHaveCount(0);
    // warm up only, an hour ago: nothing
    await seedAt(page, Date.now() - 3_600_000, [{ exerciseId: 'barbell-back-squat', reps: 10, load: BAR135, kind: 'warmup' }]);
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('fresh-muscles')).toHaveCount(0);
    // 4 days old: nothing
    await seedAt(page, Date.now() - 4 * DAY, three('barbell-back-squat', 8, BAR135));
    await page.reload();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await expect(page.getByTestId('fresh-muscles')).toHaveCount(0);
    // 3 hours ago squat (day), 30 h bicep curl (two), 60 h bench (three)
    await seedAt(page, Date.now() - 3 * 3_600_000, three('barbell-back-squat', 8, BAR135));
    await seedAt(page, Date.now() - 30 * 3_600_000, three('barbell-bicep-curl', 10, lb(65, [10])));
    await seedAt(page, Date.now() - 60 * 3_600_000, three('barbell-incline-bench-press', 8, BAR135));
    await page.reload();
    const fresh = page.getByTestId('fresh-muscles');
    await expect(fresh).toBeVisible();
    await expect(fresh).toContainText('Based on your logged sets');
    const seen = async (band: string) => fresh.locator(`[data-band="${band}"]`).count();
    expect(await seen('day')).toBeGreaterThan(0);
    expect(await seen('two')).toBeGreaterThan(0);
    expect(await seen('three')).toBeGreaterThan(0);
    await expect(fresh.locator('[data-region="quadriceps"]').first()).toHaveAttribute('data-band', 'day');
    await expect(fresh.locator('[data-region="biceps"]').first()).toHaveAttribute('data-band', 'two');
    await expect(fresh.locator('[data-region="chest"]').first()).toHaveAttribute('data-band', 'three');
    await snap(page, 'v6-fresh');
    expect(errors).toEqual([]);
  });

  // 3.5g: the effort question is asked on the day list row only, never on the exercise view.
  test('7 effort chip: once after the last set, on the list row, persists after reload, skipping still finishes @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, lb(185, [45, 25])));
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    for (let i = 1; i <= 3; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
    }
    await expect(view.getByTestId('effort')).toHaveCount(0);
    const prompt = page.getByTestId('list-effort');
    await expect(prompt).toHaveCount(1, { timeout: 8000 });
    const bad: string[] = [];
    await tapSize(prompt.getByRole('button'), 'effort', bad);
    expect(bad).toEqual([]);
    await snap(page, 'v7-effort');
    await page.getByTestId('list-effort-hard').tap();
    await expect.poll(async () => (await dbAll<{ effort: string }>(page, 'efforts')).map((e) => e.effort)).toEqual(['hard']);
    await expect(prompt).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    expect((await dbAll(page, 'efforts')).length).toBe(1);
    // Finish (the tap is optional either way).
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page).toHaveURL(/\/done$/);
    expect(errors).toEqual([]);
  });

  for (const exp of ['1_2y', '3y', 'break']) {
    test(`8 warm ups for ${exp}: three rows, warm up kind, loadable, never Last time or Next @matrix`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, lb(185, [45, 25])));
      await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: exp } }] });
      await quickWith(page, [['back squat', 'Barbell Back Squat']]);
      const view = exerciseView(page, 'barbell-back-squat');
      const todo = view.getByTestId('set-todo');
      await expect(todo.getByTestId('weight-cell')).toHaveText(['45', '90', '140', '185', '185', '185']);
      await expect(todo.getByTestId('reps-cell')).toHaveText(['10', '5', '3', '11', '10', '10']);
      await expect(todo.getByTestId('set-type-chip').first()).toHaveText('Warm up');
      if (exp === '1_2y') await snap(page, 'v8-warmups');
      for (let i = 1; i <= 6; i++) {
        await checkCurrent(view).tap();
        await expect(loggedRows(view)).toHaveCount(i);
      }
      const rows = await dbAll<{ id: string; kind: string; order: number; load: { total: number } }>(page, 'sets');
      const mine = rows.filter((r) => !r.id.startsWith('vseed-')).sort((a, b) => a.order - b.order);
      expect(mine.map((r) => r.kind)).toEqual(['warmup', 'warmup', 'warmup', 'work', 'work', 'work']);
      expect(mine.slice(0, 3).map((r) => r.load.total)).toEqual([45, 90, 140]);
      await page.getByRole('button', { name: 'Finish' }).tap();
      await expect(page).toHaveURL(/\/done$/);
      // A new workout: Last time lists the working sets only (3 sets at 185), no warm up weights.
      await quickWith(page, [['back squat', 'Barbell Back Squat']]);
      const v2 = exerciseView(page, 'barbell-back-squat');
      const last = await v2.getByTestId('set-last').innerText();
      console.log(`LAST TIME (${exp}):`, last, '| NEXT:', await v2.getByTestId('set-next').innerText());
      expect(last).not.toMatch(/\b(45|90|140)\b/);
      expect(errors).toEqual([]);
    });
  }

  for (const exp of ['months', 'new']) {
    test(`8 no auto warm ups for ${exp} @matrix`, async ({ page }) => {
      await page.goto('./');
      await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, lb(185, [45, 25])));
      await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: exp } }] });
      await quickWith(page, [['back squat', 'Barbell Back Squat']]);
      await expect(exerciseView(page, 'barbell-back-squat').getByTestId('set-type-chip').filter({ hasText: 'Warm up' })).toHaveCount(0);
    });
  }

  test('9 a v9 shaped database upgrades to the current schema in the browser without losing history, gyms, plan state', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    const before = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
    await dbPut(page, { planState: [{ ...before, nextDayIndex: 3, doneDays: [0, 1, 2] }] });
    await seedAt(page, Date.now() - 2 * DAY, three('barbell-back-squat', 8, lb(185, [45, 25])));
    const stores = ['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones', 'kv', 'journal'];
    const snapshot: Record<string, unknown[]> = {};
    for (const s of stores) snapshot[s] = await dbAll(page, s);
    const gymCount = snapshot.gyms!.length;
    const setCount = snapshot.sets!.length;
    expect(setCount).toBe(3);
    const schema = { ...SCHEMA_V1, ...SCHEMA_V2, ...SCHEMA_V3, ...SCHEMA_V4, ...SCHEMA_V6, ...SCHEMA_V7, ...SCHEMA_V8, ...SCHEMA_V9 } as Record<string, string>;
    // Replace the database with a raw version 9 shaped one (Dexie version 9 = IndexedDB 90).
    const result = await page.evaluate(
      async ({ name, schema, snapshot }) => {
        await new Promise<void>((res) => {
          const d = indexedDB.deleteDatabase(name);
          d.onsuccess = () => res();
          d.onerror = () => res();
          d.onblocked = () => res();
        });
        return await new Promise<string>((resolve) => {
          const req = indexedDB.open(name, 90);
          req.onupgradeneeded = () => {
            const idb = req.result;
            for (const [store, spec] of Object.entries(schema)) {
              const parts = spec.split(',').map((p) => p.trim());
              const pk = parts[0]!;
              const os = pk.startsWith('[') ? idb.createObjectStore(store, { keyPath: pk.slice(1, -1).split('+') }) : idb.createObjectStore(store, { keyPath: pk });
              for (const ix of parts.slice(1)) {
                const compound = ix.startsWith('[');
                os.createIndex(ix, compound ? ix.slice(1, -1).split('+') : ix.replace(/^[*&]/, ''), { multiEntry: ix.startsWith('*'), unique: ix.startsWith('&') });
              }
            }
            const tx = req.transaction!;
            for (const [store, rows] of Object.entries(snapshot)) for (const r of rows) tx.objectStore(store).put(r);
          };
          req.onsuccess = () => {
            const v = req.result.version;
            req.result.close();
            resolve(`opened v${v}`);
          };
          req.onerror = () => resolve(`error ${String(req.error)}`);
        });
      },
      { name: DB_NAME, schema, snapshot },
    );
    expect(result).toBe('opened v90');
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('day-card-title')).toBeVisible();
    // 3.5e: schema v11 (IndexedDB 110); the v9 data must survive both upgrade steps.
    await expect.poll(async () => page.evaluate(() => new Promise<number>((r) => { const q = indexedDB.open('anygym'); q.onsuccess = () => { const v = q.result.version; q.result.close(); r(v); }; })), { timeout: 15000 }).toBe(110);
    expect((await dbAll(page, 'gyms')).length).toBe(gymCount);
    expect((await dbAll(page, 'sets')).length).toBe(setCount);
    expect((await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]).toMatchObject({ nextDayIndex: 3, doneDays: [0, 1, 2] });
    expect(await dbAll(page, 'coachLifts')).toEqual([]);
    // the app uses the history: a squat shows last time
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    await expect(exerciseView(page, 'barbell-back-squat').getByTestId('set-last')).toContainText('185');
    expect(errors).toEqual([]);
  });

  test('10 layout and tap targets: coach card, sheets, Settings, effort, Fresh at all sizes @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...rep('barbell-back-squat', [12, 10, 6], BAR200), ...three('barbell-incline-bench-press', 12, BAR135), ...three('overhead-press', 12, lb(95, [25]))]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('barbell-bicep-curl', 9, lb(65, [10])));
    await page.goto('./');
    await page.reload();
    const bad: string[] = [];
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'level_up');
    await tapSize(card.getByRole('button'), 'coach button', bad);
    await card.getByTestId('coach-holding-toggle').tap();
    await expect(page.getByTestId('fresh-muscles')).toBeVisible();
    await noOverflow(page);
    await snap(page, 'v10-today-top');
    await page.getByTestId('fresh-muscles').scrollIntoViewIfNeeded();
    await snap(page, 'v10-today-fresh');
    // Settings
    await page.goto('./#/settings');
    await page.reload();
    await expect(page.getByTestId('settings-coach')).toBeVisible();
    await tapSize(page.getByTestId('settings-coach').locator('label, [role=button]'), 'settings row', bad);
    await page.getByTestId('settings-coach').scrollIntoViewIfNeeded();
    await noOverflow(page);
    await snap(page, 'v10-settings');
    await page.getByTestId('settings-coach').getByText('Auto level up', { exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Auto level up' });
    await expect(sheet).toBeVisible();
    await tapSize(sheet.getByRole('button'), 'auto sheet button', bad);
    await snap(page, 'v10-auto-sheet');
    await sheet.getByRole('button', { name: 'Turn on' }).tap();
    // Wait for the app to close the sheet (it does so after the write is saved) before leaving the page (tester 3.8b).
    await expect(sheet).toHaveCount(0);
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'leveled_up');
    await tapSize(page.getByTestId('coach-card').getByRole('button'), 'leveled button', bad);
    await page.getByTestId('coach-see-changes').tap();
    const list = page.getByRole('dialog', { name: 'Leveled up this week' });
    await expect(list).toBeVisible();
    await tapSize(list.getByRole('button'), 'leveled sheet button', bad);
    await snap(page, 'v10-see-changes');
    console.log('TAP TARGETS UNDER 48:', JSON.stringify(bad));
    expect.soft(bad, 'tap targets under 48').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('10b 130% text on the SE, offline and double tap on Add weight', async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...three('barbell-back-squat', 12, BAR200), ...three('overhead-press', 12, lb(95, [25]))]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'level_up');
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
      const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
      for (const { el, size } of sizes) el.style.fontSize = `${size * 1.3}px`;
    });
    await page.waitForTimeout(300);
    await noOverflow(page);
    await snap(page, 'v10-text130-level-up');
    await page.evaluate(() => document.querySelectorAll<HTMLElement>('body *').forEach((el) => (el.style.fontSize = '')));
    await context.setOffline(true);
    const applyBox = await page.getByTestId('coach-apply').boundingBox();
    await page.getByTestId('coach-apply').dblclick();
    await expect(page.getByText('Added weight to 2 lifts')).toBeVisible();
    const undoBox = await page.getByRole('button', { name: 'Undo' }).first().boundingBox().catch(() => null);
    console.log('DBL apply', JSON.stringify(applyBox), 'undo', JSON.stringify(undoBox), 'toasts', await page.getByText('Added weight to 2 lifts').count(), 'changes', (await dbAll(page, 'coachChanges')).length);
    await page.waitForTimeout(1500);
    const finalChanges = (await dbAll(page, 'coachChanges')).length;
    const targets = (await dbAll<{ target?: unknown }>(page, 'coachLifts')).filter((l) => l.target).length;
    console.log('DBL FINAL changes', finalChanges, 'lifts with target', targets, 'card', await page.getByTestId('coach-card').count());
    expect(finalChanges).toBe(2);
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });

  test('first timer: Start light copy and the number from the first set @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: 'new' } }] });
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('set-guide')).toHaveText("Start light: 10 easy reps, then we'll set your number");
    await expect(view.getByTestId('set-type-chip').filter({ hasText: 'Warm up' })).toHaveCount(0);
    await snap(page, 'v8-first-timer');
    expect(errors).toEqual([]);
  });
});
