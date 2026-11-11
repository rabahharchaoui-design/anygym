// PROGRESS (PLAN 3.3a): all three points built and green on SE and 15 (also 320 floor, Pixel 7,
// Galaxy compact, Pro Max). Left for the critic: a real iPhone look at the drawings and the badges.
import { expect, test, type Page } from './fixtures';
import { tokenColor } from './helpers/tokens';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

// PLAN 3.3a: G's intake fixes from his iPhone (SPEC 14 step 1, 13.7, 23). Up to two goals tagged
// Main and Also; the equipment picker as picture tiles in five groups with their own All; every
// screen purposeful: options fill the space, one why line, and the "Your plan so far" strip.
test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const FILL_PHONES = new Set(['iPhone SE', 'iPhone 15']);
const SHOT_PHONES = new Set(['iPhone SE', 'iPhone 15', 'iPhone 17 Pro Max']);
const shot = async (page: Page, name: string) => {
  const phone = test.info().project.name;
  if (!SHOT_PHONES.has(phone)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.3a/${name}-${phone.replace(/ /g, '-')}.png` });
};

const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, step: string) => expect(intake(page)).toHaveAttribute('data-step', step);
const cta = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const draftAnswers = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers as Record<string, unknown>);

const drafted = async (page: Page, step: string, answers: Record<string, unknown>) => {
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, answers] as const);
  await page.reload();
  await atStep(page, step);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
};

/**
 * How much of the height above the button the question fills: from the top of the scrolling body
 * to the lowest visible thing in it, over the body top to the button (or the quiet line on single
 * choice screens). The "Your plan so far" strip at the bottom counts as empty.
 */
const fillOf = (page: Page) =>
  page.evaluate(() => {
    const screen = document.querySelector('[data-testid="intake"]')!;
    const main = screen.querySelector('main')!;
    const top = main.getBoundingClientRect().top;
    const button = screen.querySelector('[data-testid$="-cta"], footer, [class*="foot"]') as HTMLElement | null;
    const limit = button ? button.getBoundingClientRect().top : main.getBoundingClientRect().bottom;
    let bottom = top;
    for (const el of main.querySelectorAll<HTMLElement>('*')) {
      // The strip is not the question: it never counts as filling.
      if (el.closest('[data-testid="plan-so-far"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      bottom = Math.max(bottom, Math.min(r.bottom, limit));
    }
    return { fill: (bottom - top) / (limit - top), space: Math.round(limit - top) };
  });

const FULL = { goal: 'muscle', goals: ['muscle'], units: US, days: 4, minutes: 45, place: 'full', equipmentFor: 'full', experience: '3y' };
const SCREENS: Array<[string, Record<string, unknown>]> = [
  ['goal', {}],
  ['units', { goal: 'muscle', units: US }],
  ['focus', FULL],
  ['experience', FULL],
  ['days', FULL],
  ['weekdays', FULL],
  ['minutes', FULL],
  ['place', FULL],
  ['equipment', { ...FULL, equipment: ['dumbbells'] }],
  ['style', FULL],
  ['cardio', FULL],
  ['easyOn', FULL],
  ['exercises', FULL],
  // 3.5u: win, when and bodyweight are hidden until their features exist.
  ['about', FULL],
  ['noPlan', { ...FULL, place: 'home', equipmentFor: 'home', equipment: [] }],
  ['reveal', FULL],
];

test('every intake screen fills at least 70% of the height above the button, with one why line', async ({ page }) => {
  const phone = test.info().project.name;
  test.skip(!FILL_PHONES.has(phone), 'SE and iPhone 15 (G: SE and 15 Pro)');
  test.setTimeout(150_000);
  const seen: string[] = [];
  for (const [step, answers] of SCREENS) {
    await drafted(page, step, answers);
    await page.waitForTimeout(300);
    const { fill, space } = await fillOf(page);
    seen.push(`${step} ${Math.round(fill * 100)}% of ${space}px`);
    expect(fill, `${step} fills ${Math.round(fill * 100)}% of ${space}px above the button`).toBeGreaterThanOrEqual(0.7);
    if (step !== 'reveal' && step !== 'noPlan') {
      // One short why line under the title, never a claim the app cannot keep.
      await expect(page.getByTestId('why')).toHaveCount(1);
      const why = (await page.getByTestId('why').textContent())!;
      expect(why.length, `${step} why line is short`).toBeLessThanOrEqual(60);
      // Round 2 (B7): the strip only where the answer adds to it, and then whole or out of sight.
      const strip = page.getByTestId('plan-so-far');
      if (['goal', 'experience', 'days', 'minutes', 'place'].includes(step)) {
        await expect(strip).toHaveCount(1);
        const away = await strip.evaluate((el) => (el as HTMLElement).dataset.away !== undefined);
        if (!away) await expect(strip).toBeInViewport({ ratio: 1 });
      } else await expect(strip).toHaveCount(0);
    }
    await checkLayout(page, {});
    await shot(page, step);
  }
  test.info().annotations.push({ type: 'fill', description: seen.join(', ') });
});

const tagOf = (page: Page, id: string) => page.getByTestId(`q-goal-${id}-tag`);
const expectTags = async (page: Page, main: string | null, also: string | null) => {
  for (const id of ['muscle', 'strength', 'fat_loss', 'tone', 'health', 'athletic', 'race', 'comeback']) {
    const want = id === main ? 'Main' : id === also ? 'Also' : '';
    await expect(tagOf(page, id), `${id} tag`).toHaveText(want);
    await expect(page.getByTestId(`q-goal-${id}`)).toHaveAttribute('aria-pressed', want ? 'true' : 'false');
  }
};

test('main goal takes up to 2: Main, then Also, a third swaps the Also; stored Main first @matrix', async ({ page }) => {
  await page.goto('./');
  await atStep(page, 'goal');
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('q-goal-muscle').tap();
  // No auto advance any more: a second pick is welcome.
  await page.waitForTimeout(400);
  await atStep(page, 'goal');
  await expectTags(page, 'muscle', null);
  await expect(cta(page)).toBeEnabled();
  await page.getByTestId('q-goal-strength').tap();
  await expectTags(page, 'muscle', 'strength');
  await page.locator('main[data-scroller]').evaluate((el) => el.scrollTo({ top: 0 }));
  await shot(page, 'goal-two');
  // A third swaps out the Also; Main stays.
  await page.getByTestId('q-goal-fat_loss').tap();
  await expectTags(page, 'muscle', 'fat_loss');
  await expect.poll(async () => (await draftAnswers(page)).goals).toEqual(['muscle', 'fat_loss']);
  expect((await draftAnswers(page)).goal).toBe('muscle');
  // Main off: the Also leads now.
  await page.getByTestId('q-goal-muscle').tap();
  await expectTags(page, 'fat_loss', null);
  await page.getByTestId('q-goal-muscle').tap();
  await expectTags(page, 'fat_loss', 'muscle');
  await expect.poll(async () => (await draftAnswers(page)).goals).toEqual(['fat_loss', 'muscle']);
  // Turning both off greys Continue again.
  await page.getByTestId('q-goal-fat_loss').tap();
  await page.getByTestId('q-goal-muscle').tap();
  await expect(cta(page)).toBeDisabled();
  await page.getByTestId('q-goal-muscle').tap();
  await cta(page).tap();
  await atStep(page, 'units');
});

test('an older answer with one goal still loads as Main; Also never earns "Your plan"', async ({ page }) => {
  await drafted(page, 'goal', { goal: 'tone', units: US });
  await expectTags(page, 'tone', null);
  // Main leads: strength first, muscle as Also. No curated plan is a strength plan, so the Also never
  // earns a curated "Your plan": PLAN 3.5 builds one from the answers, strength first, muscle added.
  await drafted(page, 'reveal', { goal: 'strength', goals: ['strength', 'muscle'], units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-card')).not.toContainText('Classic 5 Day Split');
  await expect(page.getByTestId('reveal-reason')).toHaveText(/^Built to get stronger: 5 days, about \d+ min, full gym\.$/);
  // Round 2 (B2): both goals named, each used or coming soon.
  await expect(page.getByTestId('reveal-goals')).toHaveText('Main strength · Also muscle');
  // Muscle as Main with an Also: the true match keeps its check.
  await drafted(page, 'reveal', { goal: 'muscle', goals: ['muscle', 'fat_loss'], units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toHaveText('Picked for your full gym, your muscle goal and your 5 days.');
  await expect(page.getByTestId('reveal-goals')).toHaveText('Main muscle · Also fat loss (soon)');
});

const GROUPS: Record<string, string[]> = {
  free: ['barbell_rack', 'ez_curl_bar', 'dumbbells', 'kettlebells'],
  benches: ['flat_bench', 'adjustable_bench', 'hyperextension_bench', 'pull_up_bar', 'dip_station'],
  machines: ['smith_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press_machine', 'pec_deck', 'shoulder_press_machine', 'calf_raise_machine', 'hip_adductor_abductor'],
  cables: ['cable_station', 'lat_pulldown', 'seated_row'],
  extras: ['resistance_bands', 'jump_rope', 'yoga_mat', 'treadmill', 'elliptical', 'bike', 'stair_climber', 'rower'],
};

test("equipment: 29 picture tiles (3.5j: + elliptical, yoga mat) in 5 groups, three across; every group's All turns its own items on and off @matrix", async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full', equipment: [] });
  const titles = await page.getByTestId('equipment').locator('h2').allTextContents();
  expect(titles).toEqual(['Free weights', 'Benches and bars', 'Machines', 'Cables', 'Cardio and extras']);
  await expect(page.getByTestId('equipment').locator('[data-testid^="equip-"][aria-pressed]:not([data-testid^="equip-all"])')).toHaveCount(29);
  // Three across (two on the 320 floor): the first row of Machines shares one top, then a new row.
  const across = page.viewportSize()!.width <= 350 ? 2 : 3;
  const tops = await Promise.all(GROUPS.machines!.slice(0, across + 1).map(async (id) => Math.round((await page.getByTestId(`equip-${id}`).boundingBox())!.y)));
  expect(new Set(tops.slice(0, across)).size).toBe(1);
  expect(tops[across]).toBeGreaterThan(tops[0]!);
  for (const [group, items] of Object.entries(GROUPS)) {
    const all = page.getByTestId(`equip-all-${group}`);
    await all.scrollIntoViewIfNeeded();
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    await all.tap();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    for (const id of items) await expect(page.getByTestId(`equip-${id}`)).toHaveAttribute('aria-pressed', 'true');
    // Only this group: the others are as they were.
    await expect.poll(async () => ((await draftAnswers(page)).equipment as string[]).filter((id) => !items.includes(id))).toEqual([]);
    await all.tap();
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    for (const id of items) await expect(page.getByTestId(`equip-${id}`)).toHaveAttribute('aria-pressed', 'false');
  }
  // One item off in a full group turns its All off; on again turns it back on.
  await page.getByTestId('equip-all-cables').tap();
  await page.getByTestId('equip-lat_pulldown').tap();
  await expect(page.getByTestId('equip-all-cables')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('equip-lat_pulldown').tap();
  await expect(page.getByTestId('equip-all-cables')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await draftAnswers(page)).equipment).toEqual(['cable_station', 'lat_pulldown', 'seated_row']);
  await page.getByTestId('equip-all').tap();
  await shot(page, 'equipment-all-on');
});

test('equipment drawings: one for each of the 29, one style (2 stroke, rounded, no fill), lime when picked', async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full', equipment: ['dumbbells'] });
  const art = await page.locator('[data-testid="equipment"] svg[data-art]').evaluateAll((svgs) =>
    svgs.map((s) => ({
      id: s.getAttribute('data-art'),
      tile: s.closest('button')?.getAttribute('data-testid'),
      stroke: s.getAttribute('stroke-width'),
      cap: s.getAttribute('stroke-linecap'),
      join: s.getAttribute('stroke-linejoin'),
      fill: s.getAttribute('fill'),
      // Nothing inside overrides the one style, and nothing is a bitmap.
      overrides: [...s.querySelectorAll('*')].filter((el) => el.hasAttribute('stroke-width') || el.hasAttribute('fill') || el.hasAttribute('opacity') || el.tagName === 'image').length,
      shapes: s.querySelectorAll('path, rect, circle').length,
      color: getComputedStyle(s).color,
    })),
  );
  expect(art).toHaveLength(29);
  expect(new Set(art.map((a) => a.id)).size).toBe(29);
  for (const a of art) {
    expect(a.tile, `${a.id} sits in its own tile`).toBe(`equip-${a.id}`);
    expect([a.stroke, a.cap, a.join, a.fill, a.overrides], `${a.id} style`).toEqual(['2', 'round', 'round', 'none', 0]);
    expect(a.shapes, `${a.id} is drawn`).toBeGreaterThan(0);
  }
  // 3.5t: the accent token (ice blue), never a typed colour.
  const accent = art.find((a) => a.id === 'dumbbells')!.color;
  const grey = art.find((a) => a.id === 'kettlebells')!.color;
  expect(accent).toBe(await tokenColor(page, '--accent'));
  expect(grey).not.toBe(accent);
  // Round 2 (B3, P11): the picture is centred in a 56 pt box; the check badge top left, the ⓘ top
  // right, neither over the name.
  const tileEl = page.getByTestId('equip-smith_machine');
  const tile = (await tileEl.boundingBox())!;
  const pic = (await tileEl.locator('svg[data-art]').boundingBox())!;
  expect(Math.round(pic.width)).toBe(56);
  expect(Math.abs(pic.x + pic.width / 2 - (tile.x + tile.width / 2))).toBeLessThan(1.5);
  const info = (await tileEl.locator('xpath=..').getByRole('button', { name: /What is/ }).boundingBox())!;
  expect(Math.abs(info.x + info.width - (tile.x + tile.width))).toBeLessThanOrEqual(6);
  expect(Math.abs(info.y - tile.y)).toBeLessThanOrEqual(6);
  const name = (await tileEl.getByText('Smith machine').boundingBox())!;
  expect(name.y).toBeGreaterThanOrEqual(info.y + info.height - 6);
  const badge = (await page.getByTestId('equip-dumbbells').locator('svg[data-check]').boundingBox())!;
  const dTile = (await page.getByTestId('equip-dumbbells').boundingBox())!;
  expect(badge.x - dTile.x).toBeLessThan(14);
  expect(badge.y - dTile.y).toBeLessThan(14);
  // B4: the ⓘ sheet shows this same drawing, bigger, the moving part lime; no sticker line on a Smith machine.
  await tileEl.locator('xpath=..').getByRole('button', { name: /What is/ }).tap();
  const sheetArt = page.getByTestId('info-art').locator('svg[data-art="smith_machine"]');
  await expect(sheetArt).toBeVisible();
  // 3.5t: the accent token (ice blue), never a typed colour.
  expect(await sheetArt.locator('g[data-part]').evaluate((g) => getComputedStyle(g).stroke)).toBe(await tokenColor(page, '--accent'));
  await expect(page.getByTestId('info-weight')).toHaveCount(0);
  await shot(page, 'info-smith');
  await page.getByRole('button', { name: 'Got it' }).tap();
  await expect(page.getByTestId('info-art')).toHaveCount(0);
  await page.getByTestId('equip-ez_curl_bar').locator('xpath=..').getByRole('button', { name: /What is/ }).tap();
  await expect(page.getByTestId('info-weight')).toHaveText('Check the sticker or stamp, it varies');
  await page.getByRole('button', { name: 'Got it' }).tap();
  // Every drawing on record, picked (lime) and not.
  if (test.info().project.name === 'iPhone 15') {
    await page.getByTestId('equip-all').tap();
    await page.getByTestId('equip-all-machines').tap();
    for (const g of Object.keys(GROUPS)) await page.getByTestId(`equip-group-${g}`).screenshot({ path: `reports/shots/3.3a/drawings-${g}-iPhone-15.png` });
  }
});

test('the whole equipment list fits in about 2 screens on the 15 Pro Home Screen app (393 x 852)', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'G measured on his 15 Pro');
  // The Home Screen app has the whole 852 pt (no Safari bars): P13 measures there.
  await page.setViewportSize({ width: 393, height: 852 });
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full' });
  const screens = await page.locator('main[data-scroller]').evaluate((el) => el.scrollHeight / innerHeight);
  test.info().annotations.push({ type: 'equipment screens', description: screens.toFixed(2) });
  expect(screens).toBeLessThanOrEqual(2.4);
});

test('"Your plan so far" leads with the goals and the level, grows by one pill per answer, only where it adds', async ({ page }) => {
  await drafted(page, 'goal', { units: US });
  const strip = page.getByTestId('plan-so-far');
  await expect(strip).toContainText('Builds as you answer');
  await page.getByTestId('q-goal-muscle').tap();
  await page.getByTestId('q-goal-fat_loss').tap();
  await expect(page.getByTestId('so-far-goals')).toHaveText('Muscle + fat loss');
  await cta(page).tap();
  // Units adds nothing to it: no strip.
  await atStep(page, 'units');
  await expect(strip).toHaveCount(0);
  await drafted(page, 'experience', { goal: 'muscle', goals: ['muscle', 'fat_loss'], units: US });
  await page.getByTestId('q-experience-new').tap();
  await atStep(page, 'days');
  await expect(page.getByTestId('so-far-level')).toHaveText('Brand new');
  await page.getByTestId('q-days-4').tap();
  await atStep(page, 'weekdays');
  await expect(strip).toHaveCount(0);
  await page.getByTestId('skip').tap();
  await atStep(page, 'minutes');
  await expect(page.getByTestId('so-far-days')).toHaveText('4 days');
  await page.getByTestId('q-minutes-75').tap();
  await atStep(page, 'place');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  const pills = await strip.locator('li').allTextContents();
  expect(pills).toEqual(['Muscle + fat loss', 'Brand new', '4 days', '75+ min']);
  // Whole: no pill is cut, and the strip sits above the button, never under it.
  const cut = await strip.locator('li').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(cut).toBe(0);
  const away = await strip.evaluate((el) => (el as HTMLElement).dataset.away !== undefined);
  if (!away) await expect(strip).toBeInViewport({ ratio: 1 });
  await shot(page, 'strip-filled');
  // Nothing on the reveal: the plan itself is there.
  await drafted(page, 'reveal', { goal: 'muscle', units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByTestId('plan-so-far')).toHaveCount(0);
});

// ---------------------------------------------------------------- round 2 (critic and tester)

test('B1: a full gym with any single item off still gets its plan; the swaps are said @matrix', async ({ page }) => {
  const all = ['barbell_rack', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'cable_station', 'smith_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press_machine', 'pec_deck', 'lat_pulldown', 'seated_row', 'shoulder_press_machine', 'calf_raise_machine', 'hip_adductor_abductor', 'hyperextension_bench', 'pull_up_bar', 'dip_station', 'resistance_bands', 'ez_curl_bar', 'treadmill', 'bike', 'stair_climber', 'rower', 'jump_rope'];
  await drafted(page, 'equipment', { goal: 'muscle', goals: ['muscle'], units: US, days: 5, experience: '3y', place: 'full', equipmentFor: 'full', equipment: all });
  // Turning kettlebells off (the critic's repro) goes on to the questions, never "No plan".
  await page.getByTestId('equip-kettlebells').scrollIntoViewIfNeeded();
  await page.getByTestId('equip-kettlebells').tap();
  await cta(page).tap();
  await atStep(page, 'style');
  await drafted(page, 'reveal', { goal: 'muscle', goals: ['muscle'], units: US, days: 5, experience: '3y', place: 'full', equipmentFor: 'full', equipment: all.filter((e) => e !== 'kettlebells') });
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toContainText(/swapped for your gym\.$/);
  await shot(page, 'b1-swapped');
});

test('B2 (PLAN 3.5): brand new, 3 days, 45 min: the Beginner Full Body 3 Day plan is a true match, both goals named', async ({ page }) => {
  await drafted(page, 'reveal', { goal: 'muscle', goals: ['muscle', 'fat_loss'], units: US, days: 3, minutes: 45, experience: 'new', place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-card')).toContainText('Beginner Full Body 3 Day');
  await expect(page.getByTestId('reveal-check')).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toHaveText('Picked for your full gym, your muscle goal and your 3 days.');
  // All three days of the week show on the SE without scrolling.
  const shownDays = await page.getByTestId('reveal-week').getByRole('listitem').evaluateAll((els) => {
    const cta = document.querySelector('[data-testid="reveal-cta"]')!.getBoundingClientRect().top;
    return els.filter((e) => e.getBoundingClientRect().bottom <= cta).length;
  });
  expect(shownDays).toBeGreaterThanOrEqual(2);
  // Brand new: the plan leads, a quick workout is the quiet option.
  // 3.5u: one action, Looks good; the quick workout is on Today.
  await expect(page.getByTestId('reveal-cta').locator('button[data-variant="primary"]')).toHaveText('Looks good');
  await expect(page.getByTestId('reveal-secondary')).toHaveCount(0);
  await expect(page.getByTestId('reveal-goals')).toHaveText('Main muscle · Also fat loss (soon)');
  // The plan shown is not offered again below.
  await expect(page.getByTestId('reveal-plan-beginner-full-body-3-day')).toHaveCount(0);
  await shot(page, 'b2-new-3d');
});

// 3.5u (supersedes B6): a question the app does not use yet is not asked at all, so nothing says Coming soon.
test('B6 (3.5u): optional questions say what they are for; nothing says Coming soon', async ({ page }) => {
  // PLAN 3.5: the generator uses focus, cardio, go easy on and the exercise lists: optional, no pill.
  const optional = ['focus', 'cardio', 'easyOn', 'exercises'];
  const soon = new Set<string>();
  for (const step of optional) {
    await drafted(page, step, { ...FULL });
    await expect(cta(page), `${step} Continue`).toBeEnabled();
    if (soon.has(step)) await expect(page.getByTestId('soon'), `${step} pill`).toHaveText('Coming soon');
    else await expect(page.getByTestId('soon'), `${step} pill`).toHaveCount(0);
    await expect(page.getByText(/Not used yet/)).toHaveCount(0);
  }
  // Untouched Continue is a skip, never a made up answer.
  await drafted(page, 'focus', { ...FULL });
  await cta(page).tap();
  await atStep(page, 'experience');
  await expect.poll(async () => (await draftAnswers(page)).skipped).toEqual(['focus']);
  // Go easy: said plainly what uses it, next to the stop and check line.
  await drafted(page, 'easyOn', { ...FULL });
  await expect(page.getByTestId('easy-note')).toHaveText('A plan built from your answers leaves out lifts that load these. If something hurts, stop and check with a professional.');
  // Style and When are single choice: a Skip instead.
  await drafted(page, 'style', { ...FULL });
  await expect(page.getByTestId('skip')).toBeVisible();
  // Used answers keep their plain why and no pill.
  await drafted(page, 'days', { ...FULL });
  await expect(page.getByTestId('soon')).toHaveCount(0);
});

test('P8 P9 P10: weekdays as a list of days; honest hints on Days and Minutes; icons on Focus and Easy on', async ({ page }) => {
  await drafted(page, 'weekdays', { ...FULL });
  const days = page.getByTestId('q-weekdays').getByRole('button');
  await expect(days).toHaveCount(7);
  for (const box of await days.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) expect(box.h).toBeLessThan(box.w);
  await expect(page.getByTestId('q-weekdays-mon')).toHaveText('Monday');
  await drafted(page, 'days', { ...FULL });
  // The plans that ship run 5 days and (PLAN 3.5) 3 days: only those options say so.
  await expect(page.getByTestId('q-days-5')).toContainText('Our curated plans run this many');
  await expect(page.getByTestId('q-days-3')).toContainText('Our curated plans run this many');
  await expect(page.getByTestId('q-days-4')).not.toContainText('Our curated');
  await drafted(page, 'focus', { ...FULL });
  await expect(page.getByTestId('q-focus').locator('svg')).toHaveCount(8);
  await drafted(page, 'easyOn', { ...FULL });
  await expect(page.getByTestId('q-easyOn').locator('button svg')).toHaveCount(7);
});

test('P13: on the 393 x 852 Home Screen app every screen fills, the back button sits right under the safe area', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one run is enough: the viewport is set here');
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 393, height: 852 });
  const seen: string[] = [];
  for (const [step, answers] of SCREENS) {
    await drafted(page, step, answers);
    await page.waitForTimeout(250);
    const { fill, space } = await fillOf(page);
    seen.push(`${step} ${Math.round(fill * 100)}%`);
    expect(fill, `${step} fills ${Math.round(fill * 100)}% of ${space}px at 852`).toBeGreaterThanOrEqual(0.7);
    const back = page.locator('header').getByRole('button').first();
    if (await back.count()) {
      const top = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0);
      expect((await back.boundingBox())!.y - top, `${step} back button under the safe area`).toBeLessThanOrEqual(8);
    }
    if (['goal', 'days', 'equipment', 'reveal'].includes(step)) await shot(page, `852-${step}`);
  }
  test.info().annotations.push({ type: 'fill 852', description: seen.join(', ') });
});
