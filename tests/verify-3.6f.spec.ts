// PLAN 3.6f: real phone intake, saved priorities, weekly choices and recovery. The helper runs these.
import { test, expect, type Page } from './fixtures';
import { touchDragVertical } from './helpers/touch';
import { checkLayout, rootAtRest, simulateSafeAreas } from './helpers/layout';
import { dbAll, dbPut } from './workout-helpers';

test.use({ intake: 'fresh', video: 'on' });
test.describe.configure({ retries: 0 });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));
const step = (page: Page, name: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', name);
const next = (page: Page) => page.getByTestId('intake-cta').getByRole('button', { name: 'Continue', exact: true }).tap();
const pick = (page: Page, screen: string, value: string) => page.getByTestId(`q-${screen}-${value}`).tap();
const put = (page: Page, table: string, row: unknown) => dbPut(page, { [table]: [row] });
const skip = (page: Page) => page.getByTestId('skip').tap();
async function toFocus(page: Page) {
  await page.goto('./'); await step(page, 'goal'); await pick(page, 'goal', 'muscle'); await next(page);
  await step(page, 'units'); await next(page); await step(page, 'focus');
}
async function part(page: Page, area: string, id: string) {
  await pick(page, 'focus', area);
  // By name: from the fifth pick "Your priorities" rises as this sheet leaves.
  const sheet = page.getByRole('dialog', { name: / focus$/ }); await expect(sheet).toBeVisible();
  await sheet.getByTestId(`focus-part-${id}`).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap(); await expect(sheet).not.toBeVisible();
}
async function rest(page: Page, style = 'flexible', o: { days?: string; minutes?: string; weekdays?: string[] } = {}) {
  await next(page); await step(page, 'experience'); await pick(page, 'experience', '3y');
  await step(page, 'days'); await pick(page, 'days', o.days ?? '4'); await step(page, 'weekdays');
  await pick(page, 'schedule', style);
  if (style === 'fixed') for (const d of o.weekdays ?? ['mon', 'tue', 'thu', 'sat']) await pick(page, 'weekdays', d);
  else await expect(page.getByTestId('q-weekdays-mon')).toHaveCount(0);
  await next(page); await step(page, 'minutes'); await pick(page, 'minutes', o.minutes ?? '45');
  await step(page, 'place'); await pick(page, 'place', 'full'); await step(page, 'equipment'); await next(page);
  await step(page, 'style'); await pick(page, 'style', 'mix'); await step(page, 'cardio'); await pick(page, 'cardio', 'little'); await next(page);
  await step(page, 'easyOn'); await skip(page); await step(page, 'exercises'); await skip(page); await step(page, 'about'); await skip(page); await step(page, 'reveal');
}
async function accept(page: Page) {
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  // Design round 2 (critic MAJOR 9): Today lands at its top. With the welcome up (it used to scroll the page 18 px) the day card still starts under the header.
  await expect(page.getByTestId('tour-words')).toHaveAttribute('data-in', 'true'); await page.waitForTimeout(500);
  const landed = await page.evaluate(() => {
    const card = document.querySelector('[data-tour="day"]')!; const scroller = card.closest('[data-scroller]')!;
    const start = card.querySelector('[data-tour-core]')!.getBoundingClientRect().bottom + scroller.scrollTop; const words = document.querySelector('[data-testid="tour-words"]')!.getBoundingClientRect().height;
    // The one exception: a screen too short to hold the card down to Start and the words (the 320 floor at 130% text).
    return { gap: card.getBoundingClientRect().top - scroller.querySelector('header')!.getBoundingClientRect().bottom, top: scroller.scrollTop, fits: start + 6 + 12 + words <= innerHeight - 16 };
  });
  if (landed.fits) { expect(landed.top).toBe(0); expect(landed.gap).toBeGreaterThanOrEqual(0); }
  await page.getByTestId('tour-skip').tap(); await expect(page.getByTestId('welcome-tour')).toHaveCount(0);
  await expect(page.getByTestId('day-card-title')).toBeVisible();
}
async function textScale(page: Page, scale: number) {
  await page.addInitScript((s) => {
    const apply = () => {
      if (!document.documentElement) return;
      for (const [key, size] of Object.entries({ 'text-sm': 14, 'text-base': 16, 'text-lg': 20, 'text-xl': 28, 'text-hero': 40 })) document.documentElement.style.setProperty(`--${key}`, `${size * s}px`);
      document.documentElement.style.fontSize = `${16 * s}px`;
    };
    new MutationObserver(apply).observe(document, { childList: true }); apply();
  }, scale);
}
const priorities = (page: Page) => page.getByRole('dialog', { name: 'Your priorities' });
const rankDone = async (page: Page) => { await priorities(page).getByRole('button', { name: 'Done', exact: true }).tap(); await expect(priorities(page)).not.toBeVisible(); };
for (const scale of [1, 1.3]) test(`flexible intake, five ranked parts, saved reveal, Today, Preview and Start at ${scale * 100}%`, async ({ page, context }) => {
  await textScale(page, scale); await toFocus(page);
  await part(page, 'back', 'lats'); await part(page, 'shoulders', 'side_delts'); await part(page, 'arms', 'biceps'); await part(page, 'legs', 'quads');
  // The ranking follows the budget's rule: four picks share evenly, so there is nothing to rank yet.
  await expect(page.getByTestId('focus-rank-open')).toHaveCount(0); await expect(page.getByTestId('focus-rank')).toHaveCount(0);
  // Design round 2 (critic POLISH 13): the fifth pick is one calm moment. The parts sheet leaves and a quiet row asks; the priorities open from it, never by themselves.
  await part(page, 'core', 'abs');
  const rank = page.getByTestId('focus-rank'); await expect(page.getByTestId('focus-rank-open')).toContainText('Rank your 5 picks');
  await page.waitForTimeout(600); await expect(rank).toHaveCount(0);
  await expect(page.getByTestId('focus-rank-open')).toBeInViewport({ ratio: 1 });
  // Every tile keeps one height, picked or not (critic POLISH 12), and each has its own icon.
  const heights = await page.getByTestId('q-focus').locator('button').evaluateAll((tiles) => tiles.map((t) => Math.round(t.getBoundingClientRect().height)));
  if (page.viewportSize()!.width > 340) expect(new Set(heights).size).toBe(1);
  expect(new Set(await page.getByTestId('q-focus').locator('svg').evaluateAll((icons) => icons.map((i) => i.innerHTML))).size).toBe(11);
  await page.getByTestId('focus-rank-open').tap(); await expect(rank).toBeVisible();
  await rank.getByRole('button', { name: 'Move Quads up', exact: true }).tap();
  await expect(rank.locator('li').nth(2)).toContainText('Quads');
  await checkLayout(page, { primary: priorities(page).getByRole('button', { name: 'Done', exact: true }) });
  for (const button of await rank.getByRole('button').all()) { const box = (await button.boundingBox())!; expect(Math.round(box.height)).toBeGreaterThanOrEqual(48); expect(Math.round(box.width)).toBeGreaterThanOrEqual(48); }
  await rankDone(page);
  await expect(page.getByTestId('focus-rank-top')).toContainText('Lats and Side shoulders');
  await checkLayout(page, { primary: page.getByTestId('intake-cta').getByRole('button', { name: 'Continue', exact: true }) });
  // A reload keeps the order and does not raise the sheet again: it is one tap away.
  await page.reload(); await step(page, 'focus'); await expect(page.getByTestId('focus-rank')).toHaveCount(0);
  await page.getByTestId('focus-rank-open').tap(); await expect(page.getByTestId('focus-rank').locator('li').nth(2)).toContainText('Quads'); await rankDone(page);
  await rest(page);
  await expect(page.getByTestId('reveal-focus')).toContainText('Lats');
  // Round 2: every row says the total and the extra as what they are (design round 2: name, number, a quiet state; the period once, over the rows).
  await expect(page.getByTestId('reveal-focus')).toContainText('Sets every 4 workouts');
  await expect(page.getByTestId('focus-line-lats')).toHaveText(/^Lats \d+ sets \+\d+ extra$/);
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/nothing extra|with your equipment/);
  // A rotation never claims a calendar week, and nothing is said in jargon or as a zero.
  await expect(page.getByTestId('reveal-focus')).toContainText('every 4 workouts');
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/working sets|rotation|budget|\b0 (sets|min)/);
  await expect(page.getByTestId('reveal-week')).not.toContainText('Mon');
  // Round 2 (BLOCKER 2): the fit line names 60 min, and the one tap really fixes it: the warning is gone and every pick has its extra.
  await expect(page.getByTestId('focus-fit')).toHaveText('5 focus areas fit best with 60 min; we prioritized Lats and Quads.');
  // Round 3 (critic 3): the reveal names who really got the most, composed from the result.
  await expect(page.getByTestId('focus-summary')).toHaveText(/^(Most extra work: [A-Z][A-Za-z ,]+\.|Every pick gets the same extra work: \+\d\.|[A-Z][a-z ]+ (already gets plenty|has no exercises yet|has less room on its days), so [A-Z][A-Za-z ,]+ gets? the most\.)$/);
  const grow = page.getByTestId('focus-add-minutes');
  await grow.tap(); await expect(page.getByTestId('reveal-card')).toBeVisible();
  await expect(page.getByTestId('focus-fit')).toHaveCount(0);
  await expect(page.getByTestId('focus-add-minutes')).toHaveCount(0);
  for (const id of ['lats', 'side_delts', 'quads', 'biceps', 'abs']) await expect(page.getByTestId(`focus-line-${id}`)).toHaveAttribute('data-state', 'extra');
  const extras = await page.getByTestId('reveal-focus').locator('li').evaluateAll((rows) => rows.map((r) => Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)));
  expect(extras.every((n) => n > 0)).toBe(true);
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await accept(page);
  expect(await dbAll(page, 'sessions')).toEqual([]);
  await expect(page.getByTestId('day-card-title')).toContainText('Next up');
  await expect(page.getByTestId('week-label')).toContainText('rotation');
  await expect(page.getByText('Missed workouts', { exact: true })).toHaveCount(0);
  // Round 2 (MAJOR 7): the day card says what this day adds, never the whole rotation's total.
  // Round 3 (critic 10): it names the pick the day opens with, and up to two picks it adds for (then "and more").
  await expect(page.getByTestId('day-focus-why')).toHaveText(/^([A-Z][a-z ]+ first today(\. Extra: \d+ sets? for [a-z ]+((,| and) \d+ for [a-z ]+)?( and more)?)?|Extra today: \d+ sets? for [a-z ]+((,| and) \d+ for [a-z ]+)?( and more)?)$/);
  // The title breaks only between its parts: no line starts or ends on a dot.
  expect(await page.getByTestId('day-card-title').evaluate((h) => [...h.children].slice(1).every((part, i) => {
    const before = h.children[i]!.getBoundingClientRect(), box = part.getBoundingClientRect();
    // On the same line as the part before it (its dot shows between them), or first on a new line (its dot is in the clipped gutter).
    return box.top < before.bottom - 8 && box.bottom > before.top + 8 ? box.left >= before.right - 1 : Math.abs(box.left - h.getBoundingClientRect().left) < 2;
  }))).toBe(true);
  const profile = (await dbAll<{ intake: { scheduleStyle: string; focusPicks: string[] } }>(page, 'profile'))[0]!;
  expect(profile.intake.scheduleStyle).toBe('flexible');
  expect(profile.intake.focusPicks).toEqual(['lats', 'side_delts', 'quads', 'biceps', 'abs']);
  const before = (await dbAll<{ planId: string; nextDayIndex: number }>(page, 'planState'))[0]!;
  await page.getByTestId('day-preview').tap();
  await expect(page.getByTestId('quick-start')).toBeVisible();
  await page.getByTestId('quick-start').getByRole('button', { name: 'Start workout', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const sessions = await dbAll<{ planId: string; dayId: string }>(page, 'sessions');
  expect(sessions).toHaveLength(1); expect(sessions[0]!.planId).toBe(before.planId);
  expect(sessions[0]!.dayId).toBe(String(before.nextDayIndex + 1));
  // The service worker must have control before proving offline reload.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true); await page.reload(); await expect(page.getByTestId('workout-title')).toBeVisible(); await context.setOffline(false);
});

