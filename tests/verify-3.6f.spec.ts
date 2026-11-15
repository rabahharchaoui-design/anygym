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
  // PLAN 3.6g: at 45 min all five picks get their extra and nothing is asked, so this flow starts at 30 min, where a step is still offered.
  await rest(page, 'flexible', { minutes: '30' });
  await expect(page.getByTestId('reveal-focus')).toContainText('Lats');
  // Round 2: every row says the total and the extra as what they are (design round 2: name, number, a quiet state; the period once, over the rows).
  await expect(page.getByTestId('reveal-focus')).toContainText('Sets every 4 workouts');
  await expect(page.getByTestId('focus-line-quads')).toHaveText(/^Quads \d+ sets \+\d+ extra$/);
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/nothing extra|with your equipment/);
  // A rotation never claims a calendar week, and nothing is said in jargon or as a zero.
  await expect(page.getByTestId('reveal-focus')).toContainText('every 4 workouts');
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/working sets|rotation|budget|\b0 (sets|min)/);
  await expect(page.getByTestId('reveal-week')).not.toContainText('Mon');
  // Round 2 (BLOCKER 2): the fit line names the minutes (PLAN 3.6g: 45, where it was 60), and the one tap really fixes it: the warning is gone and every pick has its extra.
  // Truth pass (critic r3 1): "prioritized" names only the picks tied for the most extra (Quads, Biceps and Abs, +2 each), never Side shoulders (+1) beside them.
  await expect(page.getByTestId('focus-fit')).toHaveText('5 focus areas fit best with 45 min; we prioritized Quads, Biceps and Abs.');
  // Round 3 (critic 3) and the truth pass: who got more than a pick ranked above it, and why, composed from the result.
  await expect(page.getByTestId('focus-summary')).toHaveText('Lats and Side shoulders have no more room on their days, so Quads, Biceps and Abs get the most.');
  await expect(page.getByTestId('focus-line-side_delts')).toHaveText('Side shoulders 5 sets +1 extra'); await expect(page.getByTestId('focus-line-quads')).toContainText('+2 extra');
  await expect(page.getByTestId('focus-line-lats')).toHaveText('Lats 5 sets no extra');
  const grow = page.getByTestId('focus-add-minutes');
  await grow.tap(); await expect(page.getByTestId('reveal-card')).toBeVisible();
  await expect(page.getByTestId('focus-fit')).toHaveCount(0);
  await expect(page.getByTestId('focus-add-minutes')).toHaveCount(0);
  for (const id of ['lats', 'side_delts', 'quads', 'biceps', 'abs']) await expect(page.getByTestId(`focus-line-${id}`)).toHaveAttribute('data-state', 'extra');
  const extras = await page.getByTestId('reveal-focus').locator('li').evaluateAll((rows) => rows.map((r) => Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)));
  expect(extras.every((n) => n > 0)).toBe(true);
  // PLAN 3.6g: at 45 min the top pick has its whole share, said as the total and the extra.
  await expect(page.getByTestId('focus-line-lats')).toHaveText(/^Lats \d+ sets \+\d+ extra$/); await expect(page.getByTestId('focus-line-lats')).toContainText('+4 extra');
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
  await expect(page.getByTestId('q-focus-grip')).toContainText('None yet');
  // Said whole: the tile's quiet line is never cut short here (it wraps on the 320 floor).
  expect(await page.getByTestId('q-focus-grip').locator('span span').evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
  await pick(page, 'focus', 'arms'); await expect(page.getByTestId('focus-part-forearms')).toContainText('None yet'); await page.keyboard.press('Escape');
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
  // Round 3 (critic 13): balance and picking nothing are the same plan, so they are one control: the tile is lit either way, with no second line saying so.
  await expect(page.getByTestId('q-focus-balance')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('focus-same')).toHaveCount(0);
  // The Undo toast rests under the grid: it never covers the tile that was just tapped (or any other).
  const undo = page.getByRole('status').filter({ hasText: '5 picks cleared' }); await expect(undo).toBeVisible(); await page.waitForTimeout(500);
  const tb = (await undo.boundingBox())!;
  for (const tile of await page.getByTestId('q-focus').getByRole('button').all()) { const r = (await tile.boundingBox())!; expect(r.y + r.height <= tb.y || r.y >= tb.y + tb.height, `toast over ${await tile.innerText()}`).toBe(true); }
  await pick(page, 'focus', 'balance'); await expect(page.getByTestId('q-focus-balance')).toHaveAttribute('aria-pressed', 'true');
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
  // Round 3 (critic 9): then the headline is the rest day and Start steps back to "Train today anyway".
  if (['mon', 'tue', 'thu', 'sat'].includes(today)) await expect(page.getByTestId('day-rest')).toHaveCount(0);
  else await expect(page.getByTestId('day-rest')).toHaveText(/^Rest day · Next: (tomorrow|Mon|Tue|Thu|Sat), Day 1$/);
  await expect(page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: ['mon', 'tue', 'thu', 'sat'].includes(today) ? 'Start' : 'Train today anyway', exact: true })).toBeVisible();
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
  // Truth pass (critic r3 15): both workouts were today, so the card says the day is done, never "Time to recover… Rest today".
  await page.reload(); await expect(page.getByTestId('rotation-title')).toHaveText('Done for today');
  await expect(page.getByTestId('rotation-recovery')).not.toContainText(/Time to recover|Rest today/);
  // The card names the muscles and says when in plain words, never a clock time (round 2).
  await expect(page.getByTestId('rotation-why')).toHaveText(/^[A-Z][a-z ,]+ trained today\. Your next workout keeps its place\.$/);
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

