import { expect, guardContext, test, type Locator, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
import { quickWith } from './workout-helpers';

// PLAN 3.3: the intake funnel (SPEC 14). A brand new phone opens it; anyone with a profile, a
// workout or a plan never sees it again by itself. One question per screen, single choice screens
// move on by themselves, Skip on personal ones, the units preselected from the phone's region,
// the reveal picks an existing plan honestly and Start Day 1 goes straight into the workout.

test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const SHOT_PHONES = new Set(['iPhone SE', 'iPhone 17 Pro Max']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOT_PHONES.has(phone)) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/3.3/${name}-${phone.replace(/ /g, '-')}.png` });
};

const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, step: string) => expect(intake(page)).toHaveAttribute('data-step', step);
const cta = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
/** The round back button in the header (a focus chip is also called Back). */
const revealPrimary = (page: Page) => page.getByTestId('reveal-cta').locator('button[data-variant="primary"]');
const backButton = (page: Page) => page.locator('header').getByRole('button', { name: 'Back', exact: true });

/** Counts every tap a user makes. */
class Taps {
  n = 0;
  constructor(private page: Page) {}
  async tap(l: Locator) {
    this.n++;
    await l.tap();
  }
  pick = (screen: string, id: string) => this.tap(this.page.getByTestId(`q-${screen}-${id}`));
  next = () => this.tap(cta(this.page));
  skip = () => this.tap(this.page.getByTestId('skip'));
}

/** IndexedDB rows of one store, read straight from the database. */
const dbAll = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const q = req.result.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            req.result.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
    store,
  );

const dbPut = (page: Page, store: string, row: Record<string, unknown>) =>
  page.evaluate(
    ([name, value]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(name, 'readwrite');
          tx.objectStore(name).put(value);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [store, row] as const,
  );

/** iOS text size 130% on everything on screen now (run again after each new screen). */
async function text130(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((e) => !e.dataset.t130);
    root.style.fontSize = '100%';
    const a = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    root.style.fontSize = '130%';
    els.forEach((e, i) => {
      const b = parseFloat(getComputedStyle(e).fontSize);
      if (Math.abs(b - a[i]!) < 0.01) e.style.fontSize = `${b * 1.3}px`;
      e.dataset.t130 = '1';
    });
  });
  await page.waitForTimeout(150);
}

type Walk = { layout?: boolean; text?: boolean; shots?: boolean; skipRest?: boolean };

/**
 * The fastest honest path: one answer where one is needed, Skip on every personal screen,
 * Continue on the preselected screens. Returns the taps it took.
 */
async function fastPath(page: Page, opts: Walk = {}): Promise<number> {
  const t = new Taps(page);
  const screen = async (step: string, primary?: Locator) => {
    await atStep(page, step);
    if (opts.text) await text130(page);
    if (opts.layout) await checkLayout(page, primary ? { primary } : {});
    if (opts.shots) await shot(page, step);
  };
  await screen('goal');
  await t.pick('goal', 'muscle');
  // PLAN 3.3a: up to 2 goals, so Continue (one tap more than 3.3's auto advance).
  await t.next();
  await screen('units', cta(page));
  await t.next();
  await screen('focus', cta(page));
  // PLAN 3.3a round 2 (B6): focus is not used yet, so it is optional (was grey until a pick).
  await expect(cta(page)).toBeEnabled();
  await t.pick('focus', 'arms');
  await t.next();
  await screen('win');
  await t.pick('win', 'energy');
  await t.next();
  await screen('experience');
  await t.pick('experience', '3y');
  await screen('days');
  await t.pick('days', '5');
  await screen('weekdays');
  await t.skip();
  await screen('minutes');
  await t.pick('minutes', '60');
  await screen('place');
  await t.pick('place', 'full');
  await screen('equipment', cta(page));
  await t.next();
  await screen('style');
  await t.pick('style', 'mix');
  await screen('cardio');
  await t.pick('cardio', 'little');
  await t.next();
  await screen('easyOn');
  if (!opts.skipRest) await t.skip();
  if (opts.skipRest) {
    await t.tap(page.getByTestId('skip-rest'));
  } else {
    await screen('exercises');
    await t.skip();
    await screen('when');
    await t.pick('when', 'after_work');
    await screen('bodyweight');
    await t.skip();
    await screen('about');
    await t.skip();
  }
  await screen('reveal', revealPrimary(page));
  return t.n;
}

/** SPEC 14 "finish in under 60 seconds", as taps: about 2 s a tap is 44 s. */
const TAP_BUDGET = 22;

test('a new user goes through the funnel in 22 taps (PLAN 3.3a: +1 for the two pick goal), every screen fits, Start Day 1 lands in the workout @matrix', async ({ page }) => {
  const started = Date.now();
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welcome$/);
  // The first screen: no back (nothing before it), Continue since PLAN 3.3a (up to 2 goals), the quiet line.
  await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();
  await expect(backButton(page)).toHaveCount(0);
  await expect(page.getByText('Your answers stay on this phone.')).toBeVisible();
  await expect(page.getByTestId('intake-intro')).toContainText('Train in any gym. About 2 minutes.');
  await expect(page.getByText(/Apple Health/)).toHaveCount(0);
  const taps = await fastPath(page, { layout: true, shots: true });
  await expect(page.getByTestId('reveal-card')).toContainText('Classic 5 Day Split');
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toHaveText('Picked for your full gym, your muscle goal and your 5 days.');
  await expect(page.getByTestId('reveal-week').getByRole('listitem')).toHaveCount(5);
  // Both curated plans fit a full gym: "Or pick a curated plan" lists them.
  await expect(page.getByTestId('reveal-plan-six-week-volume')).toBeVisible();
  const start = page.getByTestId('reveal-cta').getByRole('button', { name: 'Start Day 1' });
  await start.tap();
  const total = taps + 1;
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect(page.getByText('Legs (hamstring focus)').first()).toBeVisible();
  expect(total).toBe(22);
  expect(total).toBeLessThanOrEqual(TAP_BUDGET);
  test.info().annotations.push({ type: 'taps', description: `${total} taps, ${Math.round((Date.now() - started) / 1000)} s automated` });
  const sessions = await dbAll(page, 'sessions');
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ planId: 'five-day-split' });
  expect(await dbAll(page, 'planState')).toMatchObject([{ planId: 'five-day-split', nextDayIndex: 0 }]);
  // Done for good: Today never opens the funnel again, also after a reload.
  await page.goto('./#/');
  await page.reload();
  await expect(page).not.toHaveURL(/welcome/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('every answer is saved; Back keeps them, Skip clears one, a reload resumes where it was', async ({ page }) => {
  await page.goto('./');
  const t = new Taps(page);
  await t.pick('goal', 'tone');
  await t.next();
  await atStep(page, 'units');
  // Units: change all four from the region default (Playwright's WebKit is en-US: lb, miles, inches).
  await expect(page.getByTestId('units-weight').getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true');
  await t.tap(page.getByTestId('units-weight').getByRole('radio', { name: 'kg' }));
  await t.tap(page.getByTestId('units-distance').getByRole('radio', { name: 'km' }));
  await t.tap(page.getByTestId('units-measure').getByRole('radio', { name: 'cm' }));
  await t.tap(page.getByTestId('units-body').getByRole('radio', { name: 'Female' }));
  await t.next();
  await atStep(page, 'focus');
  await t.pick('focus', 'glutes');
  await t.pick('focus', 'legs');
  // Back keeps the units; forward again keeps the focus.
  await t.tap(backButton(page));
  await atStep(page, 'units');
  await expect(page.getByTestId('units-body').getByRole('radio', { name: 'Female' })).toHaveAttribute('aria-checked', 'true');
  await t.next();
  await expect(page.getByTestId('q-focus-glutes')).toHaveAttribute('aria-pressed', 'true');
  await t.next();
  await t.pick('win', 'clothes');
  await t.next();
  await t.pick('experience', 'months');
  await t.pick('days', '3');
  await atStep(page, 'weekdays');
  await t.pick('weekdays', 'mon');
  await t.pick('weekdays', 'wed');
  await t.pick('weekdays', 'fri');
  await t.next();
  await t.pick('minutes', '45');
  // A reload mid funnel resumes on the same screen with every answer.
  await atStep(page, 'place');
  await page.reload();
  await atStep(page, 'place');
  await t.tap(backButton(page));
  await atStep(page, 'minutes');
  await expect(page.getByTestId('q-minutes-45')).toHaveAttribute('aria-pressed', 'true');
  // Tapping the picked card again moves on.
  await t.pick('minutes', '45');
  await t.pick('place', 'hotel');
  await atStep(page, 'equipment');
  // The hotel preset (SPEC 3), and the ⓘ glossary sheet.
  await expect(page.getByTestId('equip-dumbbells')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('equip-barbell_rack')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'What is Cable station?' }).tap();
  await expect(page.getByRole('dialog', { name: 'Cable station' })).toBeVisible();
  await shot(page, 'equipment-info');
  await page.getByRole('dialog', { name: 'Cable station' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Cable station' })).toHaveCount(0);
  await t.tap(page.getByTestId('equip-kettlebells'));
  await t.next();
  // No plan can fit a hotel gym today: said right here; Keep going goes on.
  await atStep(page, 'noPlan');
  await expect(page.getByRole('heading', { name: 'No hotel plan yet' })).toBeVisible();
  await t.tap(page.getByTestId('noplan-continue'));
  await t.pick('style', 'free');
  await t.pick('cardio', 'none');
  // Cardio None: nothing more to ask here.
  await expect(page.getByTestId('q-cardioFavorites')).toHaveCount(0);
  await t.next();
  await atStep(page, 'easyOn');
  await t.pick('easyOn', 'knees');
  await t.pick('easyOn', 'none');
  await expect(page.getByTestId('q-easyOn-knees')).toHaveAttribute('aria-pressed', 'false');
  await t.pick('easyOn', 'wrists');
  await expect(page.getByTestId('q-easyOn-none')).toHaveAttribute('aria-pressed', 'false');
  await t.next();
  await atStep(page, 'exercises');
  await page.getByTestId('q-love-search').fill('squat');
  await page.getByTestId('q-love').getByRole('button', { name: /squat/i }).first().tap();
  await t.next();
  await t.pick('when', 'early');
  await atStep(page, 'bodyweight');
  // Kilograms from the units screen; nothing saved until the ruler moves or is tapped (optional since 3.3a round 2).
  await expect(cta(page)).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.bodyweight ?? null)).toBeNull();
  await expect(page.getByTestId('bw-unit').getByRole('radio', { name: 'Kilograms' })).toHaveAttribute('aria-checked', 'true');
  const ruler = page.getByTestId('bodyweight-ruler');
  await ruler.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bw-value')).toHaveText(/^72\.5\s*kg$/);
  await t.next();
  await atStep(page, 'about');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('name-input').fill('Sam');
  await expect(cta(page)).toBeEnabled();
  await page.getByTestId('wheel-cm').focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('wheel-cm')).toHaveAttribute('aria-valuetext', '178 cm');
  await t.next();
  await atStep(page, 'reveal');
  // No plan for hotel gyms exists yet: honest, no check, and the gym is said to be saved.
  await expect(page.getByRole('heading', { name: 'No hotel plan yet' })).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toHaveText('Your gym and equipment are saved.');
  await expect(page.getByTestId('reveal-check')).toHaveCount(0);
  await expect(page.getByTestId('reveal-week')).toHaveCount(0);
  await shot(page, 'reveal-none');

  const [profile] = await dbAll(page, 'profile');
  expect(profile).toMatchObject({
    name: 'Sam',
    goal: 'tone',
    level: 'months',
    daysPerWeek: 3,
    defaultUnit: 'kg',
    distanceUnit: 'km',
    measureUnit: 'cm',
    intake: {
      goal: 'tone',
      units: { weight: 'kg', distance: 'km', measure: 'cm', body: 'female' },
      focus: ['glutes', 'legs'],
      win: ['clothes'],
      experience: 'months',
      days: 3,
      weekdays: ['mon', 'wed', 'fri'],
      minutes: 45,
      place: 'hotel',
      style: 'free',
      cardio: 'none',
      easyOn: ['wrists'],
      when: 'early',
      name: 'Sam',
      bodyweight: { value: 72.5, unit: 'kg' },
      height: { unit: 'cm', cm: 178 },
      skipped: ['never', 'age'],
    },
  });
  expect((profile!.intake as { love: string[] }).love).toHaveLength(1);
  expect((profile!.intake as { equipment: string[] }).equipment).toContain('kettlebells');
  expect(typeof profile!.intakeDoneAt).toBe('number');
  // The same muscle map preference Settings uses (PLAN 2.2a).
  expect(await page.evaluate(() => localStorage.getItem('anygym.muscleBody'))).toBe('female');
  const [gym] = await dbAll(page, 'gyms');
  expect(gym).toMatchObject({ unit: 'kg', type: 'hotel', name: 'Hotel gym', dumbbellRange: { min: 2, max: 24, step: 2 } });

  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Start a quick workout' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  // Settings shows the female body and the units.
  await page.goto('./#/settings');
  await expect(page.getByTestId('settings-body').getByRole('radio', { name: 'Female' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('settings-distance').getByRole('radio', { name: 'km' })).toHaveAttribute('aria-checked', 'true');
});

test('the ruler snaps every 0.5 and the unit flip equals the load.ts conversion @matrix', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  // Straight to the bodyweight screen through the draft (the funnel resumes it).
  await page.evaluate(() => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'bodyweight', answers: { goal: 'muscle', units: { weight: 'kg', distance: 'km', measure: 'cm', body: 'male' } } })));
  await page.reload();
  await atStep(page, 'bodyweight');
  await shot(page, 'bodyweight-untouched');
  const ruler = page.getByTestId('bodyweight-ruler');
  // A thumb drag of 7.4 ticks lands on a tick: 70 + 3.5 = 73.5 or the neighbour, always x.0 or x.5.
  const box = (await ruler.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40, y, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 - 89, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const text = (await page.getByTestId('bw-value').textContent())!;
  const kg = Number(/^[\d.]+/.exec(text)![0]);
  expect(kg * 2).toBe(Math.round(kg * 2));
  expect(kg).toBeGreaterThan(70);
  expect(kg).toBeLessThan(76);
  // Settled exactly on the tick under the needle.
  const off = await ruler.evaluate((el) => el.scrollLeft);
  expect(off).toBe(((kg - 30) / 0.5) * 12);
  await shot(page, 'bodyweight');
  // Flip to pounds and back: load.ts convertBodyweight (snapped to 0.5).
  await page.getByTestId('bw-unit').getByRole('radio', { name: 'Pounds' }).tap();
  const lb = Math.round((kg / 0.45359237) * 2) / 2;
  await expect(page.getByTestId('bw-value')).toHaveText(new RegExp(`^${lb.toFixed(1).replace('.', '\\.')}\\s*lb$`));
  await page.getByTestId('bw-unit').getByRole('radio', { name: 'Kilograms' }).tap();
  const back = Math.round(lb * 0.45359237 * 2) / 2;
  await expect(page.getByTestId('bw-value')).toHaveText(new RegExp(`^${back.toFixed(1).replace('.', '\\.')}\\s*kg$`));
  await cta(page).tap();
  await atStep(page, 'about');
  // Height: two wheels in feet and inches, the toggle converts through load.ts.
  await page.getByTestId('height-unit').getByRole('radio', { name: 'Feet and inches' }).tap();
  await expect(page.getByTestId('wheel-ft')).toBeVisible();
  await expect(page.getByTestId('wheel-in')).toBeVisible();
  await page.getByTestId('wheel-in').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('wheel-in')).toHaveAttribute('aria-valuetext', '10 in');
  await shot(page, 'about');
  await page.getByTestId('height-unit').getByRole('radio', { name: 'Centimeters' }).tap();
  await expect(page.getByTestId('wheel-cm')).toHaveAttribute('aria-valuetext', '178 cm');
});

for (const [locale, weight, distance, measure] of [
  ['en-US', 'lb', 'miles', 'inches'],
  ['fr-FR', 'kg', 'km', 'cm'],
] as const) {
  test.describe(`phone region ${locale}`, () => {
    test.use({ locale });
    test(`units are preselected from the region: ${weight}, ${distance}, ${measure} @matrix`, async ({ page }) => {
      await page.goto('./');
      await page.getByTestId('q-goal-strength').tap();
      // PLAN 3.3a: the goal takes up to 2, so it has Continue (was auto advance).
      await cta(page).tap();
      await atStep(page, 'units');
      for (const [id, name] of [
        ['units-weight', weight],
        ['units-distance', distance],
        ['units-measure', measure],
      ] as const)
        await expect(page.getByTestId(id).getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
      // No body is implied from the region: unpicked, and Continue still works.
      await expect(page.getByTestId('units-body').getByRole('radio', { checked: true })).toHaveCount(0);
      await expect(cta(page)).toBeEnabled();
      await shot(page, `units-${locale}`);
      await cta(page).tap();
      await atStep(page, 'focus');
    });
  });
}

test('existing users never see the funnel: a profile, or a workout logged before it existed @matrix', async ({ page }) => {
  // Open a screen the gate does not touch, write an existing user's data, then open Today.
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await dbPut(page, 'profile', { id: 'me', defaultUnit: 'lb', createdAt: 1 });
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page).not.toHaveURL(/welcome/);
  expect(await page.evaluate(() => localStorage.getItem('anygym.intakeDone'))).toBe('1');
});

test('a user with only a workout (no profile) is an existing user too', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const [gym] = await dbAll(page, 'gyms');
  await dbPut(page, 'sessions', { id: 'old-1', gymId: gym!.id as string, startedAt: 1000, endedAt: 2000, imported: false, exerciseIds: [] });
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page).not.toHaveURL(/welcome/);
});

test('Settings → Answer the questions again: answers come back, Back leaves, the plan is chosen with Undo', async ({ page }) => {
  await page.goto('./');
  await fastPath(page);
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Start Day 1' }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.goto('./#/settings');
  await page.getByTestId('redo-intake').tap();
  await expect(page).toHaveURL(/#\/welcome\?redo=1$/);
  await atStep(page, 'goal');
  // The saved answer shows; a visible Back on the first screen returns to Settings, nothing saved.
  await expect(page.getByTestId('q-goal-muscle')).toHaveAttribute('aria-pressed', 'true');
  const before = await dbAll(page, 'profile');
  await page.getByTestId('q-goal-race').tap();
  // PLAN 3.3a: the goal takes up to 2, so it has Continue (was auto advance).
  await cta(page).tap();
  await atStep(page, 'units');
  await backButton(page).tap();
  await atStep(page, 'goal');
  await page.locator('header').getByRole('button', { name: 'Back to Settings' }).tap();
  await expect(page).toHaveURL(/#\/settings$/);
  expect(await dbAll(page, 'profile')).toEqual(before);
  await page.getByTestId('redo-intake').tap();
  await atStep(page, 'goal');
  // PLAN 3.3a: the saved goal is already Main (a tap would turn it off); Continue goes on.
  await expect(page.getByTestId('q-goal-muscle-tag')).toHaveText('Main');
  await cta(page).tap();
  await atStep(page, 'units');
  // Straight to the reveal: every later screen keeps its saved answer.
  for (const step of ['units', 'focus', 'win']) {
    await atStep(page, step);
    await cta(page).tap();
  }
  for (const [step, id] of [
    ['experience', '3y'],
    ['days', '5'],
  ] as const) {
    await atStep(page, step);
    await page.getByTestId(`q-${step}-${id}`).tap();
  }
  await atStep(page, 'weekdays');
  await page.getByTestId('skip').tap();
  await page.getByTestId('q-minutes-60').tap();
  await page.getByTestId('q-place-full').tap();
  await cta(page).tap();
  await page.getByTestId('q-style-mix').tap();
  await page.getByTestId('q-cardio-little').tap();
  await cta(page).tap();
  await atStep(page, 'easyOn');
  await page.getByTestId('skip-rest').tap();
  await atStep(page, 'reveal');
  // Pick the other plan: the reveal changes, and Use this plan keeps the old one an Undo away.
  await page.getByTestId('reveal-plan-six-week-volume').tap();
  await expect(page.getByTestId('reveal-card')).toContainText('Six Week Volume Builder');
  // A workout is still open: the plan is chosen, never started over it.
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Plan saved' })).toBeVisible();
  expect(await dbAll(page, 'planState')).toMatchObject([{ planId: 'six-week-volume' }]);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(async () => (await dbAll(page, 'planState'))[0]?.planId).toBe('five-day-split');
});

test('reduced motion: screens and the reveal crossfade, nothing moves', async ({ browser }) => {
  const context = await guardContext(await browser.newContext({ ...test.info().project.use, reducedMotion: 'reduce' }));
  const page = await context.newPage();
  await simulateSafeAreas(page);
  await page.goto('./');
  await page.getByTestId('q-goal-muscle').tap();
  // PLAN 3.3a: the goal takes up to 2, so it has Continue (was auto advance).
  await cta(page).tap();
  await atStep(page, 'units');
  // The pulse and the week rows: no movement, only opacity.
  const pulse = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  expect(pulse).toBe(true);
  await page.evaluate(() => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'reveal', answers: { goal: 'muscle', place: 'full', equipment: [], days: 5 } })));
  // Equipment [] covers no plan: use the full preset instead.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!);
    delete d.answers.equipment;
    localStorage.setItem('anygym.intakeDraft', JSON.stringify(d));
  });
  await page.reload();
  await atStep(page, 'reveal');
  const row = page.getByTestId('reveal-week').getByRole('listitem').first();
  await expect(row).toBeVisible();
  const anim = await row.evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, transform: s.transform };
  });
  expect(anim.name).toMatch(/fade-in/);
  expect(anim.transform).toBe('none');
  await shot(page, 'reveal-reduced');
  await context.close();
});

test('130% text on the SE: every screen fits, nothing cut off, the button stays reachable', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone SE', 'SE only (the smallest iPhone)');
  await page.goto('./');
  await fastPath(page, { layout: true, text: true });
  await text130(page);
  await checkLayout(page, { primary: revealPrimary(page) });
  await shot(page, 'reveal-130');
});

// ---------------------------------------------------------------- round 2 (Codex review)

const drafted = async (page: Page, step: string, answers: Record<string, unknown>) => {
  await page.goto('./');
  await atStep(page, 'goal');
  await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, answers] as const);
  await page.reload();
  await atStep(page, step);
};
const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };

const toEquipment = async (page: Page, answers: Record<string, unknown>) => {
  await page.goto('./#/settings');
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'equipment', answers: a })), answers);
  await page.goto('./#/welcome');
  await page.reload();
  await atStep(page, 'equipment');
};

test('home with Dumbbells asks for the range: Continue waits, only what was typed is stored @matrix', async ({ page }) => {
  await toEquipment(page, { units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'home', equipmentFor: 'home', equipment: [] });
  await expect(page.getByTestId('dumbbell-range')).toHaveCount(0);
  await expect(cta(page)).toBeEnabled();
  await page.getByTestId('equip-dumbbells').tap();
  await expect(page.getByTestId('dumbbell-range')).toContainText('in lb');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('range-min').fill('40');
  await page.getByTestId('range-max').fill('10');
  await page.getByTestId('range-step').fill('5');
  await expect(page.getByTestId('range-note')).toHaveText('Heaviest: must not be under the lightest.');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('range-min').fill('10');
  await page.getByTestId('range-max').fill('40');
  await expect(cta(page)).toBeEnabled();
  await checkLayout(page, { primary: cta(page) });
  await shot(page, 'equipment-range');
  // Turned off: no question, nothing stored.
  await page.getByTestId('equip-dumbbells').tap();
  await expect(page.getByTestId('dumbbell-range')).toHaveCount(0);
  await page.getByTestId('equip-dumbbells').tap();
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('range-min').fill('10');
  await page.getByTestId('range-max').fill('40');
  await page.getByTestId('range-step').fill('10');
  await cta(page).tap();
  await atStep(page, 'noPlan');
  await page.getByTestId('noplan-continue').tap();
  await atStep(page, 'style');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!);
    d.step = 'reveal';
    localStorage.setItem('anygym.intakeDraft', JSON.stringify(d));
  });
  await page.reload();
  await atStep(page, 'reveal');
  await expect.poll(async () => (await dbAll(page, 'gyms'))[0]?.dumbbellRange).toEqual({ min: 10, max: 40, step: 10 });
});

test('B3: 4 days then 3 weekdays: the weekdays screen says so, the reveal repeats the 4, every workout shows @matrix', async ({ page }) => {
  await drafted(page, 'weekdays', { goal: 'muscle', days: 4, place: 'full', experience: '3y', units: US });
  await expect(page.getByText('Pick 4. Used to lay out your week.')).toBeVisible();
  await expect(page.getByTestId('weekday-count')).toHaveText('');
  const before = await cta(page).boundingBox();
  for (const d of ['mon', 'wed', 'fri']) await page.getByTestId(`q-weekdays-${d}`).tap();
  await expect(page.getByTestId('weekday-count')).toHaveText('That is 3 days. You said 4.');
  await expect(cta(page)).toBeEnabled();
  expect(await cta(page).boundingBox()).toEqual(before);
  await shot(page, 'weekdays-count');
  await page.goto('./#/settings');
  await page.goto('./#/welcome');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!);
    d.step = 'reveal';
    localStorage.setItem('anygym.intakeDraft', JSON.stringify(d));
  });
  await page.reload();
  await atStep(page, 'reveal');
  const rows = page.getByTestId('reveal-week').getByRole('listitem');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(4)).toContainText('Day 5');
  await expect(rows.nth(4)).toContainText('Shoulders and calves');
  await expect(page.getByTestId('reveal-warning')).toHaveText('5 days a week. You asked for 4 days.');
});

test('a redo left alone never touches the gym Settings changed; skipping Name deletes it', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  // First intake, with a name.
  await page.evaluate(() =>
    localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'name', answers: { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'full', equipmentFor: 'full', days: 5 } })),
  );
  await page.reload();
  await atStep(page, 'about');
  await page.getByTestId('name-input').fill('Sam');
  await cta(page).tap();
  await atStep(page, 'reveal');
  await expect.poll(async () => (await dbAll(page, 'profile'))[0]?.name).toBe('Sam');

  // Settings moves the gym to kg and the user customises it.
  await page.goto('./#/settings');
  await page.getByTestId('settings-units').getByRole('radio', { name: 'kg' }).tap();
  await expect.poll(async () => (await dbAll(page, 'gyms'))[0]?.unit).toBe('kg');
  const [before] = await dbAll(page, 'gyms');
  await dbPut(page, 'gyms', { ...before!, equipmentWeights: { leg_press: { kind: 'starting_resistance', value: 50 } } });
  const [kept] = await dbAll(page, 'gyms');

  // Redo: the toggle shows the gym's kg, never the old lb.
  await page.getByTestId('redo-intake').tap();
  await atStep(page, 'goal');
  // PLAN 3.3a: the saved goal is already Main (a tap would turn it off); Continue goes on.
  await expect(page.getByTestId('q-goal-muscle-tag')).toHaveText('Main');
  await cta(page).tap();
  await atStep(page, 'units');
  await expect(page.getByTestId('units-weight').getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
  await cta(page).tap();
  await atStep(page, 'focus');
  await page.getByTestId('q-focus-arms').tap();
  await cta(page).tap();
  await page.getByTestId('q-win-energy').tap();
  await cta(page).tap();
  await page.getByTestId('q-experience-3y').tap();
  await atStep(page, 'days');
  await page.getByTestId('q-days-5').tap();
  await page.getByTestId('skip').tap();
  await page.getByTestId('q-minutes-60').tap();
  await page.getByTestId('q-place-full').tap();
  await atStep(page, 'equipment');
  await cta(page).tap();
  await page.getByTestId('q-style-mix').tap();
  await page.getByTestId('q-cardio-little').tap();
  await cta(page).tap();
  for (const step of ['easyOn', 'exercises']) {
    await atStep(page, step);
    await page.getByTestId('skip').tap();
  }
  await page.getByTestId('q-when-early').tap();
  await atStep(page, 'bodyweight');
  await page.getByTestId('skip').tap();
  // Name shows the saved one; Skip discards it.
  await atStep(page, 'about');
  await expect(page.getByTestId('name-input')).toHaveValue('Sam');
  await page.getByTestId('skip').tap();
  await atStep(page, 'reveal');
  await expect.poll(async () => (await dbAll(page, 'profile'))[0]?.intake && ((await dbAll(page, 'profile'))[0]!.intake as { skipped?: string[] }).skipped).toContain('name');
  const [profile] = await dbAll(page, 'profile');
  expect('name' in profile!).toBe(false);
  expect(await dbAll(page, 'gyms')).toEqual([kept]);
});

// ---------------------------------------------------------------- round 3

test('reloading or reopening on the reveal brings a fresh user back to it, until Start Day 1 @matrix', async ({ page }) => {
  await page.goto('./');
  await fastPath(page);
  await expect.poll(async () => (await dbAll(page, 'profile'))[0]?.intakeDoneAt).toBeTruthy();
  await page.reload();
  await atStep(page, 'reveal');
  await expect(page.getByTestId('reveal-card')).toContainText('Classic 5 Day Split');
  // The app reopened at its start page: back to the reveal too, never Pick a plan.
  await page.goto('./#/');
  await page.reload();
  await atStep(page, 'reveal');
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Start Day 1' }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await page.evaluate(() => localStorage.getItem('anygym.intakeDraft'))).toBeNull();
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page).not.toHaveURL(/welcome/);
});

test('rule (f): under a grey Continue the reason and the note both show; nothing moves when it turns valid @matrix', async ({ page }) => {
  // PLAN 3.3a round 2: focus is optional now; About still waits for one answer.
  await drafted(page, 'about', { goal: 'muscle', units: US });
  const bar = page.getByTestId('intake-cta');
  await expect(cta(page)).toBeDisabled();
  await expect(cta(page)).toHaveText('Continue');
  await expect(page.getByTestId('cta-reason')).toHaveText('Add one, or skip');
  await expect(bar.getByText('Stays on this phone.')).toBeVisible();
  const before = await cta(page).boundingBox();
  await page.getByTestId('name-input').fill('Sam');
  await expect(cta(page)).toBeEnabled();
  await expect(cta(page)).toHaveText('Continue');
  await expect(page.getByTestId('cta-reason')).toHaveText('');
  await expect(bar.getByText('Stays on this phone.')).toBeVisible();
  expect(await cta(page).boundingBox()).toEqual(before);
});

test('130% text on the SE: the button keeps its size and place when the reason goes', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone SE', 'SE only');
  await page.goto('./');
  await atStep(page, 'goal');
  await page.evaluate(() => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'equipment', answers: { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'home', equipmentFor: 'home', equipment: ['dumbbells'] } })));
  await page.reload();
  await atStep(page, 'equipment');
  await text130(page);
  await expect(cta(page)).toBeDisabled();
  const grey = (await cta(page).boundingBox())!;
  for (const [k, v] of [['min', '10'], ['max', '40'], ['step', '10']] as const) await page.getByTestId(`range-${k}`).fill(v);
  await expect(cta(page)).toBeEnabled();
  await text130(page);
  const valid = (await cta(page).boundingBox())!;
  expect(valid.height).toBe(grey.height);
  expect(valid.y).toBe(grey.y);
});

// ---------------------------------------------------------------- round 3 (ux-critic)

test('B1 B2: a race goal is the closest plan: no check, at most two lines of warning, length matches the workout @matrix', async ({ page }) => {
  await drafted(page, 'reveal', { goal: 'race', days: 3, minutes: 45, place: 'full', easyOn: ['knees'], experience: '3y', units: US });
  // PLAN 3.3a round 2 (B2): 3 days and 45 min are both far off a 5 day ~81 min plan: said plainly.
  await expect(page.getByRole('heading', { name: "We don't have a 3 day, 45 minute plan yet" })).toBeVisible();
  await expect(page.getByTestId('reveal-check')).toHaveCount(0);
  await expect(page.getByTestId('reveal-cta').locator('button[data-variant="primary"]')).toHaveText('Start a quick workout');
  await expect(page.getByTestId('reveal-reason')).toHaveText('Picked for your full gym. It builds muscle, 5 days a week.');
  const warning = page.getByTestId('reveal-warning');
  await expect(warning).toHaveText(/^About \d+ min, 5 days\. You asked for 45 min, 3 days\. Race goal and knees aren't built in yet\.$/);
  await expect(page.getByTestId('reveal-card')).not.toContainText('built to add muscle');
  // Two lines from 375 wide up; narrower phones have the same words on three (never cut, never more).
  const lines = await warning.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBeLessThanOrEqual(page.viewportSize()!.width < 375 ? 3 : 2);
  await shot(page, 'reveal-closest');
  // Every day row can be reached, on one line each where it fits, and the alternatives too.
  const rows = page.getByTestId('reveal-week').getByRole('listitem');
  await rows.nth(4).scrollIntoViewIfNeeded();
  await expect(rows.nth(4)).toBeInViewport({ ratio: 1 });
  if (page.viewportSize()!.width >= 375) {
    const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
  }
  await page.getByTestId('reveal-plan-six-week-volume').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('reveal-plan-six-week-volume')).toBeInViewport({ ratio: 1 });
  const minutes = /~(\d+) min/.exec((await rows.first().textContent())!)![1]!;
  // Round 2 (B2): the quick workout leads; the plan stays one tap away as the option.
  await expect(page.getByTestId('reveal-secondary')).toHaveText('Start Day 1');
  await page.getByTestId('reveal-secondary').tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await expect(page.getByText(new RegExp(`~${minutes} min`)).first()).toBeVisible();
});

test('B2: a 30 minute pick makes the quick workout the main action; Start Day 1 stays one tap away; a true match has only the check and Start Day 1 @matrix', async ({ page }) => {
  await drafted(page, 'reveal', { goal: 'muscle', days: 5, minutes: 30, place: 'full', units: US });
  await expect(revealPrimary(page)).toHaveText('Start a quick workout');
  await expect(page.getByTestId('reveal-secondary')).toHaveText('Start Day 1');
  await checkLayout(page, { primary: revealPrimary(page) });
  await shot(page, 'reveal-30');
  await revealPrimary(page).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await dbAll(page, 'planState')).toEqual([]);
  expect((await dbAll(page, 'sessions'))[0]!.planId).toBeUndefined();
});

test('B2: brand new is offered a quick workout too; Start Day 1 from the secondary spot starts the plan', async ({ page }) => {
  await drafted(page, 'reveal', { goal: 'muscle', days: 5, place: 'full', experience: 'new', units: US });
  await expect(revealPrimary(page)).toHaveText('Start Day 1');
  await expect(page.getByTestId('reveal-secondary')).toHaveText('Start a quick workout');
  await expect(page.getByTestId('reveal-reason')).toContainText('It expects some experience, so start light.');
  await page.getByTestId('reveal-secondary').tap();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await dbAll(page, 'planState')).toEqual([]);
});

test('P4: favorites sit on the cardio screen, shown once a feeling is picked; None hides them @matrix', async ({ page }) => {
  await drafted(page, 'cardio', { goal: 'muscle', units: US });
  // PLAN 3.3a round 2 (B6): optional now.
  await expect(cta(page)).toBeEnabled();
  await expect(page.getByTestId('q-cardioFavorites')).toHaveCount(0);
  await page.getByTestId('q-cardio-love').tap();
  // No auto advance here: there is more to pick.
  await page.waitForTimeout(400);
  await atStep(page, 'cardio');
  await page.getByTestId('q-cardioFavorites-bike').tap();
  await shot(page, 'cardio-favorites');
  await checkLayout(page, { primary: cta(page) });
  await cta(page).tap();
  await atStep(page, 'easyOn');
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers);
  expect(d).toMatchObject({ cardio: 'love', cardioFavorites: ['bike'] });
  await backButton(page).tap();
  await page.getByTestId('q-cardio-none').tap();
  await expect(page.getByTestId('q-cardioFavorites')).toHaveCount(0);
});

test('P8: Back after Skip the rest returns to the screen where it was tapped', async ({ page }) => {
  await drafted(page, 'bodyweight', { goal: 'muscle', units: US, place: 'full', days: 5 });
  await page.getByTestId('skip-rest').tap();
  await atStep(page, 'reveal');
  await backButton(page).tap();
  await atStep(page, 'bodyweight');
});

test('P2: equipment that is on shows a small check; turning it on moves nothing', async ({ page }) => {
  // PLAN 3.3a supersedes the chip: a picture tile whose check badge sits on the drawing's corner.
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'hotel', equipmentFor: 'hotel', equipment: ['treadmill'] });
  const chip = page.getByTestId('equip-flat_bench');
  const label = chip.getByText('Flat bench', { exact: true });
  const check = chip.locator('svg[data-check]');
  await chip.scrollIntoViewIfNeeded();
  await expect(check).toHaveCSS('opacity', '0');
  const before = await label.boundingBox();
  await chip.tap();
  await expect(check).toHaveCSS('opacity', '1');
  // Polled: the press scale (0.96) eases back after the tap.
  await expect.poll(() => label.boundingBox()).toEqual(before);
});

test('P7: the notice says finishing the profile changes nothing today', async ({ page }) => {
  await drafted(page, 'noPlan', { goal: 'muscle', units: US, place: 'home', equipmentFor: 'home', equipment: [] });
  await expect(page.getByTestId('noplan-continue')).toHaveText('Finish my profile');
  await expect(page.getByText("It won't change what you can do today.")).toBeVisible();
});

test('B3: no plan is said right after the equipment; Start a quick workout from there saves the gym @matrix', async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'hotel', equipmentFor: 'hotel', equipment: ['dumbbells', 'treadmill'] });
  await cta(page).tap();
  await atStep(page, 'noPlan');
  await expect(page.getByRole('heading', { name: 'No hotel plan yet' })).toBeVisible();
  await checkLayout(page, { primary: page.getByTestId('noplan-cta').getByRole('button', { name: 'Start a quick workout' }) });
  await shot(page, 'noplan');
  // Back returns to the equipment; forward says it again.
  await backButton(page).tap();
  await atStep(page, 'equipment');
  await cta(page).tap();
  await atStep(page, 'noPlan');
  await page.getByTestId('noplan-cta').getByRole('button', { name: 'Start a quick workout' }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await dbAll(page, 'gyms')).toMatchObject([{ type: 'hotel', equipment: ['dumbbells', 'treadmill'] }]);
  expect(await page.evaluate(() => localStorage.getItem('anygym.intakeDraft'))).toBeNull();
});

test('B4: brand new skips the exercise lists; Skip the rest shows only from the personal group, and goes to the reveal @matrix', async ({ page }) => {
  await drafted(page, 'experience', { goal: 'muscle', units: US, cardio: 'little' });
  await expect(page.getByTestId('skip-rest')).toHaveCount(0);
  await page.getByTestId('q-experience-new').tap();
  await atStep(page, 'days');
  await page.goto('./#/settings');
  await page.goto('./#/welcome');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!);
    d.step = 'easyOn';
    d.answers.place = 'full';
    localStorage.setItem('anygym.intakeDraft', JSON.stringify(d));
  });
  await page.reload();
  await atStep(page, 'easyOn');
  await page.getByTestId('skip').tap();
  await atStep(page, 'when');
  await page.getByTestId('skip-rest').tap();
  await atStep(page, 'reveal');
  const [p] = await dbAll(page, 'profile');
  expect((p!.intake as { skipped: string[] }).skipped).toEqual(expect.arrayContaining(['easyOn', 'when', 'bodyweight', 'name', 'height', 'age', 'love', 'never']));
});

test('B4: love and never share one optional screen and stay separate answers', async ({ page }) => {
  await drafted(page, 'exercises', { goal: 'muscle', units: US, experience: '3y' });
  await expect(cta(page)).toBeEnabled();
  const love = page.getByTestId('q-love').getByRole('button').first();
  const name = (await love.textContent())!;
  await love.tap();
  await page.getByTestId('ex-mode').getByRole('radio', { name: /Never/ }).tap();
  // What is loved is not offered as never.
  await expect(page.getByTestId('q-never').getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.getByTestId('q-never').getByRole('button').first().tap();
  await expect(page.getByTestId('ex-mode')).toContainText('Love (1)');
  await expect(page.getByTestId('ex-mode')).toContainText('Never (1)');
  await shot(page, 'exercises');
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers);
  expect(d.love).toHaveLength(1);
  expect(d.never).toHaveLength(1);
  expect(d.love[0]).not.toBe(d.never[0]);
});

test('B5: a tap confirms the shown value on the ruler and on the wheels; nothing unconfirmed is saved @matrix', async ({ page }) => {
  await drafted(page, 'bodyweight', { goal: 'muscle', units: US });
  await expect(page.getByText('Slide or tap to confirm')).toBeVisible();
  // PLAN 3.3a round 2 (B6): optional, so Continue is on; nothing unconfirmed is saved still.
  await expect(cta(page)).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.bodyweight ?? null)).toBeNull();
  await page.getByTestId('bodyweight-ruler').tap();
  await expect(page.getByTestId('bw-value')).toHaveText(/^155\.0\s*lb$/);
  await expect(cta(page)).toBeEnabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.bodyweight)).toEqual({ value: 155, unit: 'lb' });
  await cta(page).tap();
  await atStep(page, 'about');
  await expect(page.getByText('Spin or tap to confirm')).toBeVisible();
  const wheel = page.getByTestId('wheel-in');
  // A raw tap at a point: wait out the page transition first (its snapshot takes the hit).
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await wheel.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await wheel.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(cta(page)).toBeEnabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.height)).toEqual({ unit: 'in', ft: 5, in: 7 });
  await checkLayout(page, { primary: cta(page) });
  await shot(page, 'about-picked');
});

test('B7: About says what the name is for and shows when the limit is reached', async ({ page }) => {
  await drafted(page, 'about', { goal: 'muscle', units: US });
  await expect(page.getByTestId('name-hint')).toHaveText('Shown on your profile. Optional.');
  await expect(page.getByText(/Not used yet|Saved for later/)).toHaveCount(0);
  await expect(page.getByTestId('skip-rest')).toHaveCount(0);
  await page.getByTestId('name-input').fill('x'.repeat(40));
  await expect(page.getByTestId('name-hint')).toHaveText("That's the limit: 40 letters.");
  await cta(page).tap();
  await atStep(page, 'reveal');
  await page.goto('./#/settings');
  await expect(page.getByTestId('profile-name')).toContainText('x'.repeat(40));
});

test('P8: an error names its own field; a step that misses the heaviest is flagged; examples are only placeholders', async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'home', equipmentFor: 'home', equipment: ['dumbbells'] });
  await expect(page.getByTestId('range-min')).toHaveAttribute('placeholder', '5');
  await expect(page.getByTestId('range-min')).toHaveValue('');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('range-min').fill('5');
  await page.getByTestId('range-max').fill('50');
  await page.getByTestId('range-step').fill('abc');
  await expect(page.getByTestId('range-note')).toHaveText('Goes up by: type a number.');
  await expect(page.getByTestId('range-step')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('range-min')).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByTestId('range-max').fill('52');
  await page.getByTestId('range-step').fill('5');
  await expect(page.getByTestId('range-note')).toHaveText('Goes up by: never lands on the heaviest.');
  await expect(cta(page)).toBeDisabled();
  await shot(page, 'range-error');
  await page.getByTestId('range-max').fill('50');
  await expect(page.getByTestId('range-note')).toHaveText('');
  await expect(cta(page)).toBeEnabled();
});

test('P13: outdoors asks only about pull up bars and bands; full gym labels never break mid word @matrix', async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'outdoors', equipmentFor: 'outdoors', equipment: [] });
  await expect(page.getByRole('heading', { name: 'What does your gym have?' })).toBeVisible();
  await expect(page.getByTestId('equipment').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('equip-pull_up_bar')).toBeVisible();
  await expect(page.getByTestId('equip-resistance_bands')).toBeVisible();
  await page.goto('./#/settings');
  await page.goto('./#/welcome');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!);
    d.answers.place = 'full';
    d.answers.equipmentFor = 'full';
    d.answers.equipment = ['barbell_rack'];
    localStorage.setItem('anygym.intakeDraft', JSON.stringify(d));
  });
  await page.reload();
  await atStep(page, 'equipment');
  await expect(page.getByTestId('equip-hyperextension_bench')).toHaveText('Back extension bench');
  // Every word fits its chip: nothing wider than its box.
  const broken = await page.evaluate(() =>
    // PLAN 3.3a: only spans with words (a tile's picture span holds none).
    [...document.querySelectorAll('[data-testid^="equip-"] span')]
      .filter((el) => (el.textContent ?? '').trim().length > 0)
      .filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1 || (el.textContent ?? '').split(' ').some((w) => {
        const r = document.createRange();
        const t = el.firstChild!;
        const start = t.textContent!.indexOf(w);
        r.setStart(t, start);
        r.setEnd(t, start + w.length);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0);
        return new Set(rects.map((x) => Math.round(x.top))).size > 1;
      }))
      .map((el) => el.textContent),
  );
  expect(broken).toEqual([]);
  await shot(page, 'equipment-soft');
});

test('P14: on the reveal the check finishes by 900 ms beside the title; weekdays show when the count matches @matrix', async ({ page }) => {
  await drafted(page, 'reveal', { goal: 'muscle', days: 5, place: 'full', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], units: US });
  const end = await page.getByTestId('reveal-check').evaluate((svg) =>
    Math.max(...[...svg.querySelectorAll('*')].flatMap((el) => el.getAnimations().map((a) => Number(a.effect!.getComputedTiming().endTime)))),
  );
  expect(end).toBeGreaterThan(0);
  expect(end).toBeLessThanOrEqual(900);
  const check = (await page.getByTestId('reveal-check').boundingBox())!;
  const title = (await page.getByRole('heading', { name: 'Your plan' }).boundingBox())!;
  expect(check.x + check.width).toBeLessThanOrEqual(title.x);
  await expect(page.getByTestId('reveal-week').getByRole('listitem').first()).toContainText('Mon');
  // Day 5 and the alternatives can be reached.
  const alt = page.getByTestId('reveal-plan-six-week-volume');
  await alt.scrollIntoViewIfNeeded();
  await expect(alt).toBeInViewport();
  await checkLayout(page, { primary: revealPrimary(page) });
  await shot(page, 'reveal-weekdays');
});

test('P15: the edge swipe goes back on a pushed screen; the first screen has none; the ruler keeps its own drags', async ({ page }) => {
  await drafted(page, 'focus', { goal: 'muscle', units: US });
  const box = (await page.getByTestId('edge-swipe').boundingBox())!;
  await page.mouse.move(box.x + 5, 300);
  await page.mouse.down();
  await page.mouse.move(200, 300, { steps: 6 });
  await page.mouse.move(360, 300, { steps: 6 });
  await page.mouse.up();
  await atStep(page, 'units');
  await backButton(page).tap();
  await atStep(page, 'goal');
  await expect(page.getByTestId('edge-swipe')).toHaveCount(0);
  // The ruler starts clear of the strip.
  await page.evaluate(() => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'bodyweight', answers: { units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' } } })));
  await page.reload();
  await atStep(page, 'bodyweight');
  const strip = (await page.getByTestId('edge-swipe').boundingBox())!;
  const ruler = (await page.getByTestId('bodyweight-ruler').boundingBox())!;
  expect(ruler.x).toBeGreaterThanOrEqual(strip.x + strip.width);
  await expect(page.getByText('Stays on this phone.')).toBeVisible();
  await expect(page.getByTestId('why')).toHaveText('Optional. Suggests starting weights.Coming soon');
});

test('P1 P9 P10: the selected toggle is the solid lime pill; the body starts unpicked; Units fits the SE with no fade over it', async ({ page }) => {
  await drafted(page, 'units', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in' } });
  await expect(page.getByText('Which body should the muscle map show?')).toBeVisible();
  const bg = await page.getByTestId('units-weight').locator('[data-pill]').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('gradient');
  expect(bg).not.toContain('0.14');
  await expect(page.getByTestId('units-body').getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(cta(page)).toBeEnabled();
  await checkLayout(page, { primary: cta(page) });
  if (test.info().project.name === 'iPhone SE') expect(await intake(page).getAttribute('data-more')).toBeNull();
  await shot(page, 'units');
  // Unpicked stays unpicked: the muscle map keeps its default, nothing stored.
  await cta(page).tap();
  await atStep(page, 'focus');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.units.body ?? null)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('anygym.muscleBody'))).toBeNull();
});

test('R2: localStorage blocked: the funnel still resumes from IndexedDB; an existing user goes straight to Today', async ({ page }) => {
  const block = () => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  await page.addInitScript(block);
  await page.goto('./');
  await atStep(page, 'goal');
  await page.getByTestId('q-goal-race').tap();
  // PLAN 3.3a: the goal takes up to 2, so it has Continue (was auto advance).
  await cta(page).tap();
  await atStep(page, 'units');
  await expect.poll(async () => JSON.stringify(await dbAll(page, 'kv'))).toContain('"step');
  await page.reload();
  await atStep(page, 'units');
  await backButton(page).tap();
  await expect(page.getByTestId('q-goal-race')).toHaveAttribute('aria-pressed', 'true');
  // Finished: the database says so, with localStorage still blocked.
  await dbPut(page, 'profile', { id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1 });
  await dbPut(page, 'planState', { id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
  await page.goto('about:blank');
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page).not.toHaveURL(/welcome/);
});

test('P2: the pinned button sits at one height on Units, Focus, Equipment, Cardio and the reveal', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  const open = async (step: string, answers: Record<string, unknown>) => {
    await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, answers] as const);
    await page.reload();
    await atStep(page, step);
  };
  const at: Record<string, number> = {};
  for (const [step, extra] of [
    ['units', {}],
    ['focus', {}],
    ['cardio', {}],
    ['equipment', { place: 'hotel', equipmentFor: 'hotel', equipment: ['treadmill'] }],
  ] as const) {
    await open(step, { goal: 'muscle', units: US, ...extra });
    at[step] = (await cta(page).boundingBox())!.y;
  }
  await open('reveal', { goal: 'muscle', days: 5, place: 'full', units: US });
  at.reveal = (await revealPrimary(page).boundingBox())!.y;
  expect(new Set(Object.values(at)).size, JSON.stringify(at)).toBe(1);
});

test('P5: the no plan notice keeps one line about the profile', async ({ page }) => {
  await drafted(page, 'noPlan', { goal: 'muscle', units: US, place: 'home', equipmentFor: 'home', equipment: [] });
  await expect(page.getByText(/kept either way/)).toHaveCount(0);
});

test('P1: unpicked says it is optional; the first muscle map asks once, saved to the same preference @matrix', async ({ page }) => {
  await drafted(page, 'units', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in' } });
  await expect(page.getByTestId('units-body-hint')).toHaveText('Optional. You can change this in Settings.');
  await checkLayout(page, { primary: cta(page) });
  if (test.info().project.name === 'iPhone SE') expect(await intake(page).getAttribute('data-more')).toBeNull();
  // Past the funnel, no body picked: the first map with a drawing asks.
  await page.evaluate(() => {
    localStorage.setItem('anygym.intakeDone', '1');
    localStorage.removeItem('anygym.intakeDraft');
  });
  await page.goto('about:blank');
  await quickWith(page, [['bench', 'Dumbbell Bench Press']]);
  const ask = page.getByTestId('body-ask');
  await ask.scrollIntoViewIfNeeded();
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('radio', { checked: true })).toHaveCount(0);
  await shot(page, 'muscle-ask');
  await ask.getByRole('radio', { name: 'Female' }).tap();
  await expect(ask).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('anygym.muscleBody'))).toBe('female');
  await page.reload();
  await expect(page.getByTestId('muscle-pair').first()).toBeAttached();
  await expect(page.getByTestId('body-ask')).toHaveCount(0);
});

test('P1: asked once even if ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('anygym.intakeDone', '1'));
  await quickWith(page, [['bench', 'Dumbbell Bench Press']]);
  await expect(page.getByTestId('body-ask')).toBeAttached();
  await page.reload();
  await expect(page.getByTestId('muscle-pair').first()).toBeAttached();
  await expect(page.getByTestId('body-ask')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('anygym.muscleBody'))).toBeNull();
});
