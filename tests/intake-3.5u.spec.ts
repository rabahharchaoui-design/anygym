import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';
import { dbAll, dbPut, navIdle } from './workout-helpers';
import { boxOf, dayLit, spotFrames, tourLineMax, type TourTarget } from './helpers/tour';

// PLAN 3.5u: the intake ends in the app, not in a workout. After Your plan, "Looks good" lands on
// Today with nothing started; the first visit shows a short, skippable 3 step welcome (the day card
// and Start, "Got X min?", the tab bar), once; and no question says Coming soon any more.

test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const SHOT_PHONES = new Set(['iPhone SE', 'iPhone 15']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOT_PHONES.has(phone)) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `reports/shots/3.5u/${name}-${phone.replace(/ /g, '-')}.png` });
};

const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const FULL = { goal: 'muscle', goals: ['muscle'], units: US, focus: ['balance'], experience: '3y', days: 5, minutes: 60, place: 'full', equipmentFor: 'full', style: 'mix', cardio: 'little' };

const atStep = (page: Page, step: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', step);
const cta = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
const revealPrimary = (page: Page) => page.getByTestId('reveal-cta').locator('button[data-variant="primary"]');
const tour = (page: Page) => page.getByTestId('welcome-tour');

/** A fresh phone put on the reveal with these answers (the funnel's own draft, as a reload finds it). */
async function toReveal(page: Page, answers: Record<string, unknown> = FULL) {
  await page.goto('./');
  await atStep(page, 'goal');
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'about', answers: a })), answers);
  await page.reload();
  await atStep(page, 'about');
  await page.getByTestId('skip').tap();
  await atStep(page, 'reveal');
  // A tap during the 280 ms push lands on the view transition, not the page (PLAN 3.6v).
  await navIdle(page);
}

/** The spotlight sits on the element: its box is the element's, grown by the same few points on every side. */
async function expectSpotOn(page: Page, target: TourTarget) {
  await expect
    .poll(async () => {
      const s = await page.getByTestId('tour-spot').boundingBox();
      const t = await boxOf(target);
      if (!s || !t) return 'missing';
      const pads = [t.x - s.x, t.y - s.y, s.x + s.width - (t.x + t.width), s.y + s.height - (t.y + t.height)];
      return pads.every((p) => p >= 3 && p <= 9) ? 'on' : `off by ${pads.map((p) => p.toFixed(1)).join(', ')}`;
    })
    .toBe('on');
  // The lit element is whole on the screen, and the words never sit on it.
  const view = page.viewportSize()!;
  const t = (await boxOf(target))!;
  expect(t.y).toBeGreaterThanOrEqual(0);
  expect(t.y + t.height).toBeLessThanOrEqual(view.height);
  const w = (await page.getByTestId('tour-words').boundingBox())!;
  expect(w.y + w.height <= t.y || w.y >= t.y + t.height).toBe(true);
  expect(w.x).toBeGreaterThanOrEqual(0);
  expect(w.x + w.width).toBeLessThanOrEqual(view.width);
  expect(w.y + w.height).toBeLessThanOrEqual(view.height);
}

const flag = async (page: Page) => (await dbAll(page, 'profile'))[0]?.welcomeTour;

test('a fresh phone through the intake: no question says Coming soon, Looks good lands on Today, no workout starts @matrix', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welcome$/);
  const seen: string[] = [];
  const at = async (step: string) => {
    await atStep(page, step);
    seen.push(step);
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
    await expect(page.getByTestId('soon')).toHaveCount(0);
  };
  const pick = (screen: string, id: string) => page.getByTestId(`q-${screen}-${id}`).tap();
  await at('goal');
  await pick('goal', 'muscle');
  await cta(page).tap();
  await at('units');
  await cta(page).tap();
  await at('focus');
  await pick('focus', 'balance');
  await cta(page).tap();
  await at('experience');
  await pick('experience', '3y');
  await at('days');
  await pick('days', '5');
  await at('weekdays');
  await page.getByTestId('skip').tap();
  await at('minutes');
  await pick('minutes', '60');
  await at('place');
  await pick('place', 'full');
  await at('equipment');
  await cta(page).tap();
  await at('style');
  await pick('style', 'mix');
  await at('cardio');
  await pick('cardio', 'little');
  await cta(page).tap();
  await at('easyOn');
  await page.getByTestId('skip').tap();
  await at('exercises');
  await page.getByTestId('skip').tap();
  await at('about');
  await page.getByTestId('skip').tap();
  await at('reveal');
  // The three questions whose feature is not built are not asked.
  expect(seen).toEqual(['goal', 'units', 'focus', 'experience', 'days', 'weekdays', 'minutes', 'place', 'equipment', 'style', 'cardio', 'easyOn', 'exercises', 'about', 'reveal']);
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(revealPrimary(page)).toHaveText('Looks good');
  // One action: nothing on the reveal starts a workout.
  await expect(page.getByTestId('reveal-cta').getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Start/ })).toHaveCount(0);
  await shot(page, 'reveal');
  await revealPrimary(page).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('day-card-title')).toContainText('Day 1');
  await expect(tour(page)).toBeVisible();
  // The plan is saved as before; no workout exists.
  expect(await dbAll(page, 'sessions')).toHaveLength(0);
  expect(await dbAll(page, 'sets')).toHaveLength(0);
  expect(await dbAll(page, 'planState')).toMatchObject([{ planId: 'five-day-split', nextDayIndex: 0 }]);
  expect(await flag(page)).toBe('pending');
  expect(await page.evaluate(() => localStorage.getItem('anygym.intakeDraft'))).toBeNull();
});