/** Parts of a dotted line ("A · B · C") break only between the parts: no line starts or ends on a dot. */
const cleanBreaks = (h: Element) => [...h.children].slice(1).every((part, i) => {
  const before = h.children[i]!.getBoundingClientRect(), box = part.getBoundingClientRect();
  return box.top < before.bottom - 8 && box.bottom > before.top + 8 ? box.left >= before.right - 1 : Math.abs(box.left - h.getBoundingClientRect().left) < 2;
});
for (const scale of [1, 1.3]) test(`round 3 (critic 9): a rest day reads as a rest day, at ${scale * 100}% text`, async ({ page }) => {
  await textScale(page, scale);
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page, 'fixed'); await accept(page);
  // Four weekdays that are not today, the first of them the day after tomorrow: today is a rest day whatever the date.
  const profile = (await dbAll<Record<string, unknown> & { intake: Record<string, unknown> }>(page, 'profile'))[0]!;
  const at = (new Date().getDay() + 6) % 7;
  const days = [2, 3, 4, 5].map((n) => WEEK[(at + n) % 7]!);
  await put(page, 'profile', { ...profile, intake: { ...profile.intake, weekdays: WEEK.filter((d) => days.includes(d)) } });
  await page.reload();
  const card = page.getByRole('region', { name: "Today's plan day" });
  const short = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(at + 2) % 7];
  // The headline is the rest day; the day that waits is the quieter line under it, with its time still one tap away.
  await expect(page.getByTestId('day-card-title')).toHaveText(`Rest day · Next: ${short}, Day 1`);
  await expect(page.getByTestId('day-rest')).toHaveText(`Rest day · Next: ${short}, Day 1`);
  await expect(page.getByTestId('day-rest-day')).toHaveText(/^Day 1 · .+ · ~\d+ min$/);
  await expect(page.getByTestId('day-card-time')).toBeVisible();
  // Start is still there, as the second choice.
  await expect(card.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  const anyway = card.getByRole('button', { name: 'Train today anyway', exact: true });
  await expect(anyway).toHaveAttribute('data-variant', 'secondary');
  // No dot dangles at a line end or start, in the headline or under it; nothing is cut.
  expect(await page.getByTestId('day-rest').evaluate(cleanBreaks)).toBe(true);
  expect(await page.getByTestId('day-rest-day').evaluate(cleanBreaks)).toBe(true);
  for (const id of ['day-card-title', 'day-rest-day']) expect(await page.getByTestId(id).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(page.getByTestId('week-label')).not.toContainText('Rest day');
  await checkLayout(page, { primary: anyway });
  await anyway.tap(); await expect(page.getByTestId('workout-title')).toBeVisible();
  expect((await dbAll<{ dayId?: string; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!.dayId).toBe('1');
});

test('truth pass (critic r3 5, 6): a first Today on a rest day says one thing: the tour fits the card, no "Extra today", no coach warning', async ({ page }) => {
  // Four weekdays that are not today: the first Today after the intake is a rest day whatever the date.
  const at = (new Date().getDay() + 6) % 7;
  const days = [2, 3, 4, 5].map((n) => WEEK[(at + n) % 7]!);
  await toFocus(page); await part(page, 'back', 'lats'); await part(page, 'chest', 'upper_chest');
  await rest(page, 'fixed', { weekdays: WEEK.filter((d) => days.includes(d)), minutes: '60' });
  // The plan's first day does add for the picks: on a training day its card would say so.
  await expect(page.getByTestId('reveal-day-why').first()).toHaveText(/first today|Extra today: /);
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  // The welcome's first step lights the day card, which has no Start today: its words say so and name the button that is there.
  await expect(page.getByTestId('tour-words')).toHaveAttribute('data-in', 'true');
  await expect(page.getByTestId('welcome-tour')).toHaveAttribute('data-step', 'day');
  await expect(page.getByTestId('tour-line')).toHaveText('Today is a rest day. Your next workout waits here, or tap Train today anyway.');
  const card = page.getByRole('region', { name: "Today's plan day" });
  await expect(card.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Train today anyway', exact: true })).toBeVisible();
  await page.getByTestId('tour-skip').tap(); await expect(page.getByTestId('welcome-tour')).toHaveCount(0);
  // Under "Rest day" there is no "Extra today…" or "… first today", and the coach says nothing about today's work.
  await expect(page.getByTestId('day-rest')).toHaveText(/^Rest day · Next: [A-Z][a-z]{2}, Day 1$/);
  await expect(page.getByTestId('day-focus-why')).toHaveCount(0);
  await expect(card).not.toContainText(/Extra today|first today/);
  await expect(page.getByTestId('coach-line')).toHaveCount(0);
  // A workout yesterday that today's day would work again: still no "today works it again" on a rest day.
  const day1 = (await dbAll<{ planId: string }>(page, 'planState'))[0]!;
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  await put(page, 'sessions', { id: 'rest-yesterday', gymId: 'other', planId: day1.planId, dayId: '1', startedAt: yesterday, endedAt: yesterday + 1000, imported: false });
  for (const n of [0, 1, 2]) await put(page, 'sets', { id: `rest-y-${n}`, sessionId: 'rest-yesterday', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: n, kind: 'work', reps: 8, load: { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [] }, uncertain: false });
  await page.reload(); await expect(page.getByTestId('day-rest')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/works (it|them) again/);
  await checkLayout(page, { primary: card.getByRole('button', { name: 'Train today anyway', exact: true }) });
});

/** The words of an element that are broken across two lines ("Deadlif / t"): none, when names wrap only between words. */
const brokenWords = (el: Element) => {
  const out: string[] = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
    const r = document.createRange(); r.setStart(n, m.index!); r.setEnd(n, m.index! + m[0].length);
    if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) out.push(m[0]);
  }
  return out;
};
/** How many words each line of an element holds, top to bottom. */
const wordsPerLine = (el: Element) => {
  const lines = new Map<number, number>(); const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
    const r = document.createRange(); r.setStart(n, m.index!); r.setEnd(n, m.index! + m[0].length);
    const top = Math.round(r.getBoundingClientRect().top); lines.set(top, (lines.get(top) ?? 0) + 1);
  }
  return [...lines.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
};
for (const scale of [1, 1.3]) test(`round 3 (critic 16): the fifth pick never scrolls the title away, and schedule titles never leave one word alone, at ${scale * 100}% text`, async ({ page }) => {
  await textScale(page, scale);
  await toFocus(page);
  for (const [area, id] of [['chest', 'upper_chest'], ['back', 'lats'], ['shoulders', 'side_delts'], ['arms', 'biceps']] as const) await part(page, area, id);
  // Back at the top, as the person sees the screen; then the fifth pick, from its sheet.
  await page.evaluate(() => { document.querySelector('main[data-scroller]')!.scrollTop = 0; });
  const measure = () => page.evaluate(() => {
    const sc = document.querySelector('main[data-scroller]')!, s = sc.getBoundingClientRect(), h = sc.querySelector('h1')!.getBoundingClientRect();
    const row = document.querySelector('[data-testid="focus-rank-open"]')?.getBoundingClientRect(), cta = document.querySelector('[data-bottom-cta]')!.getBoundingClientRect();
    return { top: sc.scrollTop, title: h.top - s.top, rowTop: row?.top ?? 0, rowBottom: row?.bottom ?? 0, cta: cta.top, titleBottom: h.bottom };
  });
  await pick(page, 'focus', 'legs'); const sheet = page.getByRole('dialog', { name: / focus$/ }); await expect(sheet).toBeVisible();
  // (Reaching a tile under the fold is the person's own scroll; what must not happen is the page moving when the row comes.)
  // Measured as the sheet opens: while it is up the sheet may move the page under it and puts it back when it closes.
  const before = await measure();
  await sheet.getByTestId('focus-part-quads').tap(); await sheet.getByRole('button', { name: 'Done', exact: true }).tap(); await expect(sheet).not.toBeVisible();
  await expect(page.getByTestId('focus-rank-open')).toBeVisible(); await page.waitForTimeout(700);
  // The rank row is in view above Continue without the page having moved: the screen's title stays where it was.
  const at = await measure();
  // (Within a pixel: a scroll position between two pixels settles on one when the row is laid out.)
  expect(Math.abs(at.top - before.top)).toBeLessThanOrEqual(1); expect(Math.abs(at.title - before.title)).toBeLessThanOrEqual(1);
  if (before.top === 0) expect(at.title).toBeGreaterThanOrEqual(0);
  expect(at.rowBottom).toBeLessThanOrEqual(at.cta + 1); expect(at.rowTop).toBeGreaterThan(at.titleBottom);
  // Scrolled to the end, the row is in its own place under the grid: it covers no tile.
  await page.evaluate(() => { const sc = document.querySelector('main[data-scroller]')!; sc.scrollTop = sc.scrollHeight; }); await page.waitForTimeout(300);
  const end = await page.evaluate(() => ({ grid: document.querySelector('[data-testid="q-focus"]')!.getBoundingClientRect().bottom, row: document.querySelector('[data-testid="focus-rank-open"]')!.getBoundingClientRect().top }));
  expect(end.row).toBeGreaterThanOrEqual(end.grid);
  await page.getByTestId('focus-rank-open').tap(); await expect(priorities(page)).toBeVisible(); await rankDone(page);
  await next(page); await step(page, 'experience'); await pick(page, 'experience', '3y'); await step(page, 'days'); await pick(page, 'days', '4'); await step(page, 'weekdays');
  // A schedule title on two lines shares its words: never one word alone on the last line ("Flexible, whenever I / can").
  for (const id of ['fixed', 'flexible', 'weekly']) {
    const lines = await page.getByTestId(`q-schedule-${id}`).evaluate((b, fn) => (new Function(`return (${fn})`)() as (el: Element) => number[])([...b.querySelectorAll('span')].find((x) => x.children.length === 0 && /week|Flexible/.test(x.textContent ?? ''))!), wordsPerLine.toString());
    if (lines.length > 1) expect(lines[lines.length - 1], `${id}: ${lines.join(' / ')}`).toBeGreaterThan(1);
  }
});
test('round 3 (critic 15): the finish screen at 130% text breaks no exercise name inside a word and keeps "ready … morning" together', async ({ page }) => {
  test.setTimeout(60_000);
  await textScale(page, 1.3);
  await afterUpperDay(page);
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const s = (await dbAll<{ id: string; exerciseIds: string[]; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  let order = 0;
  for (const id of s.exerciseIds) for (let n = 0; n < 4; n++) await put(page, 'sets', { id: `fin-${order}`, sessionId: s.id, exerciseId: id, order: order++, kind: 'work', reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 30 }, uncertain: false });
  await page.reload();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Finish/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.tap();
  await expect(page.getByTestId('finish-exercise').first()).toBeVisible(); await page.waitForTimeout(900);
  // Both days were just trained, so the next one waits: "After a rest, ready … morning", the last three words on one line.
  const rest = page.getByTestId('finish-next-rest');
  await expect(rest).toHaveText(/^After a rest, ready (later this morning|this (afternoon|evening)|(tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening))$/);
  expect(await rest.locator('span').evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size)).toBe(1);
  expect(await rest.evaluate((el) => !/[·,]$/.test((el.textContent ?? '').trim()))).toBe(true);
  const rows = page.getByTestId('finish-exercise');
  expect(await rows.count()).toBeGreaterThan(3);
  for (const row of await rows.all()) {
    expect(await row.evaluate(brokenWords), await row.innerText()).toEqual([]);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
});

test('truth pass (critic r3 13): on an SE at 130% text the finish row keeps the exercise name readable, and "sets" is never alone on a line', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await textScale(page, 1.3);
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page); await accept(page);
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  // Four sets of the first lift only (the critic's case: "Barbell Bench Press - Medium Grip", 4 sets × 8 at 45 lb), then Finish.
  const s = (await dbAll<{ id: string; exerciseIds: string[]; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  for (let n = 0; n < 4; n++) await put(page, 'sets', { id: `se-${n}`, sessionId: s.id, exerciseId: s.exerciseIds[0], order: n, kind: 'work', reps: 8, load: { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [] }, uncertain: false });
  await page.reload();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Finish/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.tap();
  const row = page.getByTestId('finish-exercise').first(); await expect(row).toBeVisible(); await page.waitForTimeout(900);
  const name = row.getByTestId('finish-exercise-name');
  await expect(name).toHaveText(/\w+ \w+/);
  // The name: whole (never cut, PLAN 1.7g), on few lines, and wide (the critic saw a five line column beside the numbers).
  const shape = await name.evaluate((el) => { const r = el.getBoundingClientRect(); return { lines: Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight)), share: r.width / el.closest('li')!.getBoundingClientRect().width }; });
  expect(shape.lines).toBeLessThanOrEqual(3);
  expect(shape.share).toBeGreaterThan(0.55);
  expect(await name.evaluate((el) => getComputedStyle(el).webkitLineClamp)).toBe('none');
  expect(await row.evaluate(brokenWords), await row.innerText()).toEqual([]);
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // "you did 4 of N sets": the count and its word stay on one line.
  const why = page.getByTestId('finish-next-why');
  await expect(why).toHaveText(/^Day 1 again · you did 4 of \d+ sets$/);
  expect(await why.locator('span').evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size)).toBe(1);
  expect((await why.evaluate(wordsPerLine)).at(-1)).toBeGreaterThan(1);
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

test('truth pass (critic r3 7, 9): the Settings reveal labels the days Today will follow from the kept place, and "This week" starts fresh the next Monday', async ({ page }) => {
  test.setTimeout(90_000);
  // Monday the 16th of November 2026.
  await page.clock.setSystemTime(new Date(2026, 10, 16, 10));
  await toFocus(page); await part(page, 'arms', 'triceps'); await rest(page); await accept(page);
  // Day 1 done this Monday morning: Day 2 is next.
  const state = (await dbAll<Record<string, unknown> & { planId: string }>(page, 'planState'))[0]!;
  const monday = new Date(2026, 10, 16, 9).getTime();
  await put(page, 'sessions', { id: 'day-one', gymId: 'other', planId: state.planId, dayId: '1', startedAt: monday, endedAt: monday + 1_800_000, imported: false });
  for (const n of [0, 1, 2]) await put(page, 'sets', { id: `day-one-${n}`, sessionId: 'day-one', exerciseId: 'dumbbell-bench-press', order: n, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await put(page, 'planState', { ...state, doneDays: [0], nextDayIndex: 1, pendingDayIndices: [1, 2, 3] });
  // Tuesday the 17th.
  await page.clock.setSystemTime(new Date(2026, 10, 17, 8)); await page.reload();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Next up: Day 2 · /);
  const names = await page.getByTestId('day-card-title').evaluate((h) => [...h.children].map((c) => c.textContent!.replace(/^· /, '')));
  const dayTwo = names[1]!;
  // Settings: the same days each week, Tue, Thu, Sat, Sun.
  await page.goto('./#/settings'); await page.getByTestId('redo-schedule').tap(); await step(page, 'weekdays');
  await pick(page, 'schedule', 'fixed'); for (const d of ['tue', 'thu', 'sat', 'sun']) await pick(page, 'weekdays', d);
  await next(page); await step(page, 'reveal');
  // The critic saw "Tue | Upper A" here, then Today on Tuesday was "Day 2 · Lower A". The list now starts at the kept place: Tuesday is Day 2.
  const rows = page.getByTestId('reveal-week').locator('li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('Tue'); await expect(rows.nth(0)).toContainText(dayTwo);
  for (const [i, d] of ['Tue', 'Thu', 'Sat', 'Sun'].entries()) await expect(rows.nth(i)).toHaveText(new RegExp(`^${d}`));
  await expect(page.getByTestId('reveal-kept')).toHaveText('You keep your place: Day 2 is next.');
  await expect(page.getByTestId('reveal-restart')).toHaveCount(0);
  const dayOne = (await rows.nth(3).textContent())!;
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan', exact: true }).tap(); await expect(page).toHaveURL(/#\/$/);
  // Today on Tuesday is the reveal's Tuesday row.
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 · /); await expect(page.getByTestId('day-card-title')).toContainText(dayTwo);
  await expect(page.getByTestId('day-rest')).toHaveCount(0);
  // This week (Monday's workout was this week): Day 1 is marked done, Day 2 is up next.
  await expect(page.getByTestId('week-label')).toHaveText('This week');
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  // Sunday the 22nd is still this week.
  await page.clock.setSystemTime(new Date(2026, 10, 22, 9)); await page.reload();
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'done');
  // The first row's day name on Sunday is Day 1's (it comes round on Sunday): the reveal said so.
  expect(dayOne).toMatch(/^Sun/);
  // Monday the 23rd: a new week. The critic saw Day 1 still marked done from the week before under "This week".
  await page.clock.setSystemTime(new Date(2026, 10, 23, 8)); await page.reload();
  await expect(page.getByTestId('week-label')).toHaveText('This week');
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'todo');
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  await expect(page.locator('[data-testid^="week-day-"][data-state="done"]')).toHaveCount(0);
  // Nothing saved was touched: the pass still holds Day 1 as done and Day 2 as next.
  const kept = (await dbAll<{ doneDays: number[]; nextDayIndex: number }>(page, 'planState'))[0]!;
  expect(kept.doneDays).toEqual([0]); expect(kept.nextDayIndex).toBe(1);
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
  // PLAN 3.6g: Back and Shoulders now fit with more minutes alone, so the day is offered for Back and Legs ("… fit best with 3 days or 45 min").
  await toFocus(page); await part(page, 'back', 'back'); await part(page, 'legs', 'legs');
  await rest(page, 'fixed', { days: '2', minutes: '30', weekdays: ['mon', 'thu'] });
  await expect(page.getByTestId('reveal-week').locator('li')).toHaveCount(2); await expect(page.getByTestId('reveal-week')).toContainText('Mon'); await expect(page.getByTestId('reveal-week')).toContainText('Thu');
  await expect(page.getByTestId('focus-fit')).toContainText('3 days');
  const before = await page.getByTestId('reveal-plan-name').textContent();
  await page.getByTestId('focus-add-day').tap();
  // The plan is not rebuilt until the day has its weekday: the chips open in place, the picked days stay picked and cannot be taken away here.
  // Truth pass (critic r3 12): the plan is not rebuilt yet, so the card still names and describes the plan as it is (2 days), and the hint says what it will have: nothing on the card says "has 3 days" before it does.
  const ask = page.getByTestId('focus-add-which'); await expect(ask).toContainText('Which day do you add?'); await expect(ask).toContainText('Your plan will have 3 days. Pick 1 more.');
  expect(before).toMatch(/^2 Day /); await expect(page.getByTestId('reveal-plan-name')).toHaveText(before!); await expect(page.getByTestId('reveal-card')).not.toContainText(/has 3 days|3 Day /);
  // The person's own days read as chosen, not as unavailable: a solid accent edge at full strength, like any picked chip; a free day is a plain chip.
  const look = (id: string) => page.getByTestId(id).evaluate((el) => { const c = getComputedStyle(el); return { edge: c.borderTopStyle, opacity: c.opacity, color: c.borderTopColor }; });
  const own = await look('focus-add-mon'), free = await look('focus-add-sat');
  expect(own.edge).toBe('solid'); expect(own.opacity).toBe('1'); expect(own.color).not.toBe(free.color);
  expect(await look('focus-add-thu')).toEqual(own);
  await expect(page.getByTestId('reveal-week').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('focus-add-mon')).toBeDisabled(); await expect(page.getByTestId('focus-add-mon')).toHaveAttribute('aria-pressed', 'true');
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await page.getByTestId('focus-add-sat').tap();
  // One tap: three days, each with its weekday, and now the card names the three day plan.
  await expect(page.getByTestId('reveal-week').locator('li')).toHaveCount(3); await expect(page.getByTestId('reveal-plan-name')).toHaveText(/^3 Day /);
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
  await expect(page.getByTestId('focus-summary')).toHaveText(/^Back( and Posture)? already gets? plenty, so [A-Z][A-Za-z ,]+ gets? the most\.$/);
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
  // PLAN 3.6g: the five picks this used at 4 days of 45 min are now all placed by 5 days or 60 min. A plan where no step places every pick: Glutes, Upper chest, Upper back and Triceps on 3 days of 30 min.
  await toFocus(page); await pick(page, 'focus', 'glutes'); await part(page, 'chest', 'upper_chest'); await part(page, 'back', 'upper_back'); await part(page, 'arms', 'triceps');
  await rest(page, 'flexible', { days: '3', minutes: '30' });
  // 3 days of 30 min are full: nothing places every pick, so the step that helps most is offered as exactly what it does. Never "yet".
  const fit = page.getByTestId('focus-fit'); await expect(fit).toHaveText(/^With (\d+ min|\d days|\d days and \d+ min), [A-Z][A-Za-z ,]+ get (extra|more)\. That is the most that fits\.$/);
  await expect(fit).toHaveText('With 4 days, Upper chest and Triceps get more. That is the most that fits.');
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/\byet\b/);
  const named = (await fit.textContent())!.replace(/^With [^,]+, /, '').replace(/ get (extra|more)\. That is the most that fits\.$/, '').split(/, | and /);
  const before = Object.fromEntries(await page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => all.map((r) => [r.textContent!.match(/^[A-Za-z ]+?(?= \d|$| no )/)?.[0]?.trim() ?? '', Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)])));
  // The reveal's day rows carry the same short why as Today's day card (critic 10).
  await expect(page.getByTestId('reveal-day-why').first()).toHaveText(/first today|Extra today: /);
  await expect(page.getByTestId('reveal-week')).toContainText('Upper chest first today');
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await page.locator('[data-testid="focus-add-minutes"], [data-testid="focus-add-day"], [data-testid="focus-add-both"]').tap();
  await expect(page.getByTestId('reveal-card')).toBeVisible();
  // What the line said is what happened: the picks it named have more, and nobody has less.
  await expect.poll(async () => (await page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => all.map((r) => [r.textContent!.match(/^[A-Za-z ]+?(?= \d|$| no )/)?.[0]?.trim() ?? '', Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)] as [string, number]))).filter(([name, n]) => named.includes(name) && n > (before[name] ?? 0)).length).toBe(named.length);
  // Truth pass (critic r3 2): the step was partial and final, so nothing more is asked after it, and nobody has less.
  await expect(page.locator('[data-testid="focus-add-minutes"], [data-testid="focus-add-day"], [data-testid="focus-add-both"]')).toHaveCount(0);
  const after = Object.fromEntries(await page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => all.map((r) => [r.textContent!.match(/^[A-Za-z ]+?(?= \d|$| no )/)?.[0]?.trim() ?? '', Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)])));
  for (const [name, n] of Object.entries(before)) expect(after[name], name).toBeGreaterThanOrEqual(n as number);
});

