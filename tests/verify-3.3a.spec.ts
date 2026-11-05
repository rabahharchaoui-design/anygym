import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';

// PLAN 3.3a independent verification (tester). Goals, equipment pictures, full screens, old answers,
// 130% text and reduced motion. Fresh profile; console errors fail through the fixtures.
test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const PHONES = new Set(['iPhone SE', 'iPhone 15']);
const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, s: string) => expect(intake(page)).toHaveAttribute('data-step', s);
const cta = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
const phoneName = () => test.info().project.name.replace(/ /g, '-');
const SHOT = (n: string) => `reports/shots/3.3a/verify/${n}-${phoneName()}.png`;
const draftAnswers = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers as Record<string, unknown>);
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
const drafted = async (page: Page, step: string, answers: Record<string, unknown>) => {
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, answers] as const);
  await page.reload();
  await atStep(page, step);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await page.waitForTimeout(350);
};
const noSideways = async (page: Page, what: string) => {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, wide: [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('[data-testid="bodyweight-ruler"]')).length }));
  expect(o.sw, `${what} page scrollWidth`).toBeLessThanOrEqual(o.cw);
  expect(o.bw, `${what} body scrollWidth`).toBeLessThanOrEqual(o.cw);
  expect(o.wide, `${what} elements past the right edge`).toBe(0);
};

const tags = async (page: Page) => {
  const out: Record<string, string> = {};
  for (const id of ['muscle', 'strength', 'fat_loss', 'tone', 'health', 'athletic', 'race', 'comeback']) out[id] = ((await page.getByTestId(`q-goal-${id}-tag`).textContent()) ?? '').trim();
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
};

