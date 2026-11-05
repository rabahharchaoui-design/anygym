import { expect, guardContext, test, type Locator, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

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
const cta = (page: Page) => page.getByTestId('intake-cta').getByRole('button');
/** The round back button in the header (a focus chip is also called Back). */
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

type Walk = { layout?: boolean; text?: boolean; shots?: boolean };

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
  await screen('units', cta(page));
  await t.next();
  await screen('focus', cta(page));
  await expect(cta(page)).toBeDisabled();
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
  await screen('cardioFavorites');
  await t.skip();
  await screen('easyOn');
  await t.skip();
  await screen('love');
  await t.skip();
  await screen('never');
  await t.skip();
  await screen('when');
  await t.pick('when', 'after_work');
  await screen('name');
  await t.skip();
  await screen('bodyweight');
  await t.skip();
  await screen('height');
  await t.skip();
  await screen('age');
  await t.skip();
  await screen('reveal', page.getByTestId('reveal-cta').getByRole('button'));
  return t.n;
}

/** SPEC 14 "finish in under 60 seconds", as taps: about 2 s a tap is 52 s. */
const TAP_BUDGET = 26;

test('a new user goes through the funnel in 24 taps, every screen fits, Start Day 1 lands in the workout @matrix', async ({ page }) => {
  const started = Date.now();
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welcome$/);
  // The first screen: no back (nothing before it), no button (it moves on by itself), the quiet line.
  await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();
  await expect(backButton(page)).toHaveCount(0);
  await expect(page.getByText('Stays on this phone.')).toBeVisible();
  await expect(page.getByText(/Apple Health/)).toHaveCount(0);
  const taps = await fastPath(page, { layout: true, shots: true });
  await expect(page.getByTestId('reveal-card')).toContainText('Classic 5 Day Split');
  await expect(page.getByTestId('reveal-reason')).toHaveText('5 days a week in a full gym, built to add muscle.');
  await expect(page.getByTestId('reveal-week').getByRole('listitem')).toHaveCount(5);
  // Both curated plans fit a full gym: "Or pick a curated plan" lists them.
  await expect(page.getByTestId('reveal-plan-six-week-volume')).toBeVisible();
  const start = page.getByTestId('reveal-cta').getByRole('button', { name: 'Start Day 1' });
  await start.tap();
  const total = taps + 1;
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect(page.getByText('Legs (hamstring focus)').first()).toBeVisible();
  expect(total).toBe(24);
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
  await t.pick('style', 'free');
  await t.pick('cardio', 'none');
  // Cardio None: no favorites screen.
  await atStep(page, 'easyOn');
  await t.pick('easyOn', 'knees');
  await t.pick('easyOn', 'none');
  await expect(page.getByTestId('q-easyOn-knees')).toHaveAttribute('aria-pressed', 'false');
  await t.pick('easyOn', 'wrists');
  await expect(page.getByTestId('q-easyOn-none')).toHaveAttribute('aria-pressed', 'false');
  await t.next();
  await atStep(page, 'love');
  await page.getByTestId('q-love-search').fill('squat');
  await page.getByTestId('q-love').getByRole('button', { name: /squat/i }).first().tap();
  await t.next();
  await atStep(page, 'never');
  await t.skip();
  await t.pick('when', 'early');
  await atStep(page, 'name');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('name-input').fill('Sam');
  await t.next();
  await atStep(page, 'bodyweight');
  // Kilograms from the units screen; nothing saved until the ruler moves.
  await expect(cta(page)).toBeDisabled();
  await expect(page.getByTestId('bw-unit').getByRole('radio', { name: 'Kilograms' })).toHaveAttribute('aria-checked', 'true');
  const ruler = page.getByTestId('bodyweight-ruler');
  await ruler.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bw-value')).toHaveText(/^72\.5\s*kg$/);
  await t.next();
  await atStep(page, 'height');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('wheel-cm').focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('wheel-cm')).toHaveAttribute('aria-valuetext', '178 cm');
  await t.next();
  await atStep(page, 'age');
  await t.skip();
  await atStep(page, 'reveal');
  // No plan for hotel gyms exists yet: an honest none, and a quick workout.
  await expect(page.getByTestId('reveal-reason')).toHaveText('No plan made for hotel gyms yet.');
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
  await atStep(page, 'height');
  // Height: two wheels in feet and inches, the toggle converts through load.ts.
  await page.getByTestId('height-unit').getByRole('radio', { name: 'Feet and inches' }).tap();
  await expect(page.getByTestId('wheel-ft')).toBeVisible();
  await expect(page.getByTestId('wheel-in')).toBeVisible();
  await page.getByTestId('wheel-in').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('wheel-in')).toHaveAttribute('aria-valuetext', '10 in');
  await shot(page, 'height');
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
      await atStep(page, 'units');
      for (const [id, name] of [
        ['units-weight', weight],
        ['units-distance', distance],
        ['units-measure', measure],
      ] as const)
        await expect(page.getByTestId(id).getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('units-body').getByRole('radio', { name: 'Male', exact: true })).toHaveAttribute('aria-checked', 'true');
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
  // The saved answer shows; Back on the first screen goes back to Settings.
  await expect(page.getByTestId('q-goal-muscle')).toHaveAttribute('aria-pressed', 'true');
  await backButton(page).tap();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.getByTestId('redo-intake').tap();
  await atStep(page, 'goal');
  await page.getByTestId('q-goal-muscle').tap();
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
  for (const step of ['cardioFavorites', 'easyOn', 'love', 'never']) {
    await atStep(page, step);
    await page.getByTestId('skip').tap();
  }
  await page.getByTestId('q-when-after_work').tap();
  for (const step of ['name', 'bodyweight', 'height', 'age']) {
    await atStep(page, step);
    await page.getByTestId('skip').tap();
  }
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
  await checkLayout(page, { primary: page.getByTestId('reveal-cta').getByRole('button') });
  await shot(page, 'reveal-130');
});

