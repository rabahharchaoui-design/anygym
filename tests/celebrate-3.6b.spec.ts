// PLAN 3.6b: the celebration engine in the gym. SMALL in the set row (never blocks a tap), MEDIUM on
// the finish screen with the exact real numbers, BIG once for a rare moment (any tap skips), one
// BIG per workout, reduced motion keeps the words, a tie or a warm up celebrates nothing, the BIG
// holds its frames and nothing on the finish screen moves when it settles.
import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';
import { SAME_SPOT_MS } from '../src/lib/warmUpFold';
import { framesFloor, idleFrames, idleNote, p90Budget } from './helpers/frames';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, fillReps, loggedRows, navIdle, pickExercises, seedFinished, watchErrors, type SeedSet } from './workout-helpers';

const SHOTS = 'reports/shots/3.6b';
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name.replace(/ /g, '-')}-${name}.png` });

const bar = (total: number) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });
const SQUAT = 'barbell-back-squat';
const ROW = 'barbell-bent-over-row';

/** A workout finished a minute ago, written straight into the database; returns its id. */
async function seedToday(page: Page, exercises: Record<string, SeedSet[]>): Promise<string> {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const start = Date.now() - 45 * 60_000;
  const id = `today-${start}`;
  const sets: unknown[] = [];
  let order = 0;
  for (const [exerciseId, list] of Object.entries(exercises)) {
    for (const s of list) sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId, order: order++, kind: s.kind ?? 'work', uncertain: false, load: s.load, reps: s.reps });
  }
  await dbPut(page, { sessions: [{ id, gymId: gym.id, startedAt: start, endedAt: start + 44 * 60_000, imported: false, exerciseIds: Object.keys(exercises) }], sets });
  return id;
}

/** Opens a finished workout's finish screen (once: a second visit would find its BIG already shown). */
async function openFinish(page: Page, id: string) {
  await page.goto(`./#/workout/${id}/done`);
  await expect(page.getByTestId('finish-title')).toBeVisible();
}

const big = (page: Page) => page.getByTestId('celebrate-big');
const particles = (scope: Page | Locator) => scope.getByTestId('celebrate-particles');
const rect = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return [b.x, b.y, b.width, b.height];
};
/** Two boxes of named parts are the same place: within 0.5 px (a phone's pixel grid rounds a fractional row to either side). */
const samePlaces = (a: Record<string, number[]>, b: Record<string, number[]>) => {
  expect(Object.keys(a)).toEqual(Object.keys(b));
  for (const k of Object.keys(a)) a[k]!.forEach((v, i) => expect(Math.abs(v - b[k]![i]!), `${k} [${i}]`).toBeLessThanOrEqual(0.5));
};