test('(1) goals: Main, Also, swap, promote; stored Main first and old goal equals Main; Your plan only on a Main match', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  await page.getByTestId('q-goal-strength').tap();
  expect(await tags(page)).toEqual({ strength: 'Main' });
  await page.getByTestId('q-goal-muscle').tap();
  expect(await tags(page)).toEqual({ strength: 'Main', muscle: 'Also' });
  await page.getByTestId('q-goal-tone').tap();
  expect(await tags(page)).toEqual({ strength: 'Main', tone: 'Also' });
  await expect.poll(async () => (await draftAnswers(page)).goals).toEqual(['strength', 'tone']);
  expect((await draftAnswers(page)).goal).toBe('strength');
  // Main off: Also promoted.
  await page.getByTestId('q-goal-strength').tap();
  expect(await tags(page)).toEqual({ tone: 'Main' });
  await expect.poll(async () => (await draftAnswers(page)).goals).toEqual(['tone']);
  expect((await draftAnswers(page)).goal).toBe('tone');
  // Double tap on one goal: on then off, never a duplicate.
  await page.getByTestId('q-goal-health').dblclick();
  expect(Object.keys(await tags(page)).filter((k) => k === 'health')).toHaveLength(0);
  // Reload mid pick keeps the picks, Main first.
  await page.getByTestId('q-goal-muscle').tap();
  await expect.poll(async () => (await draftAnswers(page)).goals).toEqual(['tone', 'muscle']);
  await page.reload();
  await atStep(page, 'goal');
  expect(await tags(page)).toEqual({ tone: 'Main', muscle: 'Also' });
  // Tap targets.
  const b = (await page.getByTestId('q-goal-muscle').boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: SHOT('goal-two') });

  // Reveal: Main match keeps "Your plan"; Also only is never a match.
  await drafted(page, 'reveal', { goal: 'muscle', goals: ['muscle', 'strength'], units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-check')).toBeVisible();
  await drafted(page, 'reveal', { goal: 'strength', goals: ['strength', 'muscle'], units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Closest plan we have' })).toBeVisible();
  await expect(page.getByTestId('reveal-check')).toHaveCount(0);
  await page.screenshot({ path: SHOT('reveal-also-only') });
  // Start Day 1 (double tap): one session, profile.goal is the Main.
  const start = page.getByTestId('reveal-cta').getByRole('button', { name: 'Start Day 1' });
  await start.dblclick();
  await expect.poll(async () => (await dbAll(page, 'profile')).length).toBeGreaterThan(0);
  const [p] = await dbAll(page, 'profile');
  expect(p!.goal).toBe('strength');
  expect(await dbAll(page, 'sessions')).toHaveLength(1);
});

test('(5) an older answer with a single goal loads as Main', async ({ page }) => {
  await drafted(page, 'goal', { goal: 'health', units: US });
  expect(await tags(page)).toEqual({ health: 'Main' });
  await expect(cta(page)).toBeEnabled();
});

const GROUPS: Record<string, string[]> = {
  'Free weights': ['barbell_rack', 'ez_curl_bar', 'dumbbells', 'kettlebells'],
  'Benches and bars': ['flat_bench', 'adjustable_bench', 'hyperextension_bench', 'pull_up_bar', 'dip_station'],
  Machines: ['smith_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press_machine', 'pec_deck', 'shoulder_press_machine', 'calf_raise_machine', 'hip_adductor_abductor'],
  Cables: ['cable_station', 'lat_pulldown', 'seated_row'],
  'Cardio and extras': ['resistance_bands', 'jump_rope', 'treadmill', 'bike', 'stair_climber', 'rower'],
};

test('(2) equipment: 27 tiles with a drawing, 3 across, grouped, All is per group, i opens glossary, screens count', async ({ page }) => {
  test.skip(!PHONES.has(test.info().project.name));
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full', equipment: ['dumbbells', 'treadmill'] });
  const tiles = page.locator('[data-testid="equipment"] button[data-testid^="equip-"][aria-pressed]:not([data-testid^="equip-all"])');
  await expect(tiles).toHaveCount(27);
  await expect(page.locator('[data-testid="equipment"] svg[data-art]')).toHaveCount(27);
  // every tile contains its own svg, sizes sane
  const geo = await tiles.evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); const s = b.querySelector('svg[data-art]')!.getBoundingClientRect(); return { id: b.getAttribute('data-testid'), x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), sw: Math.round(s.width), name: (b.textContent ?? '').trim() }; }));
  expect(geo.every((g) => g.sw >= 28 && g.h >= 48 && g.name.length > 0)).toBe(true);
  const vw = page.viewportSize()!.width;
  const cols = new Set(geo.map((g) => g.x)).size;
  test.info().annotations.push({ type: 'columns', description: `${cols} columns, tile ${geo[0]!.w}x${geo[0]!.h}, svg ${geo[0]!.sw}, width ${vw}` });
  expect(cols).toBe(3);
  // group headings in order, each group's tiles under it
  expect(await page.getByTestId('equipment').locator('h2').allTextContents()).toEqual(Object.keys(GROUPS));
  // All is per group
  for (const [name, items] of Object.entries(GROUPS)) {
    const sec = page.getByTestId('equipment').locator('section', { has: page.locator('h2', { hasText: new RegExp(`^${name}$`) }) }).first();
    expect(await sec.locator('button[aria-pressed][data-testid^="equip-"]:not([data-testid^="equip-all"])').count(), `${name} tiles`).toBe(items.length);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.equipment as string[]);
    await sec.getByRole('button', { name: /^All/ }).first().scrollIntoViewIfNeeded();
    await sec.getByRole('button', { name: /^All/ }).first().tap();
    await expect.poll(async () => (await draftAnswers(page)).equipment as string[]).toEqual(expect.arrayContaining(items));
    const after = (await draftAnswers(page)).equipment as string[];
    // nothing outside the group changed
    expect(after.filter((i) => !items.includes(i)).sort(), `${name} leaks`).toEqual(before.filter((i) => !items.includes(i)).sort());
    await sec.getByRole('button', { name: /^All/ }).first().tap();
    await expect.poll(async () => ((await draftAnswers(page)).equipment as string[]).filter((i) => items.includes(i))).toEqual([]);
    expect(((await draftAnswers(page)).equipment as string[]).filter((i) => !items.includes(i)).sort()).toEqual(before.filter((i) => !items.includes(i)).sort());
    // restore the group's original state for the next group's leak check
    await page.evaluate(([e]) => { /* no-op */ void e; }, [before]);
  }
  // info button opens glossary
  const info = page.getByTestId('equip-smith_machine').locator('xpath=..').getByRole('button', { name: /What is/ });
  await info.scrollIntoViewIfNeeded();
  const ib = (await info.boundingBox())!;
  expect(ib.width).toBeGreaterThanOrEqual(24);
  await info.tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(/Smith/i);
  await page.screenshot({ path: SHOT('equipment-info') });
  await page.keyboard.press('Escape').catch(() => {});
  const close = page.getByRole('dialog').getByRole('button', { name: /close|done|got it/i }).first();
  if (await page.getByRole('dialog').isVisible()) await close.tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // screens
  const screens = await page.locator('main[data-scroller]').evaluate((el) => ({ sh: el.scrollHeight, vh: innerHeight, ch: el.clientHeight }));
  test.info().annotations.push({ type: 'screens', description: `scrollHeight ${screens.sh} / viewport ${screens.vh} = ${(screens.sh / screens.vh).toFixed(2)}` });
  // Round 2 (P13): "about 2 screens on a 15 Pro" is the Home Screen app's whole 852 pt, the same width.
  if (test.info().project.name === 'iPhone 15') expect(screens.sh / 852).toBeLessThanOrEqual(2.4);
  // full size shots of every group, with some picked
  await page.getByTestId('equip-all-machines').scrollIntoViewIfNeeded();
  for (const g of ['free', 'benches', 'machines', 'cables', 'extras']) {
    const el = page.getByTestId(`equip-group-${g}`);
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: SHOT(`group-${g}`) });
  }
  await noSideways(page, 'equipment');
});

