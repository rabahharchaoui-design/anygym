import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, navIdle, quickWith, shotOn, usePlan } from './workout-helpers';

// PLAN 3.8 (SPEC 15): the coach. Settings → Coach → Auto level up and its first time sheet, the
// effort tap after the last set, the weekly Level up card (from seeded history, applied with
// loadable rounding), the Leveled up card with Undo per lift, Fresh muscles (absent without sets,
// present with them) and the missed days card that asks before changing the plan.

const DAY = 86_400_000;
const lb = (total: number, perSide: number[]) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide });
const BAR200 = lb(200, [45, 25, 10, 2.5]);
const BAR185 = lb(185, [45, 25]);
const DB25 = { kind: 'dumbbell_each', unit: 'lb', total: 50 };

/** A time in last week (Monday + `day`), local, 18:00. */
function lastWeek(day = 2): number {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back - 7 + day, 18).getTime();
}

type Set = { exerciseId: string; reps: number; load: Record<string, unknown>; kind?: string };
let seq = 0;
async function seedAt(page: Page, startedAt: number, sets: Set[], over: Record<string, unknown> = {}) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `seed-${startedAt}-${seq++}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((s) => s.exerciseId))], ...over }],
    sets: sets.map((s, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: s.exerciseId, order: i, kind: s.kind ?? 'work', reps: s.reps, load: s.load, uncertain: false })),
  });
  return id;
}

const three = (exerciseId: string, reps: number, load: Record<string, unknown>): Set[] => [0, 1, 2].map(() => ({ exerciseId, reps, load }));
/** Last week's squat at the top of 8 to 12 on every set, and a curl today (so it is not a "welcome back"). */
async function earnedWeek(page: Page) {
  await page.goto('./');
  await seedAt(page, lastWeek(2), three('barbell-back-squat', 12, BAR200));
  await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
}

test.describe('the coach (PLAN 3.8)', () => {
  test('Settings → Coach → Auto level up: off by default, plain words, a first time sheet that is honest with no lifts @matrix', async ({ page }) => {
    await page.goto('./#/settings');
    const coach = page.getByTestId('settings-coach');
    const sw = coach.getByRole('switch', { name: /Auto level up/ });
    await expect(sw).not.toBeChecked();
    await expect(coach).toContainText('When you hit all your reps on a lift for a week, AnyGym adds a little weight for next week on its own');
    await expect(coach).toContainText('You can always change any weight.');
    await shotOn(page, '3.8', 'settings-coach');
    await coach.getByText('Auto level up', { exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Auto level up' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('auto-example-none')).toHaveText('No lifts logged yet, so there is no example to show. Once you log a week of workouts, it works on its own.');
    await shotOn(page, '3.8', 'auto-sheet-none');
    // Not now: nothing changes.
    await sheet.getByRole('button', { name: 'Not now' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(sw).not.toBeChecked();
    // Turn on.
    await coach.getByText('Auto level up', { exact: true }).tap();
    await page.getByRole('dialog', { name: 'Auto level up' }).getByRole('button', { name: 'Turn on' }).tap();
    await expect(page.getByRole('dialog', { name: 'Auto level up' })).toHaveCount(0);
    await expect(sw).toBeChecked();
    await expect.poll(async () => (await dbAll<{ coach?: { autoLevelUp?: boolean } }>(page, 'profile'))[0]?.coach?.autoLevelUp).toBe(true);
    // Off and on again: the sheet was seen once, so no sheet the second time.
    await coach.getByText('Auto level up', { exact: true }).tap();
    await expect(sw).not.toBeChecked();
    await coach.getByText('Auto level up', { exact: true }).tap();
    await expect(sw).toBeChecked();
    await expect(page.getByRole('dialog', { name: 'Auto level up' })).toHaveCount(0);
  });

  test('the first time sheet shows one real example from the user’s own lifts', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, Date.now() - DAY, three('barbell-back-squat', 9, BAR185));
    // A real load after seeding behind the app's back (Dexie's live query cache never saw it).
    await page.goto('./#/settings');
    await page.reload();
    await navIdle(page);
    await expect(page.getByTestId('settings-coach').getByRole('switch', { name: /Auto level up/ })).toBeEnabled();
    await page.getByTestId('settings-coach').getByText('Auto level up', { exact: true }).tap();
    const example = page.getByRole('dialog', { name: 'Auto level up' }).getByTestId('auto-example');
    await expect(example).toContainText('Barbell Back Squat');
    await expect(example).toContainText('185 → 195 lb');
    await expect(example).toContainText('next week, once you hit all your reps');
    await shotOn(page, '3.8', 'auto-sheet-example');
  });

  test('the weekly Level up card: hit every rep last week → Add weight → the exercise screen uses it, with why @matrix', async ({ page }) => {
    await earnedWeek(page);
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'level_up');
    await expect(card).toContainText('You hit all your reps on 1 lift last week. Add weight?');
    const row = card.getByTestId('coach-change');
    await expect(row).toContainText('Barbell Back Squat');
    // +5% at least +10 lb on a big leg lift, rounded to plates this gym has.
    await expect(row).toContainText('200 → 210 lb');
    await expect(row).toContainText('+10 lb: you hit 3 × 12 last week');
    // Never more than one coach card.
    await expect(page.getByTestId('coach-card')).toHaveCount(1);
    await shotOn(page, '3.8', 'level-up-card');
    await card.getByTestId('coach-apply').tap();
    await expect(page.getByText('Added weight to 1 lift')).toBeVisible();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    const lifts = await dbAll<{ key: string; target?: { value: number; source: string } }>(page, 'coachLifts');
    expect(lifts.map((l) => [l.key, l.target?.value, l.target?.source])).toEqual([['barbell-back-squat||barbell', 210, 'level_up']]);

    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('set-next')).toHaveText('Beat last time: 8 reps at 210 lb · +10 lb: you hit 3 × 12 last week');
    await expect(view.getByTestId('weight-cell')).toHaveText(['210', '210', '210']);
    await shotOn(page, '3.8', 'exercise-next');
  });

  test('Level up Undo puts it back and the card returns; Not now hides it', async ({ page }) => {
    await earnedWeek(page);
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await card.getByTestId('coach-apply').tap();
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'level_up');
    expect((await dbAll<{ target?: unknown }>(page, 'coachLifts')).filter((l) => l.target)).toEqual([]);
    await page.getByTestId('coach-later').tap();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
  });

  test('Auto level up on: the quiet Leveled up card, See changes, Undo per lift @matrix', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...three('barbell-back-squat', 12, BAR200), ...three('overhead-press', 12, lb(95, [25]))]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('bicep-curl', 9, DB25));
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, coach: { autoLevelUp: true, autoIntroAt: 1 } }] });
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'leveled_up');
    await expect(card.getByTestId('coach-title')).toHaveText('Leveled up 2 lifts for this week');
    await shotOn(page, '3.8', 'leveled-up-card');
    await card.getByTestId('coach-see-changes').tap();
    const sheet = page.getByRole('dialog', { name: 'Leveled up this week' });
    const rows = sheet.getByTestId('coach-change');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Barbell Back Squat' })).toContainText('200 → 210 lb');
    // Upper body: +2.5%, at least +5 lb.
    await expect(rows.filter({ hasText: 'Overhead Press' })).toContainText('95 → 100 lb');
    await shotOn(page, '3.8', 'see-changes');
    await rows.filter({ hasText: 'Overhead Press' }).getByTestId('change-undo').tap();
    await expect(rows.filter({ hasText: 'Overhead Press' }).getByTestId('change-undone')).toHaveText('Back to 95 lb');
    await expect(rows.filter({ hasText: 'Barbell Back Squat' }).getByTestId('change-undo')).toBeVisible();
    await expect
      .poll(async () => (await dbAll<{ exerciseId: string; target?: { value: number } }>(page, 'coachLifts')).map((l) => [l.exerciseId, l.target?.value ?? null]).sort())
      .toEqual([['barbell-back-squat', 210], ['overhead-press', null]]);
    await sheet.getByRole('button', { name: 'Close' }).tap();
    // Hidden for this week once closed with ×; never applied twice.
    await card.getByRole('button', { name: 'Hide this' }).tap();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    expect((await dbAll(page, 'coachChanges')).length).toBe(2);
  });

  test('the effort tap after the last set: one tap, optional, remembered as the default @matrix', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, BAR185));
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('effort')).toHaveCount(0);
    for (let i = 1; i <= 3; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
      if (i < 3) await expect(view.getByTestId('effort')).toHaveCount(0);
    }
    const effort = view.getByTestId('effort');
    await expect(effort).toBeVisible();
    await expect(effort).toContainText('How did that feel?');
    await expect(effort.getByTestId('effort-easy')).toContainText('3+ reps left');
    await effort.getByTestId('effort-good').tap();
    await expect(effort.getByTestId('effort-good')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await dbAll<{ exerciseId: string; effort: string }>(page, 'efforts')).map((e) => [e.exerciseId, e.effort])).toEqual([['barbell-back-squat', 'good']]);
    // 3.8b round 2: an answer moves on to the list after about a second (SPEC 20.2), so the rest of this
    // test reloads onto the exercise first (no chip after a reload: the exercise stays, the answer is kept).
    await page.reload();
    const row = page.getByTestId('row-barbell-back-squat');
    await expect(view.or(row)).toBeVisible();
    if (!(await view.isVisible())) await row.tap();
    await expect(view.getByTestId('effort-good')).toHaveAttribute('aria-pressed', 'true');
    await shotOn(page, '3.8', 'effort');
    // A second tap clears it (skippable).
    await effort.getByTestId('effort-good').tap();
    await expect(effort.getByTestId('effort-good')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await dbAll(page, 'efforts')).length).toBe(0);
    await effort.getByTestId('effort-hard').tap();
    await expect.poll(async () => (await dbAll(page, 'efforts')).length).toBe(1);
  });

  test('Fresh muscles: no logged sets, no card; logged sets shade the map, labelled honestly @matrix', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await expect(page.getByTestId('fresh-muscles')).toHaveCount(0);
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    await expect(page.getByTestId('coach-line')).toHaveCount(0);
    await seedAt(page, Date.now() - 3 * 3_600_000, three('barbell-back-squat', 8, BAR185));
    await seedAt(page, Date.now() - 30 * 3_600_000, three('barbell-bicep-curl', 10, lb(65, [10])));
    await page.goto('./');
    const fresh = page.getByTestId('fresh-muscles');
    await expect(fresh).toBeVisible();
    await expect(fresh).toContainText('Fresh muscles');
    await expect(fresh).toContainText('Based on your logged sets');
    await expect(fresh).toContainText('Under 24 h');
    await expect(fresh).toContainText('1 to 2 days');
    expect(await fresh.locator('[data-band="day"]').count()).toBeGreaterThan(0);
    expect(await fresh.locator('[data-band="two"]').count()).toBeGreaterThan(0);
    await expect(fresh.locator('[data-region="quadriceps"]').first()).toHaveAttribute('data-band', 'day');
    await expect(fresh.locator('[data-region="biceps"]').first()).toHaveAttribute('data-band', 'two');
    await shotOn(page, '3.8', 'fresh');
  });

  test('missed workouts: asks first, never changes the plan on its own; Rebuild the week is real, with Undo @matrix', async ({ page }) => {
    await usePlan(page);
    const before = (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]!;
    // Day 1 and 2 done, the last one 5 days ago: the 5 day plan missed 2 since.
    await dbPut(page, { planState: [{ ...before, nextDayIndex: 2, doneDays: [0, 1] }] });
    await seedAt(page, Date.now() - 5 * DAY, three('barbell-back-squat', 8, BAR185));
    await page.goto('./');
    const card = page.getByTestId('coach-card');
    await expect(card).toHaveAttribute('data-kind', 'missed_days');
    await expect(card).toContainText('Missed 2 workouts');
    await expect(card).toContainText('Nothing changes until you pick.')
    await expect(card.getByTestId('coach-pick-up')).toHaveText('Resume Day 3');
    await expect(card.getByTestId('coach-rebuild')).toHaveText('Restart Day 1');;
    // Nothing changed yet.
    expect((await dbAll<{ nextDayIndex: number }>(page, 'planState'))[0]!.nextDayIndex).toBe(2);
    await shotOn(page, '3.8', 'missed-days');
    await card.getByTestId('coach-rebuild').tap();
    await expect(page.getByText('Week rebuilt: Day 1 is next')).toBeVisible();
    await expect.poll(async () => (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]).toMatchObject({ nextDayIndex: 0, doneDays: [] });
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(async () => (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]).toMatchObject({ nextDayIndex: 2, doneDays: [0, 1] });
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'missed_days');
    await page.getByTestId('coach-pick-up').tap();
    await expect(page.getByText('Picking up with Day 3')).toBeVisible();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    expect((await dbAll<{ nextDayIndex: number }>(page, 'planState'))[0]!.nextDayIndex).toBe(2);
  });

  test('warm ups added to the first big lift for an experienced lifter: own rows, never a planned set, logged as warm ups', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, Date.now() - 3 * DAY, three('barbell-back-squat', 10, BAR185));
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: '3y' } }] });
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    const todo = view.getByTestId('set-todo');
    // Empty bar × 10, about 50% × 5, about 75% × 3 of today's 185, then the 3 planned sets.
    await expect(todo.getByTestId('weight-cell')).toHaveText(['45', '90', '140', '185', '185', '185']);
    await expect(todo.getByTestId('reps-cell')).toHaveText(['10', '5', '3', '11', '10', '10']);
    await expect(todo.nth(0).getByTestId('set-type-chip')).toHaveText('Warm up');
    await expect(view.getByTestId('set-target')).toHaveText('Set 1 of 3 · 8 to 12 reps');
    await shotOn(page, '3.8', 'warm-ups');
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await expect.poll(async () => (await dbAll<{ id: string; kind: string; reps: number }>(page, 'sets')).filter((x) => !x.id.startsWith('seed-')).map((x) => [x.kind, x.reps])).toEqual([['warmup', 10]]);
    await expect(todo.getByTestId('weight-cell')).toHaveText(['90', '140', '185', '185', '185']);
    // Skipping a warm up (Remove set) never takes a planned set away.
    await todo.nth(0).getByTestId('set-type').tap();
    await page.getByRole('dialog', { name: /Set/ }).getByTestId('remove-set').tap();
    await expect(todo.getByTestId('weight-cell')).toHaveText(['140', '185', '185', '185']);
  });

  test('first timers: no fake number, a light test set, then the number from it', async ({ page }) => {
    await page.goto('./');
    await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: 'new' } }] });
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('set-guide')).toHaveText("Start light: 10 easy reps, then we'll set your number");
    await expect(view.getByTestId('set-todo').getByTestId('reps-cell')).toHaveText(['10', '8', '8']);
    await expect(view.getByTestId('set-todo').getByTestId('weight-cell').first()).not.toHaveText(/\d/);
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    // 10 easy reps at 95 lb, aiming at 8 with 2 to spare: 105 lb, loadable here.
    await expect(view.getByTestId('coach-number')).toHaveText('Your number: 105 lb for the rest of your sets');
    await expect(view.getByTestId('set-todo').getByTestId('weight-cell')).toHaveText(['105', '105']);
    await shotOn(page, '3.8', 'first-timer');
  });

  test('130% text: the coach card, Fresh muscles, See changes, the effort tap and Settings never clip', async ({ page }) => {
    await page.goto('./');
    await seedAt(page, lastWeek(1), [...three('barbell-back-squat', 12, BAR200), ...three('overhead-press', 12, lb(95, [25]))]);
    await seedAt(page, Date.now() - 2 * 3_600_000, three('barbell-bicep-curl', 9, lb(65, [10])));
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'level_up');
    await expect(page.getByTestId('fresh-muscles')).toBeVisible();
    const found: string[] = [];
    await audit(page, 'Today', found);
    await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, coach: { autoLevelUp: true, autoIntroAt: 1 } }] });
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'leveled_up');
    await audit(page, 'Leveled up', found);
    await page.getByTestId('coach-see-changes').tap();
    await expect(page.getByRole('dialog', { name: 'Leveled up this week' })).toBeVisible();
    await audit(page, 'See changes', found);
    await page.goto('./#/settings');
    await page.reload();
    await expect(page.getByTestId('settings-coach')).toBeVisible();
    await audit(page, 'Settings', found);
    expect(found).toEqual([]);
  });
});

async function scaleText(page: Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(150);
}

/** Text clipped inside an overflow hidden or ellipsis box, or a page that scrolls sideways (the text-130 spec's rule). */
async function audit(page: Page, screen: string, found: string[]) {
  await page.waitForTimeout(500);
  await scaleText(page);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.closest('[aria-hidden="true"], [inert], [data-skeleton]')) continue;
      if (/_digit_/.test(el.className)) continue;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden') continue;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()) || /^H[1-6]$/.test(el.tagName);
      if (!hasText) continue;
      const hides = !el.closest('[data-truncate-ok]') && (/(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis');
      if (!hides && !/^H[1-6]$/.test(el.tagName)) continue;
      if (el.scrollWidth > el.clientWidth + 1 || (/(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1)) out.push(`${el.tagName}.${el.className} "${(el.textContent ?? '').trim().slice(0, 40)}"`);
    }
    if (document.documentElement.scrollWidth > innerWidth) out.push(`page scrolls sideways ${document.documentElement.scrollWidth} > ${innerWidth}`);
    return out;
  });
  for (const b of bad) found.push(`${screen}: ${b}`);
  await page.evaluate(() =>
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      el.style.fontSize = '';
      el.style.lineHeight = '';
    }),
  );
}
