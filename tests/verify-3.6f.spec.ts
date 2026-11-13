// PLAN 3.6f: real phone intake, saved priorities, weekly choices and recovery. The helper runs these.
import { test, expect, type Page } from './fixtures';
import { touchDragVertical } from './helpers/touch';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
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
async function rest(page: Page, style = 'flexible') {
  await next(page); await step(page, 'experience'); await pick(page, 'experience', '3y');
  await step(page, 'days'); await pick(page, 'days', '4'); await step(page, 'weekdays');
  await pick(page, 'schedule', style);
  if (style === 'fixed') for (const d of ['mon', 'tue', 'thu', 'sat']) await pick(page, 'weekdays', d);
  else await expect(page.getByTestId('q-weekdays-mon')).toHaveCount(0);
  await next(page); await step(page, 'minutes'); await pick(page, 'minutes', '45');
  await step(page, 'place'); await pick(page, 'place', 'full'); await step(page, 'equipment'); await next(page);
  await step(page, 'style'); await pick(page, 'style', 'mix'); await step(page, 'cardio'); await pick(page, 'cardio', 'little'); await next(page);
  await step(page, 'easyOn'); await skip(page); await step(page, 'exercises'); await skip(page); await step(page, 'about'); await skip(page); await step(page, 'reveal');
}
async function accept(page: Page) {
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const skipTour = page.getByRole('button', { name: 'Skip tour', exact: true });
  if (await skipTour.isVisible()) await skipTour.tap();
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
  // The fifth pick brings "Your priorities" up by itself, as its own sheet.
  await part(page, 'core', 'abs');
  const rank = page.getByTestId('focus-rank'); await expect(rank).toBeVisible();
  await rank.getByRole('button', { name: 'Move Quads up', exact: true }).tap();
  await expect(rank.locator('li').nth(2)).toContainText('Quads');
  await checkLayout(page, { primary: priorities(page).getByRole('button', { name: 'Done', exact: true }) });
  for (const button of await rank.getByRole('button').all()) { const box = (await button.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(48); expect(box.width).toBeGreaterThanOrEqual(48); }
  await rankDone(page);
  await expect(page.getByTestId('focus-rank-top')).toContainText('Lats and width and Side shoulders for width');
  await checkLayout(page, { primary: page.getByTestId('intake-cta').getByRole('button', { name: 'Continue', exact: true }) });
  // A reload keeps the order and does not raise the sheet again: it is one tap away.
  await page.reload(); await step(page, 'focus'); await expect(page.getByTestId('focus-rank')).toHaveCount(0);
  await page.getByTestId('focus-rank-open').tap(); await expect(page.getByTestId('focus-rank').locator('li').nth(2)).toContainText('Quads'); await rankDone(page);
  await rest(page);
  await expect(page.getByTestId('reveal-focus')).toContainText('Lats and width');
  // A rotation never claims a calendar week, and nothing is said in jargon or as a zero.
  await expect(page.getByTestId('reveal-focus')).toContainText('work: ');
  await expect(page.getByTestId('reveal-focus')).toContainText('every 4 workouts');
  await expect(page.getByTestId('reveal-focus')).not.toContainText(/working sets|rotation|budget|\b0 (sets|min)/);
  await expect(page.getByTestId('reveal-week')).not.toContainText('Mon');
  const grow = page.getByTestId('focus-add-minutes');
  if (await grow.isVisible()) { await grow.tap(); await expect(page.getByTestId('reveal-card')).toBeVisible(); }
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }) });
  await accept(page);
  expect(await dbAll(page, 'sessions')).toEqual([]);
  await expect(page.getByTestId('day-card-title')).toContainText('Next up');
  await expect(page.getByTestId('week-label')).toContainText('rotation');
  await expect(page.getByText('Missed workouts', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('day-focus-why')).toContainText('every 4 workouts');
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
  await toFocus(page); await part(page, 'back', 'lats');
  await pick(page, 'focus', 'arms');
  await page.getByRole('dialog').getByTestId('focus-part-biceps').tap();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'false');
  await part(page, 'arms', 'biceps'); await part(page, 'legs', 'quads'); await part(page, 'shoulders', 'side_delts'); await part(page, 'core', 'abs');
  await expect(page.getByTestId('focus-rank').locator('li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Move Abs up', exact: true }).tap();
  const last = page.getByRole('button', { name: 'Drag Side shoulders for width', exact: true });
  await touchDragVertical(page, last, -70);
  await expect(page.getByTestId('rank-side_delts')).not.toContainText('5.');
  await rankDone(page);
  // A choice the app has no sure exercise for says so before it is picked, on the tile and in the sheet.
  await expect(page.getByTestId('q-focus-grip')).toContainText('No exercises yet');
  await pick(page, 'focus', 'arms'); await expect(page.getByTestId('focus-part-forearms')).toContainText('No exercises yet'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pick(page, 'focus', 'balance'); await expect(page.getByTestId('focus-rank-open')).toHaveCount(0);
  for (const id of ['back', 'arms', 'legs', 'shoulders', 'core']) await expect(page.getByTestId(`q-focus-${id}`)).toHaveAttribute('aria-pressed', 'false');
  await part(page, 'arms', 'triceps'); await expect(page.getByTestId('q-focus-balance')).toHaveAttribute('aria-pressed', 'false');
  await rest(page); await accept(page);
  await page.goto('./#/settings');
  await expect(page.getByText('Answer the questions again', { exact: true })).toBeVisible();
  await page.getByText('Answer the questions again', { exact: true }).tap(); await step(page, 'goal'); await next(page); await step(page, 'units'); await next(page); await step(page, 'focus');
  await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await step(page, 'focus'); await expect(page.getByTestId('q-focus-arms')).toHaveAttribute('aria-pressed', 'true');
});

