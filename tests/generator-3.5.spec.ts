// PROGRESS (PLAN 3.5): generator, frozen plans, saved plans and the reveal wiring built; this spec
// covers the brand new hotel, home, outdoors and full gym paths, the viewer, a reload and 130% text.
import { expect, test, type Locator, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

// PLAN 3.5 (SPEC 7.3, 14 step 14): when no curated plan truly matches, the reveal offers "Your plan"
// built from the answers, honest about what it did; Start Day 1 saves it on the phone and goes into
// the workout; the Plans tab and the plan viewer show it with its pairs and rests.
test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const SHOT_PHONES = new Set(['iPhone SE', 'iPhone 15', 'iPhone 17 Pro Max']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOT_PHONES.has(phone)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.5/${name}-${phone.replace(/ /g, '-')}.png` });
};

const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, step: string) => expect(intake(page)).toHaveAttribute('data-step', step);
const primary = (page: Page): Locator => page.getByTestId('reveal-cta').locator('button[data-variant="primary"]');

const HOTEL = ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'];
const ALL = [
  'barbell_rack',
  'flat_bench',
  'adjustable_bench',
  'dumbbells',
  'kettlebells',
  'cable_station',
  'smith_machine',
  'leg_press',
  'leg_extension',
  'leg_curl',
  'chest_press_machine',
  'pec_deck',
  'lat_pulldown',
  'seated_row',
  'shoulder_press_machine',
  'calf_raise_machine',
  'hip_adductor_abductor',
  'hyperextension_bench',
  'pull_up_bar',
  'dip_station',
  'resistance_bands',
  'ez_curl_bar',
  'treadmill',
  'bike',
  'stair_climber',
  'rower',
  'jump_rope',
];

/** A brand new user's answers, straight to the reveal (the funnel itself is covered by intake-3.3). */
const toReveal = async (page: Page, answers: Record<string, unknown>) => {
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'reveal', answers: a })), answers);
  await page.reload();
  await atStep(page, 'reveal');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
};

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

type Path = { name: string; answers: Record<string, unknown>; days: number; first: string; reason: RegExp };
const PATHS: Path[] = [
  {
    name: 'hotel',
    answers: { goal: 'muscle', goals: ['muscle'], units: US, experience: '1_2y', days: 4, minutes: 45, place: 'hotel', equipmentFor: 'hotel', equipment: HOTEL },
    days: 4,
    first: 'Upper A',
    reason: /^Built to build muscle: 4 days, about \d+ min, hotel friendly\.$/,
  },
  {
    name: 'home',
    answers: { goal: 'fat_loss', goals: ['fat_loss'], units: US, experience: 'new', days: 3, minutes: 30, place: 'home', equipmentFor: 'home', equipment: [] },
    days: 3,
    first: 'Full body A',
    reason: /^Built to lose fat: 3 days, about \d+ min, home friendly, a 10 min bodyweight circuit finisher\.$/,
  },
  {
    name: 'outdoors',
    answers: { goal: 'muscle', goals: ['muscle'], units: US, experience: 'months', days: 2, minutes: 45, place: 'outdoors', equipmentFor: 'outdoors', equipment: [], focus: ['legs'] },
    days: 2,
    first: 'Full body A',
    reason: /^Built to build muscle: 2 days, about \d+ min, no equipment needed, extra leg work\.$/,
  },
  {
    name: 'full gym',
    answers: { goal: 'strength', goals: ['strength'], units: US, experience: '3y', days: 4, minutes: 60, place: 'full', equipmentFor: 'full', equipment: ALL, easyOn: ['lower_back'] },
    days: 4,
    first: 'Upper A',
    reason: /^Built to get stronger: 4 days, about \d+ min, full gym, easy on lower back\.$/,
  },
];

for (const p of PATHS) {
  test(`brand new ${p.name}: Your plan with the check, the week, Start Day 1 goes into the workout @matrix`, async ({ page }) => {
    await toReveal(page, p.answers);
    await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
    await expect(page.getByTestId('reveal-check')).toBeVisible();
    await expect(page.getByTestId('reveal-reason')).toHaveText(p.reason);
    // Never the old fallbacks where the generator can build a week.
    await expect(page.getByText(/plan yet|Closest plan we have/)).toHaveCount(0);
    const rows = page.getByTestId('reveal-week').getByRole('listitem');
    await expect(rows).toHaveCount(p.days);
    await expect(rows.first()).toContainText(p.first);
    await expect(rows.first()).toContainText(/~\d+ min/);
    await expect(primary(page)).toHaveText('Start Day 1');
    await checkLayout(page, { primary: primary(page) });
    await shot(page, `reveal-${p.name.replace(/ /g, '-')}`);
    const minutes = /~(\d+) min/.exec((await rows.first().textContent())!)![1]!;
    await primary(page).tap();
    await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
    await expect(page.getByText(p.first).first()).toBeVisible();
    // The workout header's estimate is the one the reveal showed.
    await expect(page.getByText(new RegExp(`~${minutes} min`)).first()).toBeVisible();
    const [plan] = await dbAll(page, 'plans');
    expect(plan).toMatchObject({ source: 'generated' });
    expect(String(plan!.id)).toMatch(/^mine-/);
    expect(await dbAll(page, 'planState')).toMatchObject([{ planId: plan!.id, nextDayIndex: 0 }]);
    expect((await dbAll(page, 'sessions'))[0]).toMatchObject({ planId: plan!.id, dayId: '1' });
    await shot(page, `workout-${p.name.replace(/ /g, '-')}`);
    // A reload keeps the workout on its plan (the saved plan is known before any screen looks).
    await page.reload();
    await expect(page.getByText(p.first).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`~${minutes} min`)).first()).toBeVisible();
  });
}

test('the plan viewer shows Your plan with its pairs and rests; Plans lists it first @matrix', async ({ page }) => {
  await toReveal(page, PATHS[0]!.answers);
  await primary(page).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  const [plan] = await dbAll(page, 'plans');
  await page.goto('./#/plans');
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  const card = page.getByTestId(`plan-${plan!.id}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText('4 Day Upper Lower');
  await checkLayout(page);
  await shot(page, 'plans-your-plan');
  await card.tap();
  await expect(page).toHaveURL(new RegExp(`#/plans/${plan!.id}`));
  await expect(page.getByRole('heading', { name: '4 Day Upper Lower', level: 1 })).toBeVisible();
  // Pairs (small moves back to back) with their one rest, and singles with theirs.
  const pair = page.getByTestId('plan-pair').first();
  await pair.scrollIntoViewIfNeeded();
  await expect(pair).toBeVisible();
  await expect(pair.getByTestId('pair-rest')).toContainText(/\d+ s rest/);
  await expect(page.getByText(/sets × \d+ to \d+ reps · \d+ s rest/).first()).toBeVisible();
  await checkLayout(page);
  await shot(page, 'viewer-your-plan');
});

