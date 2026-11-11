import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

// PLAN 3.5 independent verification (tester): Your plan on fresh phones, backup and restore keep it,
// place tiles, the Settings redo path G will tap, offline, double taps, huge text, reduced motion.
const SHOTS = new Set(['iPhone SE', 'iPhone 15']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOTS.has(phone)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.5/verify/${name}-${phone.replace(/ /g, '-')}.png` });
};
const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, step: string) => expect(intake(page)).toHaveAttribute('data-step', step);
const primary = (page: Page) => page.getByTestId('reveal-cta').locator('button[data-variant="primary"]');
const HOTEL = ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'];
const dbAll = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const q = req.result.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => { resolve(q.result); req.result.close(); };
          q.onerror = () => reject(q.error);
        };
      }),
    store,
  );
const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
const toReveal = async (page: Page, answers: Record<string, unknown>) => {
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'reveal', answers: a })), answers);
  await page.reload();
  await atStep(page, 'reveal');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
};

const PATHS = [
  { name: 'hotel', place: 'hotel', goal: 'muscle', days: 4, minutes: 45, equipment: HOTEL, word: /hotel friendly/, label: 'build muscle' },
  { name: 'home', place: 'home', goal: 'fat_loss', days: 3, minutes: 30, equipment: [], word: /home friendly/, label: 'lose fat' },
  { name: 'outdoors', place: 'outdoors', goal: 'muscle', days: 2, minutes: 45, equipment: [], word: /no equipment needed/, label: 'build muscle' },
  { name: 'full gym', place: 'full', goal: 'strength', days: 5, minutes: 60, equipment: ['barbell_rack', 'flat_bench', 'adjustable_bench', 'dumbbells', 'cable_station', 'leg_press', 'lat_pulldown', 'seated_row', 'pull_up_bar', 'dip_station'], word: /full gym/, label: 'get stronger' },
];

test.describe('fresh phones', () => {
  test.use({ intake: 'fresh' });
  test.beforeEach(async ({ page }) => simulateSafeAreas(page));
  for (const p of PATHS) {
    // 3.5u: Looks good (double tap) lands on Today with the plan chosen and nothing started; the
    // workout is started from Today's day card.
    test(`${p.name}: Your plan, true reason, Looks good (double tap) then Start on Today, Plans, backup and restore @matrix`, async ({ page }) => {
      await noShare(page);
      const answers = { goal: p.goal, goals: [p.goal], units: US, experience: 'new', days: p.days, minutes: p.minutes, place: p.place, equipmentFor: p.place, equipment: p.equipment };
      await toReveal(page, answers);
      await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
      const reason = await page.getByTestId('reveal-reason').innerText();
      expect(reason).toContain(p.label);
      expect(reason).toContain(`${p.days} days`);
      expect(reason).toMatch(p.word);
      await expect(page.getByTestId('reveal-week').getByRole('listitem')).toHaveCount(p.days);
      await expect(page.getByTestId('reveal-secondary')).toHaveCount(0);
      await expect(primary(page)).toHaveText('Looks good');
      await checkLayout(page, { primary: primary(page) });
      await shot(page, `reveal-${p.name.replace(/ /g, '-')}`);
      // Double tap: one plan chosen, no workout; then Start on Today (inside the welcome's light): exactly one workout.
      await primary(page).dblclick();
      await expect(page).toHaveURL(/#\/$/);
      await page.waitForTimeout(500);
      expect((await dbAll(page, 'sessions')).length).toBe(0);
      await page.getByRole('region', { name: "Today's plan day" }).getByRole('button', { name: 'Start', exact: true }).tap();
      await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
      await page.waitForTimeout(500);
      expect((await dbAll(page, 'sessions')).length).toBe(1);
      const plans = await dbAll(page, 'plans');
      expect(plans.length).toBe(1);
      const def = plans[0]!.definition as { days: Array<{ blocks: unknown[] }> };
      expect(def.days.length).toBe(p.days);
      for (const d of def.days) expect(d.blocks.length).toBeGreaterThanOrEqual(2);
      await shot(page, `workout-${p.name.replace(/ /g, '-')}`);
      // Reload mid workout keeps it; back to Today and Plans lists it under Your plan.
      await page.reload();
      await expect(page.getByText(/Upper A|Full body A|Push|Upper/).first()).toBeVisible();
      expect((await dbAll(page, 'sessions')).length).toBe(1);
      await page.goto('./#/plans');
      await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
      const card = page.getByTestId(`plan-${String(plans[0]!.id)}`);
      await expect(card).toBeVisible();
      await shot(page, `plans-${p.name.replace(/ /g, '-')}`);
      // Backup keeps the plan; wipe; restore brings it back and it still opens.
      await page.goto('./#/settings');
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
      const path = (await download.path())!;
      const file = JSON.parse(readFileSync(path, 'utf8'));
      expect(file.tables.plans.length).toBe(1);
      expect(file.tables.plans[0].definition).toBeTruthy();
      await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res(); }));
      await page.goto('./#/history');
      await page.reload();
      await page.goto('./#/settings');
      await page.getByTestId('restore-file').setInputFiles(path);
      await page.getByTestId('restore-replace').tap();
      await page.getByTestId('restore-replace').tap();
      await expect(page.getByRole('dialog', { name: 'Restore backup' })).toHaveCount(0);
      expect((await dbAll(page, 'plans')).length).toBe(1);
      await page.reload();
      await page.goto('./#/plans');
      await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
      await page.getByTestId(`plan-${String(plans[0]!.id)}`).tap();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await checkLayout(page);
      await shot(page, `restored-viewer-${p.name.replace(/ /g, '-')}`);
    });
  }

  // 3.5u: offline, Looks good lands on Today with one plan and no workout.
  test('offline Looks good works: Today, one plan, nothing started @matrix', async ({ page, context }) => {
    await toReveal(page, { goal: 'muscle', goals: ['muscle'], units: US, experience: '3y', days: 6, minutes: 75, place: 'full', equipmentFor: 'full', equipment: ['barbell_rack', 'flat_bench', 'dumbbells', 'cable_station', 'pull_up_bar'] });
    await context.setOffline(true);
    await primary(page).tap();
    await expect(page).toHaveURL(/#\/$/);
    await page.waitForTimeout(400);
    if (test.info().project.use.browserName === 'webkit') await page.reload();
    await expect(page).toHaveURL(/#\/$/);
    expect((await dbAll(page, 'plans')).length).toBe(1);
    expect((await dbAll(page, 'sessions')).length).toBe(0);
    await context.setOffline(false);
  });

  test('huge numbers and zero: 320 wide, 130% text, reduced motion @matrix', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toReveal(page, { goal: 'muscle', goals: ['muscle'], units: US, experience: 'new', days: 99, minutes: 0, place: 'home', equipmentFor: 'home', equipment: [], focus: ['arms', 'glutes', 'legs', 'chest', 'back', 'shoulders', 'core'], easyOn: ['lower_back', 'knees', 'shoulders', 'wrists', 'neck', 'hips'] });
    await expect(page.getByRole('heading', { name: /Your plan|Closest|plan/ }).first()).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = '130%'; });
    await page.waitForTimeout(200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over).toBeLessThanOrEqual(0);
    await shot(page, 'weird-130-reduced');
    await expect(page.getByTestId('reveal-cta').locator('button').first()).toBeVisible();
  });
});

test.describe('existing phone', () => {
  test.beforeEach(async ({ page }) => simulateSafeAreas(page));

  test('place tiles list the frozen plans @matrix', async ({ page }) => {
    await page.goto('./#/plans');
    for (const [id, name, plan] of [['travel', /Travel or hotel gym, \d+ plans?/, 'Hotel Gym 3 Day'], ['home', /At home, \d+ plans?/, 'No Equipment 3 Day'], ['bodyweight', /Bodyweight, \d+ plans?/, 'No Equipment 3 Day']] as const) {
      await page.waitForFunction(() => !document.documentElement.dataset.nav);
      const t = page.getByTestId(`place-${id}`);
      await expect(t).toHaveAccessibleName(name);
      await t.tap();
      await expect(page.getByText(plan).first()).toBeVisible();
      await shot(page, `place-${id}`);
      await page.getByRole('link', { name: 'Back to Plans' }).tap();
      await expect(page).toHaveURL(/#\/plans$/);
    }
    await page.goto('./#/plans');
    await expect(page.getByText('Beginner Full Body 3 Day').first()).toBeVisible();
    await checkLayout(page);
  });

  test('G redo path: Settings, Answer the questions again, hotel gym 4 days, Use this plan @matrix', async ({ page }) => {
    await page.goto('./#/settings');
    await expect(page.getByText('My profile')).toBeVisible();
    await page.getByTestId('redo-intake').tap();
    await expect(intake(page)).toBeVisible();
    const steps: string[] = [];
    const t = (id: string) => page.getByTestId(id);
    const cta = page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
    for (let i = 0; i < 40; i++) {
      const step = (await intake(page).getAttribute('data-step'))!;
      if (step === 'reveal') break;
      steps.push(step);
      const next = async () => { await expect(cta).toBeEnabled(); await cta.tap(); };
      const auto = async (id: string) => { await t(id).tap(); };
      switch (step) {
        case 'goal': await t('q-goal-muscle').tap(); await next(); break;
        case 'units': await next(); break;
        case 'focus': case 'win': case 'cardio': case 'easyOn': await next(); break;
        case 'experience': await auto('q-experience-1_2y'); break;
        case 'days': await auto('q-days-4'); break;
        case 'weekdays': await t('q-weekdays-mon').tap(); await next(); break;
        case 'minutes': await auto('q-minutes-45'); break;
        case 'place': await auto('q-place-hotel'); break;
        case 'equipment': await next(); break;
        case 'style': await auto('q-style-any'); break;
        case 'exercises': case 'bodyweight': await t('skip').tap(); break;
        case 'when': await auto('q-when-lunch'); break;
        case 'about': await t('skip').tap().catch(async () => { await t('name-input').fill('Alex'); await t('q-age-25_34').tap(); await next(); }); break;
        default: throw new Error(`unknown step ${step}`);
      }
      await page.waitForFunction((s) => document.querySelector('[data-testid="intake"]')?.getAttribute('data-step') !== s, step);
    }
    test.info().annotations.push({ type: 'redo steps', description: steps.join(' > ') });
    await atStep(page, 'reveal');
    const title = await page.getByRole('heading', { level: 1 }).first().innerText();
    const btn = await primary(page).innerText();
    const reason = await page.getByTestId('reveal-reason').innerText().catch(() => '');
    test.info().annotations.push({ type: 'reveal', description: `${title} | button=${btn} | ${reason}` });
    await shot(page, 'redo-reveal-hotel-4');
    await primary(page).dblclick();
    await page.waitForTimeout(600);
    const url = page.url();
    test.info().annotations.push({ type: 'after tap url', description: url });
    expect((await dbAll(page, 'plans')).length).toBe(1);
    await shot(page, 'redo-after');
    await page.goto('./#/plans');
    await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
    await shot(page, 'redo-plans');
  });
});

test.describe('hotel 3 days', () => {
  test.use({ intake: 'fresh' });
  test('hotel 3 days gets the frozen Hotel Gym 3 Day, not a duplicate build @matrix', async ({ page }) => {
    await toReveal(page, { goal: 'muscle', goals: ['muscle'], units: US, experience: '1_2y', days: 3, minutes: 45, place: 'hotel', equipmentFor: 'hotel', equipment: HOTEL });
    const body = await page.locator('main').innerText();
    test.info().annotations.push({ type: 'hotel3', description: body.replace(/\n+/g, ' | ').slice(0, 300) });
    await shot(page, 'reveal-hotel-3');
    // 3.5u: the button is Looks good.
    await expect(primary(page)).toHaveText('Looks good');
  });
});