test('fixed weekdays label the reveal; weekly asks once and keeps the saved days', async ({ page }) => {
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page, 'fixed');
  await expect(page.getByTestId('reveal-week')).toContainText('Mon'); await accept(page);
  const profiles = await dbAll<Record<string, unknown> & { intake: Record<string, unknown> }>(page, 'profile');
  await put(page, 'profile', { ...profiles[0], welcomeTour: 'done', intake: { ...profiles[0]!.intake, scheduleStyle: 'weekly' } });
  await page.reload(); const sheet = page.getByRole('dialog', { name: 'Which days this week?' }); await expect(sheet).toBeVisible();
  // No days is never saved silently: Save waits for a day and says so.
  await expect(sheet.getByRole('button', { name: 'Save days', exact: true })).toBeDisabled(); await expect(sheet.getByRole('note')).toHaveText('Pick at least one day');
  await sheet.getByTestId('week-tue').tap(); await checkLayout(page, { primary: sheet.getByRole('button', { name: 'Save days', exact: true }) });
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
  await expect(page.getByTestId('week-schedule-days')).toHaveText('Tue');
  await page.getByTestId('week-schedule-open').tap(); await expect(sheet.getByTestId('week-tue')).toHaveAttribute('aria-pressed', 'true');
});

test('flexible recovery defers a trained day, then shows honest recovery when every pending day is blocked', async ({ page }) => {
  await toFocus(page); await pick(page, 'focus', 'balance'); await rest(page); await accept(page);
  const state = (await dbAll<{ id: string; planId: string; nextDayIndex: number }>(page, 'planState'))[0]!;
  // The four-day upper/lower plan: a real logged upper-body set makes the lower day next.
  await put(page, 'sessions', { id: 'recovery-upper', gymId: 'other', startedAt: Date.now() - 1000, endedAt: Date.now(), imported: false });
  await put(page, 'sets', { id: 'upper-set', sessionId: 'recovery-upper', exerciseId: 'dumbbell-bench-press', order: 0, kind: 'work', reps: 8, load: { kind: 'dumbbell_each', unit: 'lb', total: 10 }, uncertain: false });
  await page.reload(); await expect(page.getByTestId('day-card-title')).toContainText('Day 2');
  await put(page, 'sessions', { id: 'recovery-lower', gymId: 'other', startedAt: Date.now() - 1000, endedAt: Date.now(), imported: false });
  await put(page, 'sets', { id: 'lower-set', sessionId: 'recovery-lower', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 8, load: { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [] }, uncertain: false });
  await page.reload(); await expect(page.getByTestId('rotation-recovery')).toContainText('Time to recover');
  await expect(page.getByRole('region', { name: "Today's plan day" })).toHaveCount(0);
  await expect(page.getByTestId('rotation-train-anyway')).toBeVisible();
  expect((await dbAll<{ nextDayIndex: number }>(page, 'planState'))[0]!.nextDayIndex).toBe(state.nextDayIndex);
});

test('reduced motion keeps all parts, targets and the reachable action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await toFocus(page); await pick(page, 'focus', 'chest');
  const sheet = page.getByRole('dialog'); await checkLayout(page, { primary: sheet.getByRole('button', { name: 'Done', exact: true }) });
  for (const button of await sheet.getByRole('button').all()) {
    const box = await button.boundingBox(); if (box) { expect(box.height).toBeGreaterThanOrEqual(48); expect(box.width).toBeGreaterThanOrEqual(48); }
  }
  await sheet.getByTestId('focus-part-upper_chest').tap(); await sheet.getByRole('button', { name: 'Done', exact: true }).tap(); await rest(page);
  await expect(page.getByTestId('reveal-focus')).toContainText('Upper chest');
});