// ---------------------------------------------------------------- round 2 (Codex review)

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
  await expect(page.getByTestId('dumbbell-range')).toContainText('Check these');
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

test('three weekdays on a five day plan: every workout shows as Day 1 to 5, with the one line why @matrix', async ({ page }) => {
  await page.goto('./#/settings');
  await page.evaluate(() =>
    localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'reveal', answers: { goal: 'muscle', days: 5, place: 'full', weekdays: ['mon', 'wed', 'fri'], experience: '3y' } })),
  );
  await page.goto('./#/welcome');
  await atStep(page, 'reveal');
  const rows = page.getByTestId('reveal-week').getByRole('listitem');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(4)).toContainText('Day 5');
  await expect(rows.nth(4)).toContainText('Shoulders and calves');
  await expect(page.getByTestId('reveal-caveat')).toHaveText('You picked 3 days and this plan has 5. Do them in order at your own pace.');
  await shot(page, 'reveal-weekdays-mismatch');
});

test('a redo left alone never touches the gym Settings changed; skipping Name deletes it', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  // First intake, with a name.
  await page.evaluate(() =>
    localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'name', answers: { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'full', equipmentFor: 'full', days: 5 } })),
  );
  await page.reload();
  await atStep(page, 'name');
  await page.getByTestId('name-input').fill('Sam');
  await cta(page).tap();
  for (const step of ['bodyweight', 'height', 'age']) {
    await atStep(page, step);
    await page.getByTestId('skip').tap();
  }
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
  await page.getByTestId('q-goal-muscle').tap();
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
  for (const step of ['cardioFavorites', 'easyOn', 'love', 'never']) {
    await atStep(page, step);
    await page.getByTestId('skip').tap();
  }
  await page.getByTestId('q-when-early').tap();
  // Name shows the saved one; Skip discards it.
  await atStep(page, 'name');
  await expect(page.getByTestId('name-input')).toHaveValue('Sam');
  await page.getByTestId('skip').tap();
  for (const step of ['bodyweight', 'height', 'age']) {
    await atStep(page, step);
    await page.getByTestId('skip').tap();
  }
  await atStep(page, 'reveal');
  await expect.poll(async () => (await dbAll(page, 'profile'))[0]?.intake && ((await dbAll(page, 'profile'))[0]!.intake as { skipped?: string[] }).skipped).toContain('name');
  const [profile] = await dbAll(page, 'profile');
  expect('name' in profile!).toBe(false);
  expect(await dbAll(page, 'gyms')).toEqual([kept]);
});