test('the welcome: three steps, each spotlight on its element; Done persists; a reload never shows it again @matrix', async ({ page }) => {
  await toReveal(page);
  await revealPrimary(page).tap();
  await expect(tour(page)).toBeVisible();
  const line = page.getByTestId('tour-line');
  const next = page.getByTestId('tour-next');

  // 1: the day card, with Start inside the light.
  await expect(tour(page)).toHaveAttribute('data-step', 'day');
  await expect(line).toHaveText("Today's workout. Tap Start to begin.");
  const day = page.getByRole('region', { name: "Today's plan day" });
  await expectSpotOn(page, dayLit(page));
  await expect(day.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  // Start is inside the light, whole, even where the card is lit only down to it.
  const spot = (await page.getByTestId('tour-spot').boundingBox())!;
  const start = (await day.getByRole('button', { name: 'Start', exact: true }).boundingBox())!;
  expect(start.y).toBeGreaterThanOrEqual(spot.y);
  expect(start.y + start.height).toBeLessThanOrEqual(spot.y + spot.height);
  await expect(next).toHaveText('Next');
  await expect(page.getByTestId('tour-skip')).toHaveText('Skip');
  // One line of words (wrapped once at most under 375 points), and focus is not taken from the page.
  const h = (await line.boundingBox())!.height;
  expect(h).toBeLessThan(tourLineMax(page));
  expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="welcome-tour"]') === null)).toBe(true);
  await shot(page, 'tour-1-day');

  // 2: "Got X min?".
  await next.tap();
  await expect(tour(page)).toHaveAttribute('data-step', 'quick');
  await expect(line).toHaveText('Short on time? Get one built to fit.');
  await expect(page.getByTestId('build-card')).toContainText('Got 60 min?');
  await expectSpotOn(page, page.getByTestId('build-card'));
  await shot(page, 'tour-2-quick');

  // 3: the tab bar. A tap outside the light also moves on (here: from 2 to 3 was Next; try outside on a fresh run below).
  await next.tap();
  await expect(tour(page)).toHaveAttribute('data-step', 'tabs');
  await expect(line).toHaveText('Runs, history and plans live here.');
  const capsule = page.locator('[data-tour="tabs"]');
  await expectSpotOn(page, capsule);
  await expect(capsule.getByRole('link')).toHaveText(['Today', 'Run', 'History', 'Plans']);
  await expect(next).toHaveText('Done');
  await shot(page, 'tour-3-tabs');

  await next.tap();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => flag(page)).toBe('done');
  expect(await dbAll(page, 'sessions')).toHaveLength(0);
  await shot(page, 'today-after');
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(tour(page)).toHaveCount(0);
  // Another tab and back: still gone.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }).tap();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).tap();
  await page.waitForTimeout(1200);
  await expect(tour(page)).toHaveCount(0);
});

test('Skip ends it for good; a tap outside the light moves on', async ({ page }) => {
  await toReveal(page);
  await revealPrimary(page).tap();
  await expect(tour(page)).toHaveAttribute('data-step', 'day');
  // Outside the light and the words: the top of the page.
  await page.touchscreen.tap(20, 30);
  await expect(tour(page)).toHaveAttribute('data-step', 'quick');
  // The tap went to the welcome, not to what is under it (Settings is up there).
  await expect(page).toHaveURL(/#\/$/);
  await page.getByTestId('tour-skip').tap();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => flag(page)).toBe('done');
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(tour(page)).toHaveCount(0);
});