test('truth pass (critic r3 2): a one tap fix is the last thing asked, and the reveal after it is composed from the rebuilt plan only', async ({ page }) => {
  await toFocus(page); await part(page, 'chest', 'upper_chest'); await part(page, 'shoulders', 'side_delts'); await part(page, 'arms', 'biceps');
  await rest(page, 'flexible', { days: '4', minutes: '30' });
  // The critic saw "With 5 days, Upper chest gets extra", then at 5 days a new box asking for 6 days and 45 min. Now the one step that places everything is offered once.
  // PLAN 3.6g: 45 min places all three (it was 60).
  const fit = page.getByTestId('focus-fit'); await expect(fit).toHaveText('3 focus areas fit best with 45 min; we prioritized Biceps.');
  await expect(page.getByTestId('focus-summary')).toHaveText('Upper chest and Side shoulders have no more room on their days, so Biceps gets the most.');
  const read = () => page.getByTestId('reveal-focus').locator('li').evaluateAll((all) => Object.fromEntries(all.map((r) => [r.getAttribute('data-testid')!, Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)])));
  const before = await read();
  await page.getByTestId('focus-add-minutes').tap();
  // No box, no button, no sentence from before the tap; every pick has its extra and none has less.
  await expect(fit).toHaveCount(0);
  await expect(page.locator('[data-testid="focus-add-minutes"], [data-testid="focus-add-day"], [data-testid="focus-add-both"]')).toHaveCount(0);
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/no more room|less room|prioritized/);
  for (const id of ['upper_chest', 'side_delts', 'biceps']) await expect(page.getByTestId(`focus-line-${id}`)).toHaveAttribute('data-state', 'extra');
  const after = await read();
  for (const [id, n] of Object.entries(before)) expect(after[id], id).toBeGreaterThanOrEqual(n);
  // The summary, when there is one, is the rebuilt plan's own.
  const summary = page.getByTestId('focus-summary');
  if (await summary.count()) await expect(summary).toHaveText(/^(Most extra work: [A-Z][A-Za-z ,]+\.|Every pick gets the same extra work: \+\d\.)/);
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
});

