import { expect, test, type Page } from './fixtures';
import { generateHistory, seedHistory, type History } from './helpers/history-fixture';
import { usePlan } from './workout-helpers';

// SPEC 13.3: two years of generated history (tests/helpers/history-fixture.ts) keep History,
// progression and Today fast and correct. SPEC 10: anything over 150 ms shows a skeleton, so a
// screen is never blank: a skeleton or the first row is up within 150 ms of the screen mounting,
// and the real rows follow within 1.5 s of the tap even with ~300 workouts and ~4000 sets.

const SKELETON_MS = 150;
const FIRST_ROW_MS = 1500;

/**
 * Taps a main tab in the page and times, from the tap: `mounted` (the new screen's heading is in
 * the DOM; before that the old screen stays on screen during the view transition, never a blank),
 * `any` (a skeleton or real content) and `real` (the first `ready` element). Polls with a timer,
 * since rendering (and rAF) pauses while a view transition captures.
 */
async function timeTab(page: Page, tab: string, ready: string) {
  return page.evaluate(
    async ({ tab, ready }) => {
      const link = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a')].find((a) => a.textContent?.trim() === tab)!;
      const t0 = performance.now();
      link.click();
      let mounted = -1;
      let any = -1;
      let real = -1;
      await new Promise<void>((resolve) => {
        const iv = setInterval(() => {
          const now = performance.now() - t0;
          if (mounted < 0 && [...document.querySelectorAll('h1')].some((h) => h.textContent?.trim() === tab)) mounted = now;
          const hit = document.querySelector(ready);
          if (mounted >= 0 && any < 0 && (hit || document.querySelector('main [data-skeleton]'))) any = now;
          if (hit && any >= 0) real = now;
          if (real >= 0 || now > 10_000) {
            clearInterval(iv);
            resolve();
          }
        }, 2);
      });
      return { mounted, any, real };
    },
    { tab, ready },
  );
}

test('the generator is deterministic and has the right shape', () => {
  const gym = { id: 'g', unit: 'lb', createdAt: 1 } as never;
  const now = Date.UTC(2026, 9, 24);
  const a = generateHistory(gym, { now });
  const b = generateHistory(gym, { now });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(JSON.stringify(generateHistory(gym, { now, seed: 7 }))).not.toBe(JSON.stringify(a));
  expect(a.sessions.length).toBeGreaterThanOrEqual(280);
  expect(a.sessions.length).toBeLessThanOrEqual(330);
  expect(a.sets.length).toBeGreaterThanOrEqual(3500);
  expect(a.sets.length).toBeLessThanOrEqual(4800);
  const real = a.sessions.filter((s) => !s.imported);
  expect(Math.min(...real.map((s) => s.startedAt))).toBeLessThan(now - 700 * 86_400_000);
  expect(new Set(real.map((s) => s.planId))).toEqual(new Set(['five-day-split', 'six-week-volume']));
  expect(new Set(a.sessions.map((s) => s.gymId))).toEqual(new Set(['g', a.kgGym.id]));
  expect(a.kgGym.unit).toBe('kg');
  expect(a.sessions.filter((s) => s.imported).length).toBeGreaterThan(0);
  for (const kind of ['warmup', 'drop', 'work'] as const) expect(a.sets.some((s) => s.kind === kind)).toBe(true);
  expect(a.sets.some((s) => s.load?.unit === 'kg')).toBe(true);
  expect(a.sets.some((s) => s.seconds !== undefined)).toBe(true);
  // Every set belongs to a session, orders are unique per session, every load is real.
  const ids = new Set(a.sessions.map((s) => s.id));
  expect(a.sets.every((s) => ids.has(s.sessionId) && !!s.load && s.load.total >= 0)).toBe(true);
  expect(new Set(a.sets.map((s) => `${s.sessionId}#${s.order}`)).size).toBe(a.sets.length);
});

test.describe('two years of history @matrix', () => {
  let h: History;
  test.beforeEach(async ({ page }) => {
    await usePlan(page);
    h = await seedHistory(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  });

  test('History: a skeleton or the first row within 150 ms, every workout listed, newest first, detail exact', async ({ page }) => {
    const t = await timeTab(page, 'History', '[data-testid="history-row"]');
    console.log(`history: mounted ${t.mounted.toFixed(0)} ms, skeleton or row ${t.any.toFixed(0)} ms, first row ${t.real.toFixed(0)} ms`);
    expect(t.mounted).toBeGreaterThanOrEqual(0);
    expect(t.any - t.mounted).toBeLessThanOrEqual(SKELETON_MS);
    expect(t.real).toBeGreaterThanOrEqual(0);
    expect(t.real).toBeLessThanOrEqual(FIRST_ROW_MS);
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(h.sessions.length);
    // Newest first: the first row opens the newest workout, with exactly its sets.
    const newest = [...h.sessions].sort((a, b) => b.startedAt - a.startedAt)[0]!;
    const count = h.sets.filter((s) => s.sessionId === newest.id).length;
    await expect(rows.first()).toContainText(`${count} sets`);
    await rows.first().tap();
    await expect(page).toHaveURL(new RegExp(`#/history/${newest.id}$`));
    await expect(page.getByTestId('history-set')).toHaveCount(count);
    // No horizontal scroll with a long list.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test('progression: Last time is the newest squat session, exactly', async ({ page }) => {
    const squat = h.sets.filter((s) => s.exerciseId === 'barbell-back-squat' && s.kind === 'work' && !s.uncertain);
    const sessions = new Map(h.sessions.map((s) => [s.id, s]));
    const newestId = [...new Set(squat.map((s) => s.sessionId))].sort((a, b) => sessions.get(b)!.startedAt - sessions.get(a)!.startedAt)[0]!;
    const last = squat.filter((s) => s.sessionId === newestId).sort((a, b) => a.order - b.order);
    const expected = `Last time ${last.map((s) => `${s.reps} × ${s.load!.total}`).join(' · ')} ${last[0]!.load!.unit}`;

    const t0 = Date.now();
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Add exercise' });
    await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
    await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
    await sheet.getByRole('button', { name: 'Add 1' }).tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await expect(view.getByTestId('set-guide')).toContainText(expected);
    await expect(view.getByTestId('check-current')).toBeEnabled();
    console.log(`progression with 2 years: ${Date.now() - t0} ms to a ready exercise view`);
  });

  test('Today: a skeleton or the plan card within 150 ms of the screen, the card soon after', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).tap();
    await expect(page.getByTestId('history-row').first()).toBeVisible();
    const t = await timeTab(page, 'Today', '[data-testid="day-card-title"]');
    console.log(`today: mounted ${t.mounted.toFixed(0)} ms, skeleton or card ${t.any.toFixed(0)} ms, plan card ${t.real.toFixed(0)} ms`);
    expect(t.mounted).toBeGreaterThanOrEqual(0);
    expect(t.any - t.mounted).toBeLessThanOrEqual(SKELETON_MS);
    expect(t.real).toBeLessThanOrEqual(FIRST_ROW_MS);
    // The seeded history does not move the plan pointer: Today still offers day 1 of the plan it uses.
    await expect(page.getByTestId('day-card-title')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  });
});