test('five priorities, sheet dismissal, balance clearing, accessible ranking and Settings redo', async ({ page }) => {
  // A long journey (two intakes, the Undo toast's arming time): Chromium on the Pixel profile needs more than the 30 s default.
  test.setTimeout(60_000);
  await toFocus(page); await part(page, 'back', 'lats');
  await pick(page, 'focus', 'arms');
  await page.getByRole('dialog').getByTestId('focus-part-biceps').tap();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'false');
  await part(page, 'arms', 'biceps'); await part(page, 'legs', 'quads'); await part(page, 'shoulders', 'side_delts');
  // The part picked carries a check mark, not only an outline (critic POLISH 14), and the tile says it in one line.
  await pick(page, 'focus', 'shoulders'); await expect(page.getByTestId('focus-part-side_delts').locator('[data-ring]')).toBeVisible(); await expect(page.getByTestId('focus-part-side_delts')).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('q-focus-shoulders')).toContainText('Side shoulders');
  await part(page, 'core', 'abs'); await page.getByTestId('focus-rank-open').tap();
  await expect(page.getByTestId('focus-rank').locator('li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Move Abs up', exact: true }).tap();
  const last = page.getByRole('button', { name: 'Drag Side shoulders for width', exact: true });
  await touchDragVertical(page, last, -70);
  await expect(page.getByTestId('rank-side_delts')).not.toContainText('5.');
  await rankDone(page);
  // A choice the app has no sure exercise for says so before it is picked, on the tile and in the sheet.
  await expect(page.getByTestId('q-focus-grip')).toContainText('No exercises yet');
  // Said whole: the tile's quiet line is never cut short here (it wraps on the 320 floor).
  expect(await page.getByTestId('q-focus-grip').locator('span span').evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
  await pick(page, 'focus', 'arms'); await expect(page.getByTestId('focus-part-forearms')).toContainText('No exercises yet'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Design round 2 (critic MAJOR 8): balance says what it is, clears the picks with an Undo, and Undo brings them back in their order.
  await expect(page.getByTestId('q-focus-balance')).toContainText('Even plan, no extra work');
  await pick(page, 'focus', 'balance'); await expect(page.getByTestId('focus-rank-open')).toHaveCount(0);
  for (const id of ['back', 'arms', 'legs', 'shoulders', 'core']) await expect(page.getByTestId(`q-focus-${id}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('5 picks cleared', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  for (const id of ['back', 'arms', 'legs', 'shoulders', 'core']) await expect(page.getByTestId(`q-focus-${id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('q-focus-balance')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('focus-rank-open').tap(); await expect(page.getByTestId('rank-side_delts')).not.toContainText('5.'); await rankDone(page);
  await pick(page, 'focus', 'balance'); await expect(page.getByTestId('focus-rank-open')).toHaveCount(0);
  for (const id of ['back', 'arms', 'legs', 'shoulders', 'core']) await expect(page.getByTestId(`q-focus-${id}`)).toHaveAttribute('aria-pressed', 'false');
  // Balance and picking nothing are the same plan, and the screen says so.
  await expect(page.getByTestId('focus-same')).toHaveText('Picking nothing gives the same even plan.');
  await part(page, 'arms', 'triceps'); await expect(page.getByTestId('q-focus-balance')).toHaveAttribute('aria-pressed', 'false');
  await rest(page); await accept(page);
  await page.goto('./#/settings');
  await expect(page.getByText('Answer the questions again', { exact: true })).toBeVisible();
  await page.getByText('Answer the questions again', { exact: true }).tap(); await step(page, 'goal'); await next(page); await step(page, 'units'); await next(page); await step(page, 'focus');
  await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await step(page, 'focus'); await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'true');
});

test('Settings opens only the schedule or only the focus areas, and the reveal rebuilds the plan (critic POLISH 15)', async ({ page }) => {
  await toFocus(page); await part(page, 'arms', 'triceps'); await rest(page); await accept(page);
  await page.goto('./#/settings');
  await expect(page.getByTestId('redo-schedule')).toContainText('Flexible, whenever I can'); await expect(page.getByTestId('redo-focus')).toContainText('Triceps');
  await checkLayout(page);
  // Schedule: that one question, no progress bar, Continue goes straight to the reveal.
  await page.getByTestId('redo-schedule').tap(); await step(page, 'weekdays');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await pick(page, 'schedule', 'fixed'); for (const d of ['mon', 'wed', 'fri', 'sat']) await pick(page, 'weekdays', d);
  await next(page); await step(page, 'reveal'); await expect(page.getByTestId('reveal-week')).toContainText('Mon');
  // Back from the reveal is the question again, not the whole intake.
  await page.getByRole('button', { name: 'Back', exact: true }).tap(); await step(page, 'weekdays'); await next(page); await step(page, 'reveal');
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/); await expect(page.getByTestId('day-card-title')).toBeVisible();
  const saved = (await dbAll<{ intake: { scheduleStyle: string; weekdays: string[]; focusPicks: string[]; days: number } }>(page, 'profile'))[0]!.intake;
  expect(saved.scheduleStyle).toBe('fixed'); expect(saved.weekdays).toEqual(['mon', 'wed', 'fri', 'sat']); expect(saved.focusPicks).toEqual(['triceps']); expect(saved.days).toBe(4);
  // Focus areas: the same way; the back button on the question returns to Settings.
  await page.goto('./#/settings'); await expect(page.getByTestId('redo-schedule')).toContainText('Same days each week · Mon, Wed, Fri, Sat');
  await page.getByTestId('redo-focus').tap(); await step(page, 'focus'); await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Settings', exact: true }).tap(); await expect(page).toHaveURL(/#\/settings$/);
  await page.getByTestId('redo-focus').tap(); await step(page, 'focus'); await part(page, 'legs', 'quads');
  await next(page); await step(page, 'reveal'); await expect(page.getByTestId('focus-line-quads')).toBeVisible(); await expect(page.getByTestId('focus-line-triceps')).toBeVisible();
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan', exact: true }).tap(); await expect(page).toHaveURL(/#\/$/);
  expect((await dbAll<{ intake: { focusPicks: string[]; scheduleStyle: string } }>(page, 'profile'))[0]!.intake).toMatchObject({ focusPicks: ['triceps', 'quads'], scheduleStyle: 'fixed' });
});

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
test('fixed weekdays label the reveal; weekly asks once and keeps the saved days', async ({ page }) => {
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page, 'fixed');
  await expect(page.getByTestId('reveal-week')).toContainText('Mon'); await accept(page);
  // Round 2 (MAJOR 6): on a fixed schedule a day that is not one of the person's days says so, and Start stays.
  const today = WEEK[(new Date().getDay() + 6) % 7]!;
  if (['mon', 'tue', 'thu', 'sat'].includes(today)) await expect(page.getByTestId('day-rest')).toHaveCount(0);
  else await expect(page.getByTestId('day-rest')).toHaveText(/^ · Rest day, next (tomorrow|Mon|Tue|Thu|Sat): Day 1$/);
  await expect(page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  const profiles = await dbAll<Record<string, unknown> & { intake: Record<string, unknown> }>(page, 'profile');
  // Straight after the intake, late in a week (fewer days left than the plan has), the question does not open by itself: the row can.
  const left = WEEK.slice(WEEK.indexOf(today));
  await put(page, 'profile', { ...profiles[0], welcomeTour: 'done', intake: { ...profiles[0]!.intake, scheduleStyle: 'weekly' } });
  await page.reload(); const sheet = page.getByRole('dialog', { name: 'Which days this week?' });
  await expect(page.getByTestId('week-schedule-days')).toHaveText('Not picked yet');
  if (left.length < 4) await expect(sheet).toHaveCount(0);
  // An intake finished weeks ago: the new week asks by itself.
  await put(page, 'profile', { ...profiles[0], welcomeTour: 'done', intakeDoneAt: Date.now() - 30 * 86_400_000, intake: { ...profiles[0]!.intake, scheduleStyle: 'weekly' } });
  await page.reload(); await expect(sheet).toBeVisible();
  // No days is never saved silently: Save waits for a day and says so.
  await expect(sheet.getByRole('button', { name: 'Save days', exact: true })).toBeDisabled(); await expect(sheet.getByRole('note')).toHaveText('Pick at least one day');
  // Only today and the days after it can be picked; it asks for the plan's number of days.
  for (const d of WEEK) { if (left.includes(d)) await expect(sheet.getByTestId(`week-${d}`)).toBeEnabled(); else await expect(sheet.getByTestId(`week-${d}`)).toBeDisabled(); }
  await expect(sheet.getByTestId('week-plan-days')).toHaveText('Your plan has 4 days. Pick up to 4.');
  await sheet.getByTestId(`week-${today}`).tap(); await checkLayout(page, { primary: sheet.getByRole('button', { name: 'Save days', exact: true }) });
  await expect(sheet.getByTestId('week-plan-days')).toHaveText('Your plan has 4 days. You picked 1: the rest wait for next week.');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'profile') { IDBObjectStore.prototype.put = original; throw new DOMException('Test write failure', 'QuotaExceededError'); }
      return original.apply(this, args);
    };
  });
  await sheet.getByRole('button', { name: 'Save days', exact: true }).tap();
  await expect(sheet.getByRole('alert')).toHaveText('Could not save your days. Try again.');
  await sheet.getByRole('button', { name: 'Save days', exact: true }).tap(); await expect(sheet).not.toBeVisible();
  await page.reload(); await expect(page.getByTestId('day-card-title')).toBeVisible(); await expect(sheet).not.toBeVisible();
  await expect(page.getByTestId('week-schedule-days')).toHaveText(LABEL[today]!);
  // Today is one of the picked days: no rest day note.
  await expect(page.getByTestId('day-rest')).toHaveCount(0);
  await page.getByTestId('week-schedule-open').tap(); await expect(sheet.getByTestId(`week-${today}`)).toHaveAttribute('aria-pressed', 'true');
});