test('130% text and the SE: the reveal of a built plan keeps every line whole and Start Day 1 reachable @matrix', async ({ page }) => {
  await toReveal(page, PATHS[2]!.answers);
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await text130(page);
  await checkLayout(page, { primary: primary(page) });
  await expect(primary(page)).toBeInViewport({ ratio: 1 });
  await shot(page, 'reveal-130');
});

test('a curated plan can still be picked instead, and Your plan comes back as a choice @matrix', async ({ page }) => {
  await toReveal(page, PATHS[0]!.answers);
  await page.getByTestId('reveal-plan-hotel-gym-3-day').scrollIntoViewIfNeeded();
  await page.getByTestId('reveal-plan-hotel-gym-3-day').tap();
  await expect(page.getByTestId('reveal-card')).toContainText('Hotel Gym 3 Day');
  await expect(page.getByTestId('reveal-plan-mine')).toBeVisible();
  await page.getByTestId('reveal-plan-mine').tap();
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-week').getByRole('listitem')).toHaveCount(4);
  // Nothing is saved until Start: browsing the choices writes no plan.
  expect(await dbAll(page, 'plans')).toEqual([]);
});

test('the quick workout option stays: a brand new lifter can start one from Your plan @matrix', async ({ page }) => {
  await toReveal(page, PATHS[1]!.answers);
  await expect(page.getByTestId('reveal-secondary')).toHaveText('Start a quick workout');
  await page.getByTestId('reveal-secondary').tap();
  await expect(page).toHaveURL(/#\/workout\//);
  expect(await dbAll(page, 'planState')).toEqual([]);
  expect(await dbAll(page, 'plans')).toEqual([]);
});
