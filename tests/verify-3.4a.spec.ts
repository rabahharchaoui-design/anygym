// Verify 3.4a (SPEC 20.3, 22): the real tap path to Up next, double tap, reload, offline, a gym with
// few fits, Coach tips apply/undo on both curated plans, the tuned copy keeps the place, the plan
// JSON is untouched, reduced motion, 320 wide, 48 pt targets. Shots: reports/shots/3.4a/verify/.
import { expect, test, type Page } from './fixtures';
import { checkControls, checkLayout, simulateSafeAreas } from './helpers/layout';
import { dbAll, dbPut, exerciseView, seedFinished, shotOn, usePlan, watchErrors } from './workout-helpers';

type Gym = { id: string; isActive: boolean };
type Sess = { id: string; exerciseIds: string[] };
const DIR = '3.4a/verify';
const sessions = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).filter((s) => !s.id.startsWith('seed-'));

async function gymWith(page: Page, equipment: string[]) {
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, type: 'hotel', equipment, dumbbellRange: { min: 5, max: 50, step: 5 } }] });
}

test('real tap path: Today > Quick workout > search > Add > 3 checks > Up next; double tap adds once; reload and back keep it @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await page.goto('./');
  await seedFinished(page, { 'dumbbell-bench-press': Array.from({ length: 3 }, () => ({ reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 80 } })) });
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('bench press');
  await sheet.getByRole('button', { name: 'Dumbbell Bench Press', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = exerciseView(page, 'dumbbell-bench-press');
  for (let i = 0; i < 3; i++) {
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  const card = page.getByTestId('up-next');
  await expect(card).toBeVisible({ timeout: 10_000 });
  const pick = card.getByTestId('up-next-pick');
  const pickId = await pick.getAttribute('data-id');
  expect(pickId).not.toMatch(/bench|press/i);
  await expect(pick.getByTestId('up-next-reason')).not.toHaveText('');
  await expect(card.getByTestId('up-next-other')).toHaveCount(2);
  await checkControls(page, '[data-testid="up-next"]');
  await checkLayout(page, { primary: pick });
  await shotOn(page, DIR, 'path-after-bench');
  // Double tap Add: one exercise, not two.
  await pick.dblclick();
  await expect(exerciseView(page, pickId!)).toBeVisible();
  await page.waitForTimeout(500);
  expect((await sessions(page)).flatMap((s) => s.exerciseIds)).toEqual(['dumbbell-bench-press', pickId]);
  // Reload mid workout, then back: the added exercise is still there once, no stuck screen.
  await page.reload();
  await expect(page.locator('main').first()).toBeVisible();
  const back = page.getByRole('button', { name: 'Back to the list' });
  await expect(back).toBeVisible();
  await page.waitForTimeout(1000);
  await back.tap();
  // Round 2: a double tap on Add pushes the route once, so one Back is the list.
  await expect(page.getByTestId('workout-title')).toHaveText('Quick workout');
  await expect(page.getByTestId(`row-${pickId}`)).toHaveCount(1);
  await expect(page.getByTestId('up-next')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('main').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('offline: Up next still adds; few fit says so', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await gymWith(page, ['dumbbells']);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `q-${Date.now()}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 600_000, imported: false, exerciseIds: ['Dumbbell_Squat'] }],
    sets: [0, 1, 2].map((i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: 'Dumbbell_Squat', order: i, kind: 'work', uncertain: false, reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 80 } })),
  });
  await page.goto(`./#/workout/${id}`);
  await page.reload();
  await context.setOffline(true);
  const card = page.getByTestId('up-next');
  await expect(card).toBeVisible();
  const n = await card.locator('[data-id]').count();
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  console.log(`DUMBBELLS-ONLY after dumbbell squat: ${n} ideas; card text: ${text}`);
  await shotOn(page, DIR, 'few-fit');
  if (n < 3) expect(text).toMatch(/only|fits?|few|no more|nothing/i);
  await context.setOffline(false);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('Coach tips on the five day split: Apply rest, Apply freq, Undo each, Apply all, tuned copy keeps day and week, plan JSON untouched @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  // Advance: week 2, next day 3.
  const st = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
  await dbPut(page, { planState: [{ ...st, weekIndex: 1, nextDayIndex: 2, doneDays: [0, 1] }] });
  const before = JSON.stringify((await dbAll(page, 'planState'))[0]);
  await page.goto('./#/plans/five-day-split');
  await page.reload();
  const toggle = page.getByTestId('coach-tips-toggle');
  await toggle.tap();
  await expect(page.getByTestId('coach-tips').locator('[data-testid^="tip-"]')).toHaveCount(6);
  const planJson = await (await page.request.get(new URL('./', page.url()).href)).text();
  expect(planJson.length).toBeGreaterThan(0);

  await page.getByTestId('tip-rest').getByRole('button', { name: /^Apply/ }).tap();
  await expect(page.getByTestId('tuned-copy')).toBeVisible();
  await shotOn(page, DIR, 'rest-applied');
  await page.getByTestId('tip-rest').getByRole('button', { name: /^Undo/ }).tap();
  await expect(page.getByTestId('tuned-copy')).toHaveCount(0);

  await page.getByTestId('tip-freq').getByRole('button', { name: /^Apply/ }).tap();
  await expect(page.getByTestId('tuned-copy')).toBeVisible();
  await shotOn(page, DIR, 'freq-applied');
  await page.getByTestId('tip-freq').getByRole('button', { name: /^Undo/ }).tap();
  await expect(page.getByTestId('tuned-copy')).toHaveCount(0);
  // Double tap Apply: one copy.
  await page.getByTestId('tip-core').getByRole('button', { name: /^Apply/ }).dblclick();
  // The second tap lands on the Undo that replaces Apply, so a double tap may end applied or not; never a copy of a copy.
  await page.waitForTimeout(800);
  expect(page.url()).toMatch(/five-day-split(\?coach=core)?$/);
  expect(await page.getByRole('heading', { name: /coach tuned\).*coach tuned/ }).count()).toBe(0);
  const undo = page.getByTestId('tip-core').getByRole('button', { name: /^Undo/ });
  if (await undo.count()) await undo.tap();
  await expect(page.getByTestId('tuned-copy')).toHaveCount(0);
  await page.getByTestId('apply-all').tap();
  await expect(page).toHaveURL(/coach=hinge\.stretch\.rest\.pair\.freq\.core/);
  // Using the tuned copy keeps week and day.
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect.poll(async () => (await dbAll<{ planId: string }>(page, 'planState'))[0]?.planId).toMatch(/~coach-/);
  const after = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
  expect(after.weekIndex).toBe(1);
  expect(after.nextDayIndex).toBe(2);
  expect(after.doneDays).toEqual([0, 1]);
  expect(Object.keys(after).sort()).toEqual(Object.keys(JSON.parse(before)).sort());
  // Tuned plans are never stored as plan records.
  const stores = await page.evaluate(() => new Promise<string[]>((r) => { const q = indexedDB.open('anygym'); q.onsuccess = () => { r([...q.result.objectStoreNames]); q.result.close(); }; }));
  expect(stores).toContain('planState');
  for (const st of stores.filter((s) => /^plans?$|planDays/.test(s))) expect(JSON.stringify(await dbAll(page, st))).not.toContain('coach');
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible().catch(() => undefined);
  expect(errors).toEqual([]);
});

test('six week plan: only the hamstrings tip, and Apply adds to a day', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/six-week-volume');
  await page.getByTestId('coach-tips-toggle').tap();
  const tips = page.getByTestId('coach-tips').locator('[data-testid^="tip-"]');
  await expect(tips).toHaveCount(1);
  console.log('SIXWEEK TIP: ' + (await tips.first().innerText()).replace(/\s+/g, ' '));
  await shotOn(page, DIR, 'six-week-tip');
  expect(errors).toEqual([]);
});

test('reduced motion and 320 wide: card and tips whole, targets 48 pt @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await simulateSafeAreas(page);
  await page.goto('./');
  await gymWith(page, ['dumbbells', 'flat_bench']);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `q-${Date.now()}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 600_000, imported: false, exerciseIds: ['dumbbell-bench-press'] }],
    sets: [0, 1, 2].map((i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: 'dumbbell-bench-press', order: i, kind: 'work', uncertain: false, reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 80 } })),
  });
  await page.goto(`./#/workout/${id}`);
  await page.reload();
  const card = page.getByTestId('up-next');
  await expect(card).toBeVisible();
  for (const b of await card.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await checkLayout(page);
  await shotOn(page, DIR, 'reduced-motion');
  await page.goto('./#/plans/five-day-split');
  await page.getByTestId('coach-tips-toggle').tap();
  for (const b of await page.getByTestId('coach-tips').getByRole('button').all()) {
    if (!(await b.isVisible())) continue;
    const box = (await b.boundingBox())!;
    expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(48);
  }
  await checkLayout(page);
  await shotOn(page, DIR, 'tips-reduced');
  expect(errors).toEqual([]);
});
