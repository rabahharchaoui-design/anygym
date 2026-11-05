// PROGRESS (PLAN 3.3a): all three points built and green on SE and 15 (also 320 floor, Pixel 7,
// Galaxy compact, Pro Max). Left for the critic: a real iPhone look at the drawings and the badges.
import { expect, test, type Page } from './fixtures';
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
  ['win', FULL],
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
  ['when', FULL],
  ['bodyweight', FULL],
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
      await expect(page.getByTestId('plan-so-far')).toBeVisible();
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
  // Main leads: strength first, muscle as Also, is the closest plan, and says the Also is used.
  await drafted(page, 'reveal', { goal: 'strength', goals: ['strength', 'muscle'], units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Closest plan we have' })).toBeVisible();
  await expect(page.getByTestId('reveal-check')).toHaveCount(0);
  await expect(page.getByTestId('reveal-reason')).toHaveText('Picked for your full gym, your second goal (muscle) and your 5 days.');
  await expect(page.getByTestId('reveal-warning')).toHaveText("Strength goal isn't built in yet.");
  // Muscle as Main with an Also: the true match keeps its check.
  await drafted(page, 'reveal', { goal: 'muscle', goals: ['muscle', 'fat_loss'], units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toHaveText('Picked for your full gym, your muscle goal and your 5 days.');
  await expect(page.getByTestId('reveal-warning')).toHaveText("Fat loss goal isn't built in yet.");
});

const GROUPS: Record<string, string[]> = {
  free: ['barbell_rack', 'ez_curl_bar', 'dumbbells', 'kettlebells'],
  benches: ['flat_bench', 'adjustable_bench', 'hyperextension_bench', 'pull_up_bar', 'dip_station'],
  machines: ['smith_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press_machine', 'pec_deck', 'shoulder_press_machine', 'calf_raise_machine', 'hip_adductor_abductor'],
  cables: ['cable_station', 'lat_pulldown', 'seated_row'],
  extras: ['resistance_bands', 'jump_rope', 'treadmill', 'bike', 'stair_climber', 'rower'],
};

test("equipment: 27 picture tiles in 5 groups, three across; every group's All turns its own items on and off @matrix", async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full', equipment: [] });
  const titles = await page.getByTestId('equipment').locator('h2').allTextContents();
  expect(titles).toEqual(['Free weights', 'Benches and racks', 'Machines', 'Cables', 'Bodyweight and extras']);
  await expect(page.getByTestId('equipment').locator('[data-testid^="equip-"][aria-pressed]:not([data-testid^="equip-all"])')).toHaveCount(27);
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

test('equipment drawings: one for each of the 27, one style (2 stroke, rounded, no fill), lime when picked', async ({ page }) => {
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
  expect(art).toHaveLength(27);
  expect(new Set(art.map((a) => a.id)).size).toBe(27);
  for (const a of art) {
    expect(a.tile, `${a.id} sits in its own tile`).toBe(`equip-${a.id}`);
    expect([a.stroke, a.cap, a.join, a.fill, a.overrides], `${a.id} style`).toEqual(['2', 'round', 'round', 'none', 0]);
    expect(a.shapes, `${a.id} is drawn`).toBeGreaterThan(0);
  }
  const lime = art.find((a) => a.id === 'dumbbells')!.color;
  const grey = art.find((a) => a.id === 'kettlebells')!.color;
  expect(lime).toBe('rgb(212, 255, 58)');
  expect(grey).not.toBe(lime);
  // The ⓘ sits in the tile's corner, never over the name.
  const tile = (await page.getByTestId('equip-smith_machine').boundingBox())!;
  const info = (await page.getByTestId('equip-smith_machine').locator('xpath=..').getByRole('button', { name: /What is/ }).boundingBox())!;
  expect(Math.abs(info.x + info.width - (tile.x + tile.width))).toBeLessThan(2);
  expect(Math.abs(info.y - tile.y)).toBeLessThan(2);
  // Every drawing on record, picked (lime) and not.
  if (test.info().project.name === 'iPhone 15') {
    await page.getByTestId('equip-all').tap();
    await page.getByTestId('equip-all-machines').tap();
    for (const g of Object.keys(GROUPS)) await page.getByTestId(`equip-group-${g}`).screenshot({ path: `reports/shots/3.3a/drawings-${g}-iPhone-15.png` });
  }
});

test('the whole equipment list fits in about 2 screens on the iPhone 15', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'G measured on his 15 Pro');
  await drafted(page, 'equipment', { goal: 'muscle', units: US, place: 'full', equipmentFor: 'full' });
  // A screen is the phone's whole height: the list and its title over the height of the phone.
  const screens = await page.locator('main[data-scroller]').evaluate((el) => el.scrollHeight / innerHeight);
  test.info().annotations.push({ type: 'equipment screens', description: screens.toFixed(2) });
  expect(screens).toBeLessThanOrEqual(2.4);
});

test('"Your plan so far" fills in as days, minutes and place are answered, at the bottom of the space', async ({ page }) => {
  await drafted(page, 'days', { goal: 'muscle', goals: ['muscle'], units: US, experience: '3y' });
  const strip = page.getByTestId('plan-so-far');
  await expect(strip).toContainText('Your plan so far');
  for (const [id, empty] of [['days', 'Days'], ['minutes', 'Minutes'], ['place', 'Place']] as const) {
    await expect(page.getByTestId(`so-far-${id}`)).toHaveText(empty);
    await expect(page.getByTestId(`so-far-${id}`)).not.toHaveAttribute('data-filled');
  }
  // On a short question it sits at the bottom of the space, just above the button.
  const nearButton = async () => {
    const st = (await strip.boundingBox())!;
    const foot = (await page.locator('[data-testid="intake"] [class*="foot"], [data-testid="intake-cta"]').first().boundingBox())!;
    expect(foot.y - (st.y + st.height)).toBeLessThanOrEqual(48);
    expect(st.height).toBeLessThanOrEqual(48);
  };
  await nearButton();
  await page.getByTestId('q-days-4').tap();
  await atStep(page, 'weekdays');
  await expect(page.getByTestId('so-far-days')).toHaveText('4 days');
  await expect(page.getByTestId('so-far-days')).toHaveAttribute('data-filled', '');
  await page.getByTestId('skip').tap();
  await atStep(page, 'minutes');
  await page.getByTestId('q-minutes-75').tap();
  await atStep(page, 'place');
  await expect(page.getByTestId('so-far-minutes')).toHaveText('75+ min');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await nearButton();
  await page.getByTestId('q-place-mix').tap();
  await atStep(page, 'equipment');
  // A long list: the strip comes last, after the groups.
  await expect(page.getByTestId('so-far-place')).toHaveText('Mix');
  await strip.scrollIntoViewIfNeeded();
  await shot(page, 'strip-filled');
  // Nothing on the reveal: the plan itself is there.
  await drafted(page, 'reveal', { goal: 'muscle', units: US, days: 5, place: 'full', equipmentFor: 'full' });
  await expect(page.getByTestId('plan-so-far')).toHaveCount(0);
});