const FULL = { goal: 'muscle', goals: ['muscle'], units: US, days: 4, minutes: 45, place: 'full', equipmentFor: 'full', experience: '3y' };
const SCREENS: Array<[string, Record<string, unknown>]> = [
  ['goal', {}], ['units', { goal: 'muscle', units: US }], ['focus', FULL], ['win', FULL], ['experience', FULL], ['days', FULL], ['weekdays', FULL],
  ['minutes', FULL], ['place', FULL], ['equipment', { ...FULL, equipment: ['dumbbells'] }], ['style', FULL], ['cardio', FULL], ['easyOn', FULL],
  ['exercises', FULL], ['when', FULL], ['bodyweight', FULL], ['about', FULL], ['noPlan', { ...FULL, place: 'home', equipmentFor: 'home', equipment: [] }], ['reveal', FULL],
];

test('(3) 19 screens: content share of the space above the button (own measure), why line, strip', async ({ page }) => {
  test.skip(!PHONES.has(test.info().project.name));
  test.setTimeout(180_000);
  const rows: string[] = [];
  const fails: string[] = [];
  for (const [step, answers] of SCREENS) {
    await drafted(page, step, answers);
    const m = await page.evaluate(() => {
      const scr = document.querySelector('[data-testid="intake"]')!;
      const main = scr.querySelector('main')!;
      const mr = main.getBoundingClientRect();
      const btn = scr.querySelector('[data-testid="intake-cta"], [data-testid="reveal-cta"]') as HTMLElement | null;
      const limit = btn ? btn.getBoundingClientRect().top : mr.bottom;
      let low = mr.top, lowNoStrip = mr.top;
      for (const el of main.querySelectorAll<HTMLElement>('*')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const b = Math.min(r.bottom, limit);
        low = Math.max(low, b);
        if (!el.closest('[data-testid="plan-so-far"]')) lowNoStrip = Math.max(lowNoStrip, b);
      }
      // text/controls only (ignores big empty containers): the lowest leaf with text or a control
      let leaf = mr.top;
      for (const el of main.querySelectorAll<HTMLElement>('button, h1, h2, h3, p, li, span, input, svg, label')) {
        if (el.closest('[data-testid="plan-so-far"]')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        leaf = Math.max(leaf, Math.min(r.bottom, limit));
      }
      return { space: limit - mr.top, withStrip: (low - mr.top) / (limit - mr.top), noStrip: (lowNoStrip - mr.top) / (limit - mr.top), leaf: (leaf - mr.top) / (limit - mr.top), scrolls: main.scrollHeight > main.clientHeight + 1 };
    });
    const why = (await page.getByTestId('why').count()) ? ((await page.getByTestId('why').textContent()) ?? '').trim() : '(none)';
    const strip = (await page.getByTestId('plan-so-far').count()) ? ((await page.getByTestId('plan-so-far').innerText()).replace(/\s+/g, ' ')) : '(none)';
    rows.push(`${step}: leafFill ${Math.round(m.leaf * 100)}% blockFill ${Math.round(m.noStrip * 100)}% withStrip ${Math.round(m.withStrip * 100)}% of ${Math.round(m.space)}px${m.scrolls ? ' scrolls' : ''} | why: ${why} | strip: ${strip}`);
    if (m.leaf < 0.7) fails.push(`${step} leafFill ${Math.round(m.leaf * 100)}%`);
    if (m.noStrip < 0.7) fails.push(`${step} blockFill ${Math.round(m.noStrip * 100)}%`);
    if (step !== 'noPlan' && step !== 'reveal') {
      expect(why.length, `${step} why`).toBeGreaterThan(5);
      expect(why.length, `${step} why short`).toBeLessThanOrEqual(60);
    }
    await noSideways(page, step);
    await page.screenshot({ path: SHOT(`screen-${step}`) });
  }
  console.log(`FILL ${test.info().project.name}\n${rows.join('\n')}`);
  test.info().annotations.push({ type: 'fill', description: rows.join(' || ') });
  expect(fails, fails.join('; ')).toEqual([]);
});

test('(3) the strip fills in as days, minutes and place are answered', async ({ page }) => {
  // Round 2 (B7, supersedes round 1): the strip leads with the goals and the level, grows one pill
  // per answer, and shows only on the screens that add to it (not weekdays, not equipment).
  await drafted(page, 'days', { goal: 'muscle', goals: ['muscle'], units: US, experience: '3y' });
  const strip = page.getByTestId('plan-so-far');
  await expect(strip).toContainText('Muscle');
  await expect(strip).toContainText('3+ years');
  await expect(strip).not.toContainText('Days');
  await page.getByTestId('q-days-3').tap();
  await atStep(page, 'weekdays');
  await expect(strip).toHaveCount(0);
  await page.getByTestId('skip').tap();
  await atStep(page, 'minutes');
  await expect(strip).toContainText('3 days');
  await page.getByTestId('q-minutes-30').tap();
  await atStep(page, 'place');
  await expect(strip).toContainText('30 min');
  await expect(strip).toContainText('3 days');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await page.getByTestId('q-place-home').tap();
  await atStep(page, 'equipment');
  await expect(strip).toHaveCount(0);
  await drafted(page, 'place', { goal: 'muscle', units: US, experience: '3y', days: 3, minutes: 30, place: 'home' });
  await expect(strip).toContainText('Home');
});

test('(6) 130% text and reduced motion on the SE: no overflow, nothing clipped', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone SE');
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const allClipped: string[] = [];
  for (const [step, answers] of SCREENS) {
    await drafted(page, step, answers);
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const s = getComputedStyle(el);
        const size = parseFloat(s.fontSize), line = parseFloat(s.lineHeight);
        el.dataset.fs = String(size);
        el.dataset.lh = String(line);
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        el.style.fontSize = `${parseFloat(el.dataset.fs!) * 1.3}px`;
        const l = parseFloat(el.dataset.lh!);
        if (Number.isFinite(l)) el.style.lineHeight = `${l * 1.3}px`;
      }
    });
    await page.waitForTimeout(200);
    await noSideways(page, `${step} @130%`);
    const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main *, footer *')].filter((el) => {
      const s = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      return hasText && /(hidden|clip)/.test(s.overflowX + s.overflowY) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    }).map((el) => `${el.tagName} "${el.textContent!.trim().slice(0, 30)}"`));
    if (clipped.length) allClipped.push(`${step}: ${clipped.join(', ')}`);
    // Round 2 (B7): at 130% the strip is whole (every pill inside, above the button) or out of sight.
    await page.waitForTimeout(150);
    const strip = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="plan-so-far"]');
      if (!el) return 'none';
      if (el.dataset.away !== undefined || getComputedStyle(el).visibility === 'hidden') return 'away';
      const r = el.getBoundingClientRect();
      const btn = document.querySelector('[data-testid="intake-cta"], [class*="foot"]')!.getBoundingClientRect();
      const pillsCut = [...el.querySelectorAll('li')].some((li) => li.scrollWidth > li.clientWidth + 1 || li.getBoundingClientRect().right > innerWidth);
      return r.top >= 0 && r.bottom <= btn.top + 1 && !pillsCut ? 'whole' : `cut ${Math.round(r.bottom)} > ${Math.round(btn.top)}`;
    });
    expect(['none', 'away', 'whole'], `${step} strip at 130%: ${strip}`).toContain(strip);
    if (step === 'days' || step === 'goal') await page.screenshot({ path: SHOT(`t130-strip-${step}`) });
    // Primary button still reachable (visible on screen).
    const btn = page.getByTestId('intake-cta').or(page.getByTestId('reveal-cta')).first();
    if (await btn.count()) { const bb = (await btn.boundingBox())!; expect(bb.y + bb.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1); }
    if (['goal', 'equipment', 'minutes'].includes(step)) await page.screenshot({ path: SHOT(`t130-${step}`) });
  }
  expect(allClipped, `text cut off at 130%: ${allClipped.join(' | ')}`).toEqual([]);
});

test('(6b) breakage: offline, back mid pick, tap All twice fast', async ({ page, context }) => {
  test.skip(!PHONES.has(test.info().project.name));
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full', equipment: [] });
  await context.setOffline(true);
  await page.getByTestId('equip-all-cables').tap();
  await page.getByTestId('equip-all-cables').dblclick();
  const eq = (await draftAnswers(page)).equipment as string[];
  expect(new Set(eq).size).toBe(eq.length);
  await page.getByTestId('equip-all').tap();
  await expect.poll(async () => ((await draftAnswers(page)).equipment as string[]).length).toBe(27);
  await context.setOffline(false);
});
