import { expect, test, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

// PLAN 3.3 independent verification (tester). Fresh phone, every screen, honest reveals, breakage.
test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, step: string) => expect(intake(page)).toHaveAttribute('data-step', step);
const cta = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
const SHOTS = new Set(['iPhone SE', 'iPhone 17 Pro Max']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOTS.has(phone)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.3/v-${name}-${phone.replace(/ /g, '-')}.png` });
};
const draft = async (page: Page, step: string, answers: Record<string, unknown>) => {
  // The funnel writes its own first draft in an effect after it mounts: let that land first.
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate(([s, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: s, answers: a })), [step, answers] as const);
  await page.waitForTimeout(300); // WebKit flushes localStorage writes asynchronously
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

const greyScreens: string[] = [];
/** Per screen: what the chrome must show. kind: auto = single choice, cta = Continue. */
async function chrome(page: Page, step: string, kind: 'auto' | 'cta', opts: { back: boolean; note?: boolean }) {
  await atStep(page, step);
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible();
  const hb = (await h1.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(hb.x, `${step} title left`).toBeLessThan(40);
  expect(hb.y, `${step} title top`).toBeLessThan(200);
  expect(hb.x + hb.width, `${step} title inside`).toBeLessThanOrEqual(vw);
  // Rule (f): the quiet note on every screen; while Continue is grey its reason has its own line.
  const greyNow = kind === 'cta' && (await cta(page).isDisabled());
  if (greyNow) greyScreens.push(step);
  // 3.5f: the favorites deck screen has no footer note (every line counts there).
  if (opts.note !== false) await expect(page.getByText(/stays? on this phone\./i).first(), `${step} note`).toBeVisible();
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

test('all 17 questions and the reveal (PLAN 3.5: no no plan notice at home): title top left, round back, Stays on this phone, auto advance or grey Continue; no Apple Health, no names @matrix', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welcome$/);
  const seen: string[] = [];
  const t = (id: string) => page.getByTestId(id);
  const disabledWithReason = async (step: string) => {
    await expect(cta(page), `${step} Continue starts grey`).toBeDisabled();
    const reason = await page.getByTestId('intake-cta').innerText();
    expect(reason.replace(/Continue|Stays on this phone\.|Skip the rest/g, '').trim().length, `${step} has a reason`).toBeGreaterThan(3);
  };
  const auto = async (step: string, pick: string, back = true) => {
    await chrome(page, step, 'auto', { back });
    seen.push(step);
    await t(pick).tap();
    // The card pulses (aria-pressed), then the next screen comes in on its own.
    await expect(intake(page)).not.toHaveAttribute('data-step', step);
  };
  // PLAN 3.3a round 2 (B6): a question not used yet is optional, its Continue never grey.
  const multi = async (step: string, pick: string | null, optional = false) => {
    await chrome(page, step, 'cta', { back: true });
    seen.push(step);
    if (pick) {
      if (optional) await expect(cta(page), `${step} is optional`).toBeEnabled();
      else await disabledWithReason(step);
      await t(pick).tap();
    }
    await expect(cta(page)).toBeEnabled();
    await cta(page).tap();
  };
  // PLAN 3.3a: the goal takes up to 2 picks, so it has Continue now (it was auto advance).
  await chrome(page, 'goal', 'cta', { back: false });
  seen.push('goal');
  await disabledWithReason('goal');
  await t('q-goal-muscle').tap();
  await cta(page).tap();
  await chrome(page, 'units', 'cta', { back: true });
  seen.push('units');
  await expect(cta(page)).toBeEnabled();
  await shot(page, 'units');
  await cta(page).tap();
  await multi('focus', 'q-focus-arms', true);
  await multi('win', 'q-win-energy', true);
  await auto('experience', 'q-experience-months');
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
  // PLAN 3.5: home always gets a plan now (the no equipment plan, or one built from the answers), so
  // the no plan notice never shows here.
  await auto('style', 'q-style-bodyweight');
  await multi('cardio', 'q-cardio-love', true);
  await multi('easyOn', 'q-easyOn-knees', true);
  await chrome(page, 'exercises', 'cta', { back: true, note: false }); // 3.5f: the deck step
  seen.push('exercises');
  await expect(cta(page), 'exercises is optional').toBeEnabled();
  await page.getByTestId('skip').tap();
  await auto('when', 'q-when-lunch');
  await chrome(page, 'bodyweight', 'cta', { back: true });
  seen.push('bodyweight');
  await expect(cta(page), 'bodyweight is optional').toBeEnabled();
  await page.getByTestId('skip').tap();
  await chrome(page, 'about', 'cta', { back: true });
  seen.push('about');
  await disabledWithReason('about');
  await page.getByTestId('name-input').fill('Alex');
  await t('q-age-25_34').tap();
  await cta(page).tap();
  seen.push('reveal');
  await atStep(page, 'reveal');
  expect(seen).toHaveLength(18);
  test.info().annotations.push({ type: 'reason under the grey button', description: greyScreens.join(',') });
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Apple Health|HealthKit|Rabah|Harchaoui/i);
  await shot(page, 'reveal-home');
});

test('double tap a choice card advances exactly one screen; back mid auto-advance cancels it', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  // PLAN 3.3a: the goal is no longer a single choice (a double tap there is on, then off); Days is.
  await draft(page, 'days', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, experience: '3y' });
  await page.reload();
  await atStep(page, 'days');
  const card = page.getByTestId('q-days-4');
  await card.dblclick();
  await page.waitForTimeout(900);
  await atStep(page, 'weekdays');
  // Back straight after: lands on the previous screen, not skipped ahead.
  await page.locator('header').getByRole('button', { name: 'Back', exact: true }).tap();
  await atStep(page, 'days');
  await page.waitForTimeout(600);
  await atStep(page, 'days');
});

test('bodyweight: 180 lb flips to 81.5 kg (load.ts, 0.5 snap), nothing saved until moved, ends are clamped', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  await draft(page, 'bodyweight', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' } });
  await page.reload();
  await atStep(page, 'bodyweight');
  // PLAN 3.3a round 2 (B6): optional now; still nothing is saved until the ruler moves.
  await expect(cta(page)).toBeEnabled();
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
  await atStep(page, 'about');
  expect(((await stored()) as { unit: string }).unit).toBe('kg');
});

const REVEALS: Array<[string, Record<string, unknown>, RegExp, string]> = [
  // PLAN 3.5: hotel, home and outdoors get Your plan built from the answers (with nothing at home or
  // outdoors, 3 full body days; 4 days of upper and lower need gear: see generator-3.5).
  ['hotel', { place: 'hotel' }, /Your plan/, 'Start Day 1'],
  ['home', { place: 'home', days: 3 }, /Your plan/, 'Start Day 1'],
  ['outdoors', { place: 'outdoors', days: 3 }, /Your plan/, 'Start Day 1'],
  ['full', { place: 'full', days: 5 }, /Your plan/, 'Start Day 1'],
];
for (const [name, extra, reason, button] of REVEALS) {
  test(`reveal for ${name}: honest reason, right button, draws the check, saved gym matches @matrix`, async ({ page }) => {
    await page.goto('./');
    await draft(page, 'reveal', { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, days: 4, ...extra });
    await page.reload();
    await atStep(page, 'reveal');
    await expect(page.locator('h1')).toHaveText(reason);
    await expect(page.getByTestId('reveal-cta').getByRole('button', { name: button })).toBeVisible();
    if (button === 'Start Day 1') await expect(page.getByTestId('reveal-week')).toBeVisible();
    else {
      await expect(page.getByTestId('reveal-week')).toHaveCount(0);
      await expect(page.getByTestId('reveal-card')).not.toContainText(/Day 1|Mon /);
    }
    if (button === 'Start Day 1') {
      // The lime check: its mark is stroke-animated (dash offset moves from drawn-off to drawn).
      const mark = page.getByTestId('reveal-check').locator('path');
      const first = await mark.evaluate((el) => getComputedStyle(el).strokeDashoffset);
      await page.waitForTimeout(1600);
      const last = await mark.evaluate((el) => getComputedStyle(el).strokeDashoffset);
      expect(parseFloat(last)).toBeCloseTo(0, 1);
      test.info().annotations.push({ type: 'check', description: `dashoffset ${first} -> ${last}` });
    } else {
      // No plan is not a win: no check.
      await expect(page.getByTestId('reveal-check')).toHaveCount(0);
    }
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
  await atStep(page, 'goal');
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
  await atStep(page, 'goal');
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
  for (const step of ['goal', 'equipment', 'bodyweight', 'about', 'reveal']) {
    await draft(page, step, { goal: 'muscle', units: { weight: 'kg', distance: 'km', measure: 'cm', body: 'male' }, place: 'full', days: 5 });
    await page.reload();
    await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
    await atStep(page, step);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over, step).toBeLessThanOrEqual(0);
    await checkLayout(page, {});
    // PLAN 3.5j round 2: no equipment label breaks inside a word (a word wider than its box would overflow it).
    if (step === 'equipment') {
      const wide = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[class*="tileName"]')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      expect(wide, 'tile labels wider than their tile').toEqual([]);
    }
    await shot(page, `t130-${step}`);
  }
  await context.close();
});