/** A flexible profile on the four day upper/lower plan whose last workout trained the upper body: Day 2 (lower) is next. */
async function afterUpperDay(page: Page) {
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page); await accept(page);
  // The four-day upper/lower plan: a real logged upper-body set makes the lower day next.
  await put(page, 'sessions', { id: 'recovery-upper', gymId: 'other', startedAt: Date.now() - 1000, endedAt: Date.now(), imported: false });
  // One set is not a workout: it never moves a day (round 2). Three hard sets do.
  await put(page, 'sets', { id: 'upper-set', sessionId: 'recovery-upper', exerciseId: 'dumbbell-bench-press', order: 0, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await page.reload(); await expect(page.getByTestId('day-card-title')).toContainText('Day 1');
  for (const n of [1, 2]) await put(page, 'sets', { id: `upper-set-${n}`, sessionId: 'recovery-upper', exerciseId: 'dumbbell-bench-press', order: n, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await page.reload(); await expect(page.getByTestId('day-card-title')).toContainText('Day 2');
}
test('flexible recovery defers a trained day, then shows honest recovery when every pending day is blocked; Train anyway starts the workout', async ({ page }) => {
  await afterUpperDay(page);
  const state = (await dbAll<{ id: string; planId: string; nextDayIndex: number }>(page, 'planState'))[0]!;
  await put(page, 'sessions', { id: 'recovery-lower', gymId: 'other', startedAt: Date.now() - 1000, endedAt: Date.now(), imported: false });
  for (const n of [0, 1, 2]) await put(page, 'sets', { id: `lower-set-${n}`, sessionId: 'recovery-lower', exerciseId: 'barbell-back-squat', order: n, kind: 'work', reps: 8, load: { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [] }, uncertain: false });
  await page.reload(); await expect(page.getByTestId('rotation-recovery')).toContainText('Time to recover');
  // The card names the muscles and says when in plain words, never a clock time (round 2).
  await expect(page.getByTestId('rotation-why')).toHaveText(/^[A-Z][a-z ,]+ trained today\. Rest today, and your next workout keeps its place\.$/);
  await expect(page.getByTestId('rotation-why')).toContainText(/chest/i);
  await expect(page.getByTestId('rotation-ready')).toHaveText(/^Ready (tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening)\.$/);
  await expect(page.getByRole('region', { name: "Today's plan day" })).toHaveCount(0);
  await expect(page.getByTestId('rotation-train-anyway')).toBeVisible();
  expect((await dbAll<{ nextDayIndex: number }>(page, 'planState'))[0]!.nextDayIndex).toBe(state.nextDayIndex);
  // "Train anyway" never locks the person out: it picks the most rested day left (here the next in order), the day card comes back with Start, and Start opens the workout.
  const open = (await dbAll<{ endedAt?: number }>(page, 'sessions')).length;
  await page.getByTestId('rotation-train-anyway').tap();
  await expect(page.getByTestId('rotation-recovery')).toHaveCount(0);
  await expect(page.getByTestId('day-card-title')).toContainText(`Day ${state.nextDayIndex + 1}`);
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const sessions = await dbAll<{ planId?: string; dayId?: string; endedAt?: number }>(page, 'sessions');
  expect(sessions).toHaveLength(open + 1);
  const started = sessions.find((x) => x.endedAt === undefined)!;
  expect(started.planId).toBe(state.planId); expect(started.dayId).toBe(String(state.nextDayIndex + 1));
});

test('one set on Day 1 keeps Day 1: the finish screen and Today say the same next day (round 2, BLOCKER 3)', async ({ page }) => {
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page); await accept(page);
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const s = (await dbAll<{ id: string; exerciseIds: string[]; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  await put(page, 'sets', { id: 'only-set', sessionId: s.id, exerciseId: s.exerciseIds[1] ?? s.exerciseIds[0], order: 0, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await page.reload();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Finish/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.tap();
  await expect(page.getByTestId('finish-next')).toHaveText(/^Next up: Day 1 · /);
  await expect(page.getByTestId('finish-next-why')).toHaveText(/^Day 1 again · you did 1 of \d+ sets$/);
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Next up: Day 1 · /);
  await expect(page.getByTestId('rotation-recovery')).toHaveCount(0);
});

/** Round 3 (critic 6): Today is at its top: the day card starts under the header with its plan name in view, and the toast is over no button. */
async function landedAtTop(page: Page, toastText: string) {
  const toast = page.getByRole('status').filter({ hasText: toastText }); await expect(toast).toBeVisible();
  await page.waitForTimeout(900);
  const at = await page.evaluate(() => {
    const card = document.querySelector('[data-tour="day"]')!; const scroller = card.closest('[data-scroller]')!;
    const head = scroller.querySelector('header')!.getBoundingClientRect().bottom;
    return { top: scroller.scrollTop, gap: card.getBoundingClientRect().top - head, name: card.querySelector('p')!.getBoundingClientRect().top - head, title: document.querySelector('[data-testid="day-card-title"]')!.getBoundingClientRect().top - head };
  });
  expect(at.top).toBe(0); expect(at.gap).toBeGreaterThanOrEqual(0); expect(at.name).toBeGreaterThan(0); expect(at.title).toBeGreaterThan(0);
  const t = (await toast.boundingBox())!;
  for (const b of await page.locator('[data-room] button:visible, [data-room] a:visible').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x < t.x + t.width && t.x < r.x + r.width && r.y < t.y + t.height && t.y < r.y + r.height, `toast over "${(await b.innerText()).slice(0, 24)}"`).toBe(false);
  }
}
test('round 3 (critic 6, 7): four sets keep Day 1 as one story, and Today lands at its top after Finish then Done and after Use this plan', async ({ page }) => {
  test.setTimeout(60_000);
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page); await accept(page);
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const s = (await dbAll<{ id: string; exerciseIds: string[]; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  for (const n of [0, 1, 2, 3]) await put(page, 'sets', { id: `bench-${n}`, sessionId: s.id, exerciseId: s.exerciseIds[0], order: n, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await page.reload();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Finish/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.tap();
  const why = (await page.getByTestId('finish-next-why').innerText()).match(/^Day 1 again · you did (\d+) of (\d+) sets$/)!;
  expect(why).not.toBeNull();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Next up: Day 1 · /);
  await landedAtTop(page, 'Workout saved');
  // One story: the coach line is the continuation, with the finish screen's own numbers, and what Start does.
  await expect(page.getByTestId('coach-line')).toHaveText(`Coach: Day 1 again. You did ${why[1]} of ${why[2]} sets last time, so it stays up next and starts from the top.`);
  await expect(page.getByTestId('coach-line')).not.toContainText('again. Go a little lighter');
  // The other route: Settings, the schedule, Use this plan.
  await page.goto('./#/settings'); await page.getByTestId('redo-schedule').tap(); await step(page, 'weekdays');
  await pick(page, 'schedule', 'weekly'); await next(page); await step(page, 'reveal');
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan', exact: true }).tap(); await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await landedAtTop(page, 'Plan saved');
});

test('Change day onto a day that is resting works: Today shows it and Start opens it', async ({ page }) => {
  await afterUpperDay(page);
  // The upper body was just trained, so Day 1 (upper) is resting; the person still chooses it.
  await page.getByRole('button', { name: 'Change day', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' }); await expect(sheet).toBeVisible(); await rootAtRest(page);
  await sheet.getByRole('button', { name: /^Day 1/ }).tap();
  await expect(sheet).not.toBeVisible(); await rootAtRest(page);
  await expect(page.getByTestId('day-card-title')).toContainText('Day 1');
  expect((await dbAll<{ chosenDayIndex?: number }>(page, 'planState'))[0]!.chosenDayIndex).toBe(0);
  await page.reload(); await expect(page.getByTestId('day-card-title')).toContainText('Day 1');
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const started = (await dbAll<{ dayId?: string; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  expect(started.dayId).toBe('1');
});

test('reduced motion keeps all parts, targets and the reachable action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await toFocus(page); await pick(page, 'focus', 'chest');
  const sheet = page.getByRole('dialog'); await checkLayout(page, { primary: sheet.getByRole('button', { name: 'Done', exact: true }) });
  for (const button of await sheet.getByRole('button').all()) {
    const box = await button.boundingBox(); if (box) { expect(box.height).toBeGreaterThanOrEqual(48); expect(box.width).toBeGreaterThanOrEqual(48); }
  }
  await sheet.getByTestId('focus-part-upper_chest').tap(); await sheet.getByRole('button', { name: 'Done', exact: true }).tap(); await rest(page);
  await expect(page.getByTestId('focus-line-upper_chest')).toHaveText(/^Upper chest \d+ sets \+\d+ extra$/);
});

test('round 3 (critic 1): changing the schedule or the focus in Settings keeps the place, the workouts and the sets', async ({ page }) => {
  test.setTimeout(60_000);
  await toFocus(page); await part(page, 'arms', 'triceps'); await rest(page); await accept(page);
  // Day 1 done three days ago (so no muscle is resting): Day 2 is next.
  const state = (await dbAll<Record<string, unknown> & { planId: string }>(page, 'planState'))[0]!;
  const at = Date.now() - 3 * 86_400_000;
  await put(page, 'sessions', { id: 'day-one', gymId: 'other', planId: state.planId, dayId: '1', startedAt: at - 3_600_000, endedAt: at, imported: false });
  for (const n of [0, 1, 2]) await put(page, 'sets', { id: `day-one-${n}`, sessionId: 'day-one', exerciseId: 'dumbbell-bench-press', order: n, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await put(page, 'planState', { ...state, doneDays: [0], nextDayIndex: 1, pendingDayIndices: [1, 2, 3] });
  await page.reload(); await expect(page.getByTestId('day-card-title')).toHaveText(/^Next up: Day 2 · /);
  // Schedule: flexible to the same days each week.
  await page.goto('./#/settings'); await page.getByTestId('redo-schedule').tap(); await step(page, 'weekdays');
  await pick(page, 'schedule', 'fixed'); for (const d of ['tue', 'thu', 'sat', 'sun']) await pick(page, 'weekdays', d);
  await next(page); await step(page, 'reveal');
  // The place carries over, so the reveal has nothing to warn about.
  await expect(page.getByTestId('reveal-restart')).toHaveCount(0);
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan', exact: true }).tap(); await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toContainText('Day 2');
  const fixed = (await dbAll<{ planId: string; doneDays: number[]; nextDayIndex: number }>(page, 'planState'))[0]!;
  expect(fixed.planId).not.toBe(state.planId); expect(fixed.doneDays).toEqual([0]); expect(fixed.nextDayIndex).toBe(1);
  // Focus: another part added.
  await page.goto('./#/settings'); await page.getByTestId('redo-focus').tap(); await step(page, 'focus'); await part(page, 'legs', 'quads');
  await next(page); await step(page, 'reveal'); await expect(page.getByTestId('reveal-restart')).toHaveCount(0);
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan', exact: true }).tap(); await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('day-card-title')).toContainText('Day 2');
  const focused = (await dbAll<{ planId: string; doneDays: number[]; nextDayIndex: number }>(page, 'planState'))[0]!;
  expect(focused.planId).not.toBe(fixed.planId); expect(focused.doneDays).toEqual([0]); expect(focused.nextDayIndex).toBe(1);
  expect(await dbAll(page, 'sessions')).toHaveLength(1); expect(await dbAll(page, 'sets')).toHaveLength(3);
});

test('round 3 (critic 2): a fixed schedule saved with too few weekdays is asked for on Today, never pretended', async ({ page }) => {
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page, 'fixed'); await accept(page);
  const profile = (await dbAll<Record<string, unknown> & { intake: Record<string, unknown> }>(page, 'profile'))[0]!;
  await put(page, 'profile', { ...profile, intake: { ...profile.intake, weekdays: ['mon', 'thu'] } });
  await page.reload();
  const row = page.getByTestId('fixed-days-open'); await expect(row).toContainText('Pick 2 more days');
  await expect(page.getByTestId('fixed-days-note')).toHaveText('Your plan has 4 days. Pick 2 more.');
  // No rest day is claimed while two plan days have no weekday.
  await expect(page.getByTestId('day-rest')).toHaveCount(0);
  await checkLayout(page);
  await row.tap(); const sheet = page.getByRole('dialog', { name: 'Which days each week?' }); await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('fixed-mon')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'Save days', exact: true })).toBeDisabled();
  await sheet.getByTestId('fixed-tue').tap(); await expect(sheet.getByTestId('fixed-plan-days')).toHaveText('Your plan has 4 days. Pick 1 more.');
  await sheet.getByTestId('fixed-sat').tap(); await expect(sheet.getByTestId('fixed-plan-days')).toHaveText('Your plan has 4 days. You picked all 4.');
  await checkLayout(page, { primary: sheet.getByRole('button', { name: 'Save days', exact: true }) });
  await sheet.getByRole('button', { name: 'Save days', exact: true }).tap(); await expect(sheet).not.toBeVisible();
  await expect(row).toHaveCount(0);
  expect((await dbAll<{ intake: { weekdays: string[] } }>(page, 'profile'))[0]!.intake.weekdays).toEqual(['mon', 'tue', 'thu', 'sat']);
});

test('round 3 (critic 2): the intake waits for one weekday for each day on a fixed schedule', async ({ page }) => {
  await toFocus(page); await pick(page, 'focus', 'balance');
  await next(page); await step(page, 'experience'); await pick(page, 'experience', '3y');
  await step(page, 'days'); await pick(page, 'days', '3'); await step(page, 'weekdays');
  await pick(page, 'schedule', 'fixed'); await pick(page, 'weekdays', 'mon'); await pick(page, 'weekdays', 'thu');
  const go = page.getByTestId('intake-cta').getByRole('button', { name: 'Continue', exact: true });
  await expect(page.getByTestId('weekday-count')).toHaveText('That is 2 days. You said 3.'); await expect(go).toBeDisabled();
  await pick(page, 'weekdays', 'sat'); await expect(go).toBeEnabled();
  await pick(page, 'weekdays', 'sun'); await expect(go).toBeDisabled();
});

test('round 3 (critic 2): Add a day on a fixed schedule asks which weekday, and the plan and the weekdays stay equal', async ({ page }) => {
  await toFocus(page); await part(page, 'back', 'back'); await part(page, 'shoulders', 'shoulders');
  await rest(page, 'fixed', { days: '2', minutes: '30', weekdays: ['mon', 'thu'] });
  await expect(page.getByTestId('reveal-week').locator('li')).toHaveCount(2); await expect(page.getByTestId('reveal-week')).toContainText('Mon'); await expect(page.getByTestId('reveal-week')).toContainText('Thu');
  await expect(page.getByTestId('focus-fit')).toContainText('3 days');
  await page.getByTestId('focus-add-day').tap();
  // The plan is not rebuilt until the day has its weekday: the chips open in place, the picked days stay picked and cannot be taken away here.
  const ask = page.getByTestId('focus-add-which'); await expect(ask).toContainText('Which day do you add?'); await expect(ask).toContainText('Your plan has 3 days. Pick 1 more.');
  await expect(page.getByTestId('reveal-week').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('focus-add-mon')).toBeDisabled(); await expect(page.getByTestId('focus-add-mon')).toHaveAttribute('aria-pressed', 'true');
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await page.getByTestId('focus-add-sat').tap();
  // One tap: three days, each with its weekday.
  await expect(page.getByTestId('reveal-week').locator('li')).toHaveCount(3);
  for (const d of ['Mon', 'Thu', 'Sat']) await expect(page.getByTestId('reveal-week')).toContainText(d);
  await expect(page.getByTestId('reveal-week')).not.toContainText('Day 1');
  await accept(page);
  const saved = (await dbAll<{ intake: { days: number; weekdays: string[]; scheduleStyle: string } }>(page, 'profile'))[0]!.intake;
  expect(saved).toMatchObject({ days: 3, weekdays: ['mon', 'thu', 'sat'], scheduleStyle: 'fixed' });
  await expect(page.getByTestId('fixed-days-open')).toHaveCount(0);
});

test('round 3 (critic 3, 5, 11, 12): six picks on 6 days, 75 min: the words match what happened, no row contradicts itself, Mobility is explained', async ({ page }) => {
  test.setTimeout(60_000);
  await toFocus(page); await part(page, 'back', 'back'); await pick(page, 'focus', 'posture'); await part(page, 'shoulders', 'side_delts'); await pick(page, 'focus', 'glutes'); await part(page, 'core', 'abs');
  // Five picks are ranked; Mobility is the sixth and the row says why it is not in the order (critic 11).
  await pick(page, 'focus', 'mobility');
  await expect(page.getByTestId('focus-rank-open')).toContainText('Rank your 5 picks');
  await expect(page.getByTestId('focus-rank-note')).toHaveText('Mobility is stretch time, so it is not ranked.');
  // Before the plan exists nothing is promised (critic 3): the row and the sheet state an intent.
  await expect(page.getByTestId('focus-rank-top')).toHaveText('From the top: Back and Posture');
  await expect(page.getByTestId('q-focus')).not.toContainText(/most extra/i);
  await checkLayout(page, { primary: page.getByTestId('intake-cta').getByRole('button', { name: 'Continue', exact: true }) });
  await page.getByTestId('focus-rank-open').tap();
  await expect(page.getByTestId('focus-rank-intent')).toHaveText('We add extra where it fits, starting from the top. Drag a row, or use the arrows.');
  await expect(page.getByTestId('focus-rank')).toContainText('Mobility is stretch time, so it is not ranked.'); await expect(page.getByTestId('focus-rank').locator('li')).toHaveCount(5);
  await rankDone(page);
  await rest(page, 'flexible', { days: '6', minutes: '75' });
  // Back ranked first already has plenty: the summary says so and names who got the most (critic 3).
  await expect(page.getByTestId('focus-line-back')).toHaveAttribute('data-state', 'plenty');
  await expect(page.getByTestId('focus-summary')).toHaveText(/^Back already gets plenty, so [A-Z][A-Za-z ,]+ gets? the most\.$/);
  // No row says extra and plenty together, and Posture says its back sets are the ones shown under Back (critic 5).
  const rows = await page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => all.map((r) => ({ id: r.getAttribute('data-testid')!, state: r.getAttribute('data-state')!, text: r.textContent ?? '' })));
  for (const r of rows) expect(/extra/.test(r.text) && /plenty/i.test(r.text), r.text).toBe(false);
  await expect(page.getByTestId('focus-line-posture')).toHaveText(/Covered by your back work: \d+ sets|\d+ of them also count for Back/);
  // The picks that got extra come first (critic 12): no row with extra sits under one without.
  const got = rows.map((r) => /\+\d+ extra|\d+ min/.test(r.text));
  expect(got.lastIndexOf(true)).toBeLessThan(got.includes(false) ? got.indexOf(false) : got.length);
  expect(got.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
});

test('round 3 (critic 8, 10): a tight plan offers the step that helps most in its own words, and the day rows say their why', async ({ page }) => {
  await toFocus(page); await part(page, 'back', 'lats'); await part(page, 'chest', 'upper_chest'); await part(page, 'shoulders', 'side_delts'); await part(page, 'legs', 'quads'); await part(page, 'arms', 'biceps');
  await rest(page);
  // 4 days of 45 min are full: nothing places every pick, so the step that helps most is offered as exactly what it does. Never "yet".
  const fit = page.getByTestId('focus-fit'); await expect(fit).toHaveText(/^With (60 min|5 days|5 days and 60 min), [A-Z][A-Za-z ,]+ get (extra|more)\.$/);
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/\byet\b/);
  const named = (await fit.textContent())!.replace(/^With [^,]+, /, '').replace(/ get (extra|more)\.$/, '').split(/, | and /).filter((n) => !/\d more/.test(n));
  const before = Object.fromEntries(await page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => all.map((r) => [r.textContent!.match(/^[A-Za-z ]+?(?= \d|$| no )/)?.[0]?.trim() ?? '', Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)])));
  // The reveal's day rows carry the same short why as Today's day card (critic 10).
  await expect(page.getByTestId('reveal-day-why').first()).toHaveText(/first today|Extra today: /);
  await expect(page.getByTestId('reveal-week')).toContainText('Upper chest first today');
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await page.locator('[data-testid="focus-add-minutes"], [data-testid="focus-add-day"], [data-testid="focus-add-both"]').tap();
  await expect(page.getByTestId('reveal-card')).toBeVisible();
  // What the line said is what happened: the picks it named have more, and nobody has less.
  await expect.poll(async () => (await page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => all.map((r) => [r.textContent!.match(/^[A-Za-z ]+?(?= \d|$| no )/)?.[0]?.trim() ?? '', Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)] as [string, number]))).filter(([name, n]) => named.includes(name) && n > (before[name] ?? 0)).length).toBe(named.length);
});