test.describe('3.6b celebrations', () => {
  test('SMALL: a heavier set shows New best in its row, the check draws, and the next tap is never blocked; Finish shows MEDIUM with the real numbers', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { [SQUAT]: [{ reps: 5, load: bar185 }] });
    await page.reload();
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, SQUAT);
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
    await fillReps(view, view.getByTestId('set-todo').first(), 6);
    await checkCurrent(view).tap();
    // The very next tap, with no wait for the check's animation: the second row logs. (A tap on the same spot inside
    // SAME_SPOT_MS is a double tap by design: the table may scroll the next row under the first one's spot.)
    await page.waitForTimeout(SAME_SPOT_MS + 30);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const first = loggedRows(view).first();
    await expect(first.getByTestId('pr-badge')).toBeVisible();
    await expect(first.getByTestId('pr-badge')).toHaveText('New best');
    // The drawn check is the shared one (src/ui/celebrate): a picture, not a control.
    await expect(first.locator('svg[class*="check"]')).toHaveAttribute('aria-hidden', 'true');
    // Nothing full screen while the workout is going on.
    await expect(big(page)).toHaveCount(0);
    await shot(page, 'small-row');

    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible()) await skip.tap({ timeout: 2000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page).toHaveURL(/\/done$/);
    const win = page.getByTestId('finish-win');
    await expect(win).toBeVisible();
    await expect(win).toHaveAttribute('data-tier', 'medium');
    await expect(win.getByText('Barbell Back Squat', { exact: true })).toBeVisible();
    await expect(win.getByText('185 lb × 6, your best yet', { exact: true })).toBeVisible();
    await expect(win.getByTestId('celebrate-plus')).toHaveText('+1 rep');
    // A rep record is not a rare moment: no full screen.
    await expect(big(page)).toHaveCount(0);
    await page.waitForTimeout(1200);
    await expect(particles(page)).toHaveCount(0); // the burst is over and gone
    await shot(page, 'medium-finish');
    await page.getByRole('button', { name: 'Done' }).tap();
    await expect(page).toHaveURL(/#\/$/);
    expect(errors).toEqual([]);
  });

  test('MEDIUM: an accessory record is a card with the exact numbers and a burst', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { 'bicep-curl': [{ reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 40, each: 20 } }] });
    const id = await seedToday(page, { 'bicep-curl': [{ reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 50, each: 25 } }] });
    await page.goto(`./#/workout/${id}/done`);
    const win = page.getByTestId('finish-win');
    await expect(win).toBeVisible();
    // The burst is on screen while the card arrives, then leaves the page.
    await expect(particles(win)).toHaveCount(1);
    await expect(win).toContainText('25 lb each × 10');
    await expect(win.getByTestId('celebrate-plus')).toHaveText('+5 lb each');
    await expect(big(page)).toHaveCount(0);
    await expect(particles(page)).toHaveCount(0, { timeout: 4000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('BIG: the first workout takes the screen once; a tap skips it and never presses what is under it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    const id = await seedToday(page, { [SQUAT]: [{ reps: 5, load: bar(185) }, { reps: 5, load: bar(185) }] });
    await openFinish(page, id);
    await expect(big(page)).toHaveCount(1);
    await expect(big(page)).toHaveAttribute('data-phase', 'in');
    await expect(big(page)).toContainText('First workout');
    await expect(big(page).getByTestId('celebrate-hero')).toHaveText('1,850 lb');
    await expect(big(page)).toContainText('lifted today');
    // The first workout never borrows record words, and there is no record card.
    await expect(big(page)).not.toContainText(/best|heaviest|record/i);
    await expect(page.getByTestId('finish-win')).toHaveCount(0);
    await page.waitForTimeout(350);
    await shot(page, 'big-first-workout');
    // A tap where Done is: it skips, and the app stays on the finish screen.
    const done = (await page.getByRole('button', { name: 'Done' }).boundingBox())!;
    await page.touchscreen.tap(done.x + done.width / 2, done.y + done.height / 2);
    await expect(big(page)).toHaveCount(0, { timeout: 1500 });
    await expect(page).toHaveURL(/\/done$/);
    await expect(page.getByTestId('finish-total')).toHaveText('1,850 lb');
    await page.waitForTimeout(300);
    await shot(page, 'big-first-settled');
    // Once: a reload never replays it.
    await page.reload();
    await expect(page.getByTestId('finish-title')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(big(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).tap();
    await expect(page).toHaveURL(/#\/$/);
    expect(errors).toEqual([]);
  });

  test('two records on main lifts: one BIG (the bigger gain), the other MEDIUM; nothing moves when it settles; frames stay smooth', async ({ page }) => {
    const errors = watchErrors(page);
    // Frame gaps, sampled with requestAnimationFrame for as long as the BIG is on screen.
    await page.addInitScript(() => {
      const w = window as unknown as { __gaps: number[]; __on: boolean };
      w.__gaps = [];
      w.__on = true;
      let last = 0;
      const loop = (t: number) => {
        if (last && document.querySelector('[data-testid="celebrate-big"][data-phase="in"]')) w.__gaps.push(t - last);
        last = t;
        if (w.__on) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.goto('./');
    await seedFinished(page, { [SQUAT]: [{ reps: 5, load: bar(185) }], [ROW]: [{ reps: 8, load: bar(135) }] });
    const id = await seedToday(page, { [SQUAT]: [{ reps: 5, load: bar(195) }], [ROW]: [{ reps: 8, load: bar(155) }] });
    await page.goto(`./#/workout/${id}/done`);
    await expect(big(page)).toHaveCount(1);
    await expect(big(page)).toHaveAttribute('data-kind', 'lift_record');
    // The row gained 20 lb on 135, the squat 10 on 185: the row is the BIG.
    await expect(big(page)).toContainText('Barbell Bent Over Row');
    await expect(big(page).getByTestId('celebrate-hero')).toHaveText('155 lb');
    await expect(big(page)).toContainText('Heaviest ever');
    await expect(big(page)).toContainText('+20 lb');
    await expect(particles(big(page))).toHaveCount(1);
    // Under it the finish screen is already whole, in its final place.
    const parts = ['finish-title', 'finish-win', 'finish-duration', 'finish-sets', 'finish-total', 'finish-exercise', 'pr-chip'];
    const read = async () => Object.fromEntries(await Promise.all(parts.map(async (p) => [p, await rect(page.getByTestId(p).first())] as const)));
    // The screen change itself (the push slide) is done first: on a slow host it still runs 650 ms in.
    await navIdle(page);
    await page.waitForTimeout(650);
    const readAll = async (): Promise<Record<string, number[]>> => ({ ...(await read()), done: await rect(page.getByRole('button', { name: 'Done' })) });
    // Where the cards rest under the BIG: the card's own arrival (a hair of scale) can still be running on a slow host, so read until two reads agree.
    let before = await readAll();
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(100);
      const again = await readAll();
      const still = Object.keys(again).every((k) => again[k]!.every((v, j) => Math.abs(v - before[k]![j]!) < 0.05));
      before = again;
      if (still) break;
    }
    await shot(page, 'big-lift-record');
    // It leaves on its own and settles into its card.
    const shownAt = Date.now();
    await expect(big(page)).toHaveCount(0, { timeout: 5000 });
    // The whole BIG (count up, burst, hold, settle) is about 1.4 s; never more than 2 s from here (it was 2.9 s).
    expect(Date.now() - shownAt).toBeLessThan(1700);
    const gaps = await page.evaluate(() => {
      const w = window as unknown as { __gaps: number[]; __on: boolean };
      w.__on = false;
      return [...w.__gaps].sort((a, b) => a - b);
    });
    await page.waitForTimeout(500);
    const after = await readAll();
    samePlaces(after, before);
    // Exactly one BIG, one MEDIUM for the other record, in the cards.
    const win = page.getByTestId('finish-win');
    await expect(win).toContainText('Barbell Bent Over Row');
    await expect(win).toContainText('155 lb × 8, heaviest ever');
    await expect(win.getByTestId('celebrate-plus')).toHaveText('+20 lb');
    expect(Number(await win.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
    await expect(page.getByTestId('pr-chip')).toHaveCount(1);
    await expect(page.getByTestId('pr-chip')).toContainText('Barbell Back Squat');
    await expect(page.getByTestId('pr-chip')).toContainText('195 lb × 5, heaviest ever');
    await expect(page.getByTestId('pr-chip').getByTestId('celebrate-plus')).toHaveText('+10 lb');
    await shot(page, 'big-lift-settled');
    // Smooth: 9 frames in 10 inside 20 ms (60 fps is 16.7), sampled with requestAnimationFrame.
    // 60 fps budgets; a host whose empty page cannot draw that widens them by its own cost (helpers/frames.ts).
    const idle = await idleFrames(page);
    expect(gaps.length).toBeGreaterThan(framesFloor(60, 1400, idle));
    const p90 = gaps[Math.floor(gaps.length * 0.9)]!;
    console.log(`${test.info().project.name}: ${idleNote(idle)}`);
    console.log(`${test.info().project.name}: BIG frames ${gaps.length}, p50 ${gaps[Math.floor(gaps.length / 2)]!.toFixed(1)} ms, p90 ${p90.toFixed(1)} ms, max ${gaps[gaps.length - 1]!.toFixed(1)} ms`);
    // One shot (a BIG shows once per workout), so a few ms more than the best of three used elsewhere.
    expect(p90).toBeLessThan(p90Budget(20, idle, 6));
    expect(errors).toEqual([]);
  });

  test('reduced motion: the same words, no particles, a fade', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await seedFinished(page, { [SQUAT]: [{ reps: 5, load: bar(185) }], [ROW]: [{ reps: 8, load: bar(135) }] });
    const id = await seedToday(page, { [SQUAT]: [{ reps: 5, load: bar(195) }], [ROW]: [{ reps: 8, load: bar(155) }] });
    await openFinish(page, id);
    await expect(big(page)).toHaveCount(1);
    await expect(big(page)).toContainText('Barbell Bent Over Row');
    await expect(big(page).getByTestId('celebrate-hero')).toHaveText('155 lb');
    await expect(big(page)).toContainText('Heaviest ever');
    await expect(big(page)).toContainText('+20 lb');
    await expect(particles(page)).toHaveCount(0);
    // No travel: the number stays where it is while it fades.
    const hero = big(page).getByTestId('celebrate-hero');
    const at = await rect(hero);
    await page.waitForTimeout(600);
    await shot(page, 'reduced-big');
    // A tap on the number skips it (a plain touch, so no waiting for a screen that fades on its own: the shot above can take a while on a busy machine).
    await page.touchscreen.tap(at[0]! + at[2]! / 2, at[1]! + at[3]! / 2);
    expect(await rect(hero).catch(() => at)).toEqual(at);
    await expect(big(page)).toHaveCount(0, { timeout: 4000 });
    await expect(page.getByTestId('finish-win')).toContainText('155 lb × 8, heaviest ever');
    await expect(page.getByTestId('pr-chip')).toContainText('195 lb × 5, heaviest ever');
    await expect(particles(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('honest: a tie and a heavier warm up celebrate nothing', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { [SQUAT]: [{ reps: 5, load: bar(185) }] });
    const id = await seedToday(page, { [SQUAT]: [{ reps: 5, load: bar(225), kind: 'warmup' }, { reps: 5, load: bar(185) }] });
    await openFinish(page, id);
    await page.waitForTimeout(600);
    await expect(big(page)).toHaveCount(0);
    await expect(page.getByTestId('finish-win')).toHaveCount(0);
    await expect(page.getByTestId('pr-chip')).toHaveCount(0);
    await expect(particles(page)).toHaveCount(0);
    await expect(page.getByTestId('finish-exercise')).toContainText('185 lb × 5');
    expect(errors).toEqual([]);
  });
  test('extremes: a nine digit total fits its tile, the hero and the gain use thousands', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    // First workout, 123,456,789 lb in one set: the tile and the hero say the same short, honest form.
    const id = await seedToday(page, { [SQUAT]: [{ reps: 1, load: bar(123_456_789) }] });
    await openFinish(page, id);
    await expect(big(page).getByTestId('celebrate-hero')).toHaveText('123M lb');
    await expect(page.getByTestId('finish-total')).toHaveText('123M lb');
    await page.waitForTimeout(700);
    const fits = await page.getByTestId('finish-total').evaluate((el) => {
      const tile = el.parentElement!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { scroll: el.scrollWidth <= el.clientWidth + 1, inside: r.left >= tile.left - 1 && r.right <= tile.right + 1 };
    });
    expect(fits).toEqual({ scroll: true, inside: true });
    await big(page).tap();
    // A record over 1,000 lb: the big number and the gain are grouped like the tiles.
    await page.goto('./');
    await seedFinished(page, { [ROW]: [{ reps: 1, load: bar(1000) }] });
    const id2 = await seedToday(page, { [ROW]: [{ reps: 1, load: bar(2205) }] });
    await openFinish(page, id2);
    await expect(big(page).getByTestId('celebrate-hero')).toHaveText('2,205 lb');
    await expect(big(page)).toContainText('+1,205 lb');
    expect(errors).toEqual([]);
  });
});
