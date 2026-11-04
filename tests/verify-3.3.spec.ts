import { expect, test, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

// PLAN 3.3 independent verification (tester). Fresh phone, every screen, honest reveals, breakage.
test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, step: string) => expect(intake(page)).toHaveAttribute('data-step', step);
const cta = (page: Page) => page.getByTestId('intake-cta').getByRole('button');
const SHOTS = new Set(['iPhone SE', 'iPhone 17 Pro Max']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOTS.has(phone)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.3/v-${name}-${phone.replace(/ /g, '-')}.png` });
};
const draft = (page: Page, step: string, answers: Record<string, unknown>) =>
  page.evaluate(([s, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: s, answers: a })), [step, answers] as const);

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

/** Per screen: what the chrome must show. kind: auto = single choice, cta = Continue. */
async function chrome(page: Page, step: string, kind: 'auto' | 'cta', opts: { back: boolean }) {
  await atStep(page, step);
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible();
  const hb = (await h1.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(hb.x, `${step} title left`).toBeLessThan(40);
  expect(hb.y, `${step} title top`).toBeLessThan(200);
  expect(hb.x + hb.width, `${step} title inside`).toBeLessThanOrEqual(vw);
  await expect(page.getByText('Stays on this phone.').first()).toBeVisible();
  const back = page.locator('header').getByRole('button', { name: 'Back', exact: true });
  if (opts.back) {
    const b = (await back.boundingBox())!;
    expect(Math.abs(b.width - b.height), `${step} back is round`).toBeLessThan(1.5);
    expect(b.width, `${step} back size`).toBeGreaterThanOrEqual(44);
    expect(await back.evaluate((el) => getComputedStyle(el).borderRadius)).toMatch(/50%|9999|999|\d{2,}px/);
  } else await expect(back).toHaveCount(0);
  if (kind === 'auto') await expect(page.getByTestId('intake-cta')).toHaveCount(0);
  else {
    const c = (await cta(page).boundingBox())!;
    expect(c.height, `${step} cta height`).toBeGreaterThanOrEqual(48);
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over, `${step} horizontal overflow`).toBeLessThanOrEqual(0);
  await checkLayout(page, {});
}

test('all 22 screens: title top left, round back, Stays on this phone, auto advance or grey Continue; no Apple Health, no names @matrix', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welcome$/);
  const seen: string[] = [];
  const t = (id: string) => page.getByTestId(id);
  const disabledWithReason = async (step: string) => {
    await expect(cta(page), `${step} Continue starts grey`).toBeDisabled();
    const reason = await page.getByTestId('intake-cta').innerText();
    expect(reason.replace(/Continue|Stays on this phone\./g, '').trim().length, `${step} has a reason`).toBeGreaterThan(3);
  };
  const auto = async (step: string, pick: string, back = true) => {
    await chrome(page, step, 'auto', { back });
    seen.push(step);
    await t(pick).tap();
    // The card pulses (aria-pressed), then the next screen comes in on its own.
    await expect(intake(page)).not.toHaveAttribute('data-step', step);
  };
  const multi = async (step: string, pick: string | null) => {
    await chrome(page, step, 'cta', { back: true });
    seen.push(step);
    if (pick) {
      await disabledWithReason(step);
      await t(pick).tap();
    }
    await expect(cta(page)).toBeEnabled();
    await cta(page).tap();
  };
  await auto('goal', 'q-goal-muscle', false);
  await chrome(page, 'units', 'cta', { back: true });
  seen.push('units');
  await expect(cta(page)).toBeEnabled();
  await shot(page, 'units');
  await cta(page).tap();
  await multi('focus', 'q-focus-arms');
  await multi('win', 'q-win-energy');
  await auto('experience', 'q-experience-new');
  await auto('days', 'q-days-3');
  await chrome(page, 'weekdays', 'cta', { back: true });
  seen.push('weekdays');
  await disabledWithReason('weekdays');
  await t('q-weekdays-mon').tap();
  await cta(page).tap();
  await auto('minutes', 'q-minutes-45');
  await auto('place', 'q-place-home');
  await chrome(page, 'equipment', 'cta', { back: true });
  seen.push('equipment');
  await shot(page, 'equipment-home');
  await cta(page).tap();
  await auto('style', 'q-style-bodyweight');
  await auto('cardio', 'q-cardio-love');
  await multi('cardioFavorites', 'q-cardioFavorites-running');
  await multi('easyOn', 'q-easyOn-knees');
  await chrome(page, 'love', 'cta', { back: true });
  seen.push('love');
  await disabledWithReason('love');
  await page.getByTestId('skip').tap();
  await chrome(page, 'never', 'cta', { back: true });
  seen.push('never');
  await page.getByTestId('skip').tap();
  await auto('when', 'q-when-lunch');
  await chrome(page, 'name', 'cta', { back: true });
  seen.push('name');
  await disabledWithReason('name');
  await page.getByTestId('name-input').fill('Alex');
  await cta(page).tap();
  await chrome(page, 'bodyweight', 'cta', { back: true });
  seen.push('bodyweight');
  await disabledWithReason('bodyweight');
  await page.getByTestId('skip').tap();
  await chrome(page, 'height', 'cta', { back: true });
  seen.push('height');
  await disabledWithReason('height');
  await page.getByTestId('skip').tap();
  await auto('age', 'q-age-25_34');
  seen.push('reveal');
  await atStep(page, 'reveal');
  expect(seen).toHaveLength(22);
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Apple Health|HealthKit|Rabah|Harchaoui/i);
  await shot(page, 'reveal-home');
});

test('double tap a choice card advances exactly one screen; back mid auto-advance cancels it', async ({ page }) => {
  await page.goto('./');
  const card = page.getByTestId('q-goal-strength');
  await card.dblclick();
  await page.waitForTimeout(900);
  await atStep(page, 'units');
  await page.getByTestId('intake-cta').getByRole('button').tap();
  await atStep(page, 'focus');
  // Back straight after a tap on a single choice screen: lands on the previous screen, not skipped ahead.
  await page.locator('header').getByRole('button', { name: 'Back', exact: true }).tap();
  await atStep(page, 'units');
  await page.waitForTimeout(600);
  await atStep(page, 'units');
});

test('bodyweight: 180 lb flips to 81.5 kg (load.ts, 0.5 snap), nothing saved until moved, ends are clamped', async ({ page }) => {
  await page.goto('./');
  await draft(page, 'bodyweight', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' } });
  await page.reload();
  await atStep(page, 'bodyweight');
  await expect(cta(page)).toBeDisabled();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.bodyweight ?? null);
  expect(await stored()).toBeNull();
  const ruler = page.getByTestId('bodyweight-ruler');
  await ruler.focus();
  // Zero and huge: Home/End style presses stay inside the ruler's range.
  for (let i = 0; i < 400; i++) await page.keyboard.press('ArrowLeft');
  const lo = Number(/^[\d.]+/.exec((await page.getByTestId('bw-value').textContent())!)![0]);
  expect(lo).toBeGreaterThanOrEqual(60);
  for (let i = 0; i < 1500; i++) await page.keyboard.press('ArrowRight');
  const hi = Number(/^[\d.]+/.exec((await page.getByTestId('bw-value').textContent())!)![0]);
  expect(hi).toBeLessThanOrEqual(600);
  // Bring it to exactly 180.0 lb: from the low end, step up by 0.5.
  for (let i = 0; i < 1500; i++) await page.keyboard.press('ArrowLeft');
  const start = Number(/^[\d.]+/.exec((await page.getByTestId('bw-value').textContent())!)![0]);
  for (let i = 0; i < Math.round((180 - start) * 2); i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bw-value')).toHaveText(/^180\.0\s*lb$/);
  await page.getByTestId('bw-unit').getByRole('radio', { name: 'Kilograms' }).tap();
  // 180 / 2.20462 = 81.6466 -> nearest 0.5 = 81.5
  await expect(page.getByTestId('bw-value')).toHaveText(/^81\.5\s*kg$/);
  await cta(page).tap();
  await atStep(page, 'height');
  expect(((await stored()) as { unit: string }).unit).toBe('kg');
});

const REVEALS: Array<[string, Record<string, unknown>, RegExp, string]> = [
  ['hotel', { place: 'hotel' }, /No plan made for hotel gyms yet/, 'Start a quick workout'],
  ['home', { place: 'home' }, /No plan made for home/i, 'Start a quick workout'],
  ['outdoors', { place: 'outdoors' }, /No plan made for (outdoors|outdoor)/i, 'Start a quick workout'],
  ['full', { place: 'full', days: 4 }, /\w/, 'Start Day 1'],
];
for (const [name, extra, reason, button] of REVEALS) {
  test(`reveal for ${name}: honest reason, right button, draws the check, saved gym matches @matrix`, async ({ page }) => {
    await page.goto('./');
    await draft(page, 'reveal', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, days: 4, ...extra });
    await page.reload();
    await atStep(page, 'reveal');
    await expect(page.getByTestId('reveal-reason')).toHaveText(reason);
    await expect(page.getByTestId('reveal-cta').getByRole('button', { name: button })).toBeVisible();
    if (button === 'Start Day 1') await expect(page.getByTestId('reveal-week')).toBeVisible();
    else {
      await expect(page.getByTestId('reveal-week')).toHaveCount(0);
      await expect(page.getByTestId('reveal-card')).not.toContainText(/Day 1|Mon /);
    }
    // The lime check: its mark is stroke-animated (dash offset moves from drawn-off to drawn).
    const mark = page.getByTestId('reveal-check').locator('path');
    const first = await mark.evaluate((el) => getComputedStyle(el).strokeDashoffset);
    await page.waitForTimeout(1600);
    const last = await mark.evaluate((el) => getComputedStyle(el).strokeDashoffset);
    expect(parseFloat(last)).toBeCloseTo(0, 1);
    test.info().annotations.push({ type: 'check', description: `dashoffset ${first} -> ${last}` });
    await shot(page, `reveal-${name}`);
    const gyms = await dbAll(page, 'gyms');
    const type = { hotel: 'hotel', home: 'home', outdoors: 'none', full: 'full' }[name];
    expect(gyms[0]).toMatchObject({ type });
    const [p] = await dbAll(page, 'profile');
    expect(p).toMatchObject({ defaultUnit: 'lb' });
    expect(gyms[0]).toMatchObject({ unit: 'lb' });
  });
}

test('Start Day 1 double tap makes one workout; offline start still works; reload mid funnel resumes', async ({ page, context }) => {
  await page.goto('./');
  await draft(page, 'reveal', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, days: 5, place: 'full' });
  await page.reload();
  await atStep(page, 'reveal');
  await context.setOffline(true);
  const start = page.getByTestId('reveal-cta').getByRole('button', { name: 'Start Day 1' });
  await start.dblclick();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await page.waitForTimeout(500);
  expect(await dbAll(page, 'sessions')).toHaveLength(1);
  expect(await dbAll(page, 'planState')).toHaveLength(1);
  await context.setOffline(false);
  // Back to Today by URL: never the funnel again.
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page).not.toHaveURL(/welcome/);
});

test('a user with only a plan in use is an existing user; a corrupt draft starts fresh', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const row = { id: 'x', planId: 'five-day-split', nextDayIndex: 0, startedAt: 1 };
  const keys = await page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const s = req.result.transaction('planState', 'readonly').objectStore('planState');
          resolve(s.keyPath === null ? null : String(s.keyPath));
          req.result.close();
        };
      }),
  );
  test.info().annotations.push({ type: 'planState keyPath', description: String(keys) });
  await page.evaluate(
    ([r]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const tx = req.result.transaction('planState', 'readwrite');
          const store = tx.objectStore('planState');
          store.put(store.keyPath ? { ...r, ...(store.keyPath === 'key' ? { key: 'current' } : {}) } : r, store.keyPath ? undefined : 'current');
          tx.oncomplete = () => (req.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    [row] as const,
  );
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page).not.toHaveURL(/welcome/);
});

test('corrupt draft starts at the first screen without errors', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('anygym.intakeDraft', '{"step":"nope","answers":{"goal":7,"bodyweight":{"value":-5,"unit":"kg"}}}'));
  await page.reload();
  await atStep(page, 'goal');
});

test('130% text and reduced motion on the SE: no clipping, no sideways scroll', async ({ browser }) => {
  test.skip(test.info().project.name !== 'iPhone SE', 'SE only');
  const context = await (await import('./fixtures')).guardContext(await browser.newContext({ ...test.info().project.use, reducedMotion: 'reduce' }));
  const page = await context.newPage();
  await simulateSafeAreas(page);
  await page.goto('./');
  await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
  for (const step of ['goal', 'equipment', 'bodyweight', 'height', 'reveal']) {
    await draft(page, step, { goal: 'muscle', units: { weight: 'kg', distance: 'km', measure: 'cm', body: 'male' }, place: 'full', days: 5 });
    await page.reload();
    await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
    await atStep(page, step);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over, step).toBeLessThanOrEqual(0);
    await checkLayout(page, {});
    await shot(page, `t130-${step}`);
  }
  await context.close();
});