test('PLAN 3.6g: Back, Shoulders and Arms at 45 minutes each get real extra sets, and nothing more is asked', async ({ page }) => {
  await toFocus(page); await part(page, 'back', 'back'); await part(page, 'shoulders', 'shoulders'); await part(page, 'arms', 'arms');
  await rest(page);
  // Every pick has its extra, said as a number; no box, no button.
  await expect(page.getByTestId('focus-fit')).toHaveCount(0);
  await expect(page.locator('[data-testid="focus-add-minutes"], [data-testid="focus-add-day"], [data-testid="focus-add-both"]')).toHaveCount(0);
  const extras = await page.getByTestId('reveal-focus').locator('li').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [r.getAttribute('data-testid')!, Number(/\+(\d+) extra/.exec(r.textContent ?? '')?.[1] ?? 0)])));
  expect(extras).toEqual({ 'focus-line-back': 4, 'focus-line-shoulders': 5, 'focus-line-arms': 3 });
  for (const id of ['back', 'shoulders', 'arms']) await expect(page.getByTestId(`focus-line-${id}`)).toHaveAttribute('data-state', 'extra');
  // Who got the most and why a lower pick is ahead, from the numbers.
  await expect(page.getByTestId('focus-summary')).toHaveText('Back already has its share, so Shoulders gets the most.');
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/no extra|no room|\byet\b/);
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
});