test('it never blocks Start: Start inside the light starts Day 1, and the welcome is over', async ({ page }) => {
  await toReveal(page);
  await revealPrimary(page).tap();
  await expect(tour(page)).toHaveAttribute('data-step', 'day');
  await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect(tour(page)).toHaveCount(0);
  expect(await dbAll(page, 'sessions')).toHaveLength(1);
  await expect.poll(() => flag(page)).toBe('done');
});

test('reduced motion: the same three steps, the light simply there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toReveal(page);
  await revealPrimary(page).tap();
  await expect(tour(page)).toHaveAttribute('data-step', 'day');
  await expectSpotOn(page, dayLit(page));
  // No travel: every frame the light is either still on the day card or on the next element (as
  // the element is then or up to two frames before: the light is read, then drawn, once a frame).
  const frames = await spotFrames(page, '[data-testid="build-card"]', () => page.getByTestId('tour-next').tap());
  const s = (await page.getByTestId('tour-spot').boundingBox())!;
  const t = (await page.getByTestId('build-card').boundingBox())!;
  expect(Math.abs(s.y - t.y)).toBeLessThan(10);
  const from = frames[0]![0];
  const on = (y: number, i: number) => [frames[i]?.[1], frames[i - 1]?.[1], frames[i - 2]?.[1]].some((ty) => ty != null && Math.abs(y + 6 - ty) <= 1);
  const between = frames.filter(([y], i) => Math.abs(y - from) > 1 && !on(y, i));
  expect(between, `in between: ${JSON.stringify(frames)}`).toEqual([]);
  await page.getByTestId('tour-next').tap();
  await expectSpotOn(page, page.locator('[data-tour="tabs"]'));
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => flag(page)).toBe('done');
});

test('the no plan notice has one action and it keeps going: no quick workout starts from the intake', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'noPlan', answers: a })), { goal: 'muscle', goals: ['muscle'], units: US, place: 'home', equipmentFor: 'home', equipment: [] });
  await page.reload();
  await atStep(page, 'noPlan');
  const keep = page.getByTestId('noplan-cta').getByRole('button');
  await expect(keep).toHaveCount(1);
  await expect(keep).toHaveText('Keep going');
  await expect(page.getByRole('button', { name: /Start/ })).toHaveCount(0);
  await shot(page, 'noplan');
  await keep.tap();
  await atStep(page, 'style');
  expect(await dbAll(page, 'sessions')).toHaveLength(0);
});

test.describe('someone who finished the intake before this', () => {
  test.use({ intake: 'done' });

  test('never sees the welcome, on Today or after answering the questions again; the shorter redo keeps older answers', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    // The profile as an older build saved it: no flag, with answers to the questions now hidden.
    const old = { ...FULL, when: 'early', bodyweight: { value: 180, unit: 'lb' }, win: ['energy'] };
    const before = (await dbAll(page, 'profile'))[0] ?? { id: 'me', defaultUnit: 'lb', createdAt: 1 };
    await dbPut(page, { profile: [{ ...before, intakeDoneAt: 1, intake: old }] });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(tour(page)).toHaveCount(0);

    // Settings → Answer the questions again: the shorter flow, straight through.
    await page.goto('./#/welcome?redo=1');
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const step = (await page.getByTestId('intake').getAttribute('data-step'))!;
      seen.push(step);
      await expect(page.getByText(/coming soon/i)).toHaveCount(0);
      if (step === 'reveal') break;
      const skip = page.getByTestId('skip');
      if ((await cta(page).count()) && (await cta(page).isEnabled())) await cta(page).tap();
      else if (await skip.count()) await skip.tap();
      else await page.locator(`[data-testid^="q-${step}-"][aria-pressed="true"], [data-testid^="q-${step}-"][aria-checked="true"], [data-testid^="q-${step}-"][data-picked]`).first().tap();
      await expect(page.getByTestId('intake')).not.toHaveAttribute('data-step', step);
    }
    expect(seen).not.toContain('win');
    expect(seen).not.toContain('when');
    expect(seen).not.toContain('bodyweight');
    expect(seen.at(-1)).toBe('reveal');
    await expect(revealPrimary(page)).toHaveText('Use this plan');
    await revealPrimary(page).tap();
    await expect(page).toHaveURL(/#\/$/);
    await page.waitForTimeout(1500);
    await expect(tour(page)).toHaveCount(0);
    const p = (await dbAll(page, 'profile'))[0]!;
    expect(p.welcomeTour).toBeUndefined();
    // The older answers to the hidden questions are still there.
    expect(p.intake).toMatchObject({ when: 'early', bodyweight: { value: 180, unit: 'lb' }, win: ['energy'] });
    expect(await dbAll(page, 'sessions')).toHaveLength(0);
  });
});