for (const scale of [1, 1.3]) test(`PLAN 3.6g: Mobility alone at 45 minutes: every session ends with a stretch block, said in minutes on the reveal, Today, the plan and the workout, at ${scale * 100}% text`, async ({ page }) => {
  await textScale(page, scale); await toFocus(page); await pick(page, 'focus', 'mobility');
  await rest(page, 'flexible', { days: '3' });
  // The reveal: minutes, never sets, and no "no room"; the caption says stretch time.
  await expect(page.getByTestId('reveal-focus')).toContainText('Stretch time every 3 workouts');
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/\bSets\b|no room/);
  await expect(page.getByTestId('focus-line-mobility')).toHaveAttribute('data-state', 'extra');
  await expect(page.getByTestId('focus-line-mobility')).toContainText('22 min'); await expect(page.getByTestId('focus-line-mobility')).toContainText('Stretches');
  await expect(page.getByTestId('focus-fit')).toHaveCount(0);
  await expect(page.getByTestId('reveal-day-why')).toHaveCount(3);
  for (const why of await page.getByTestId('reveal-day-why').all()) await expect(why).toHaveText(/^Extra today: [568] min of stretches$/);
  // Inside the minutes chosen.
  for (const row of await page.getByTestId('reveal-week').locator('li').all()) expect(Number(/~(\d+) min/.exec((await row.textContent())!)![1])).toBeLessThanOrEqual(45);
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await accept(page);
  await expect(page.getByTestId('day-focus-why')).toHaveText('Extra today: 8 min of stretches');
  // The plan: one card for the block on each day, labeled with its minutes, each hold as one number; the day's why sits under its title.
  const planId = (await dbAll<{ planId: string }>(page, 'planState'))[0]!.planId;
  await page.goto(`./#/plans/${planId}`);
  const cards = page.getByTestId('plan-stretches'); await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('Stretches · 8 min, back to back');
  await expect(cards.first().locator('li')).toHaveCount(3);
  await expect(cards.first()).toContainText('2 sets × 80 sec');
  await expect(cards.first()).not.toContainText(/80 to 80|Pair|rest/);
  await expect(page.getByTestId('plan-pair')).toHaveCount(await page.locator('[data-kind="pair"]:not([data-mobility])').count());
  const why = page.getByTestId('plan-day-why-1'); await expect(why).toHaveText('Extra today: 8 min of stretches');
  const head = await why.evaluate((el) => { const title = el.parentElement!.querySelector('h2')!; const t = title.getBoundingClientRect(), w = el.getBoundingClientRect(); return { under: w.top >= t.bottom - 1, lines: Math.round(t.height / parseFloat(getComputedStyle(title).lineHeight)) }; });
  expect(head.under).toBe(true);
  // The title has the row to itself: it only wraps where the words need it (two lines at the most here), never squeezed beside the why.
  expect(head.lines).toBeLessThanOrEqual(2);
  await cards.first().scrollIntoViewIfNeeded(); await rootAtRest(page);
  await checkLayout(page);
  // The workout: the same block, back to back, at the end of the list.
  await page.goto('./#/'); await page.getByTestId('day-preview').tap();
  await page.getByTestId('quick-start').getByRole('button', { name: 'Start workout', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const block = page.getByTestId('mobility-group'); await expect(block).toHaveCount(1);
  await expect(block).toContainText('Stretches: back to back'); await expect(block).toContainText('Static Pigeon Stretch'); await expect(block).not.toContainText('80 to 80');
});

test('PLAN 3.6g: a forearm move approved on this phone serves Grip and Forearms: the tile and the part lose "No exercises yet", and the plan gives Grip real sets; Obliques still says so', async ({ page }) => {
  await page.goto('./'); await step(page, 'goal');
  await put(page, 'candidateReviews', { id: 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', decision: 'approve', at: 1000 });
  await page.reload(); await step(page, 'goal'); await pick(page, 'goal', 'muscle'); await next(page);
  await step(page, 'units'); await next(page); await step(page, 'focus');
  await expect(page.getByTestId('q-focus-grip')).not.toContainText('No exercises yet');
  await pick(page, 'focus', 'arms'); await expect(page.getByTestId('focus-part-forearms')).not.toContainText('No exercises yet'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pick(page, 'focus', 'core'); await expect(page.getByTestId('focus-part-obliques')).toContainText('No exercises yet'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pick(page, 'focus', 'grip');
  await rest(page);
  await expect(page.getByTestId('focus-line-grip')).toHaveAttribute('data-state', 'extra');
  await expect(page.getByTestId('focus-line-grip')).toHaveText(/^Grip \d+ sets \+\d+ extra$/);
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/\byet\b|needs equipment/);
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
});
