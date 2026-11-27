import { mkdirSync } from 'node:fs';
import { expect, test, TILE_ORIGIN, type Page } from './fixtures';
import { checkControls, checkLayout, simulateSafeAreas } from './helpers/layout';
import { endAndDiscard, pocketSeen } from './helpers/run';
import { stubTiles, tileAsks } from './helpers/tiles';

// PLAN 4.2 (SPEC 12.1, 12.10): the Run tab's start screen. The map, the GPS chip that never blocks
// Start (competitor gap 5), run types and pickers, music links, the 3 2 1 countdown and the honest
// live run it hands over to (4.3; verify-4.3 covers that screen). Tiles never come from the real host here (fixtures.ts, helpers/tiles.ts).

const SHOTS = process.env.SHOTS_42;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

const PARK = { latitude: 40.7812, longitude: -73.9665 };

async function openRun(page: Page) {
  await simulateSafeAreas(page);
  // The one time pocket mode explainer (4.3) is verify-4.3's subject; here Start goes straight to the countdown.
  await pocketSeen(page);
  await page.goto('./#/run');
  await expect(page.getByRole('heading', { level: 1, name: 'Run With Me' })).toBeVisible();
  await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');
}

/** Turns location on the way a user does: the chip, then "Use my location" (skipped when the phone already said yes). */
async function useLocation(page: Page) {
  const chip = page.getByTestId('gps-chip');
  if ((await chip.getAttribute('data-status')) !== 'ask') return;
  await chip.tap();
  await expect(page.getByTestId('gps-sheet')).toContainText('never leaves your phone');
  await page.getByTestId('gps-ask').tap();
  await expect(page.getByTestId('gps-sheet')).toBeHidden();
}

async function expectCountdownThenStop(page: Page) {
  await page.getByTestId('run-start').tap();
  await expect(page.getByTestId('run-countdown')).toBeVisible();
  await expect(page.getByTestId('live-run')).toBeVisible({ timeout: 6000 });
  await endAndDiscard(page);
}

/** How far the dot is from the middle of the map a person can see (between the status chips and the run types), in px. */
const dotOffCentre = (page: Page) =>
  page.evaluate(() => {
    const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const dot = box('run-dot');
    const top = box('gps-chip').bottom;
    const bottom = box('run-types').top;
    return { dx: Math.round(dot.left + dot.width / 2 - innerWidth / 2), dy: Math.round(dot.top + dot.height / 2 - (top + bottom) / 2) };
  });
const expectDotCentred = async (page: Page) => {
  await expect.poll(async () => Math.abs((await dotOffCentre(page)).dx), { message: 'dot in the middle, left to right' }).toBeLessThanOrEqual(2);
  await expect.poll(async () => Math.abs((await dotOffCentre(page)).dy), { message: 'dot in the middle of the visible map, top to bottom' }).toBeLessThanOrEqual(8);
};

const runRows = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('anygym');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const count = open.result.transaction('runs').objectStore('runs').count();
          count.onsuccess = () => (open.result.close(), resolve(count.result));
          count.onerror = () => reject(count.error);
        };
      }),
  );

test.describe('4.2 run start screen', () => {
  test('layout: title, map credit, four run types, music above Start, 48 pt targets @matrix', async ({ page }) => {
    await openRun(page);
    const types = page.getByTestId('run-types').getByRole('button');
    await expect(types).toHaveText(['Free run', 'Distance', 'Time', 'Intervals']);
    await expect(page.getByTestId('run-type-free')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('run-goal')).toContainText('No goal');
    await expect(page.getByTestId('map-credit')).toHaveText('© OpenFreeMap · OpenMapTiles · OpenStreetMap');
    await expect(page.getByTestId('gps-chip')).toBeVisible();

    // Music: plain links the user taps, right above Start; nothing is opened by the app itself.
    const spotify = page.getByRole('link', { name: 'Open Spotify' });
    const apple = page.getByRole('link', { name: 'Open Apple Music' });
    await expect(spotify).toHaveAttribute('href', 'https://open.spotify.com/');
    await expect(apple).toHaveAttribute('href', 'https://music.apple.com/');
    for (const l of [spotify, apple]) {
      await expect(l).toHaveAttribute('target', '_blank');
      await expect(l).toHaveAttribute('rel', 'noopener');
    }
    // SPEC 19: the gym pill is on Run too, top right beside the title, never over it.
    const pill = page.getByTestId('gym-pill');
    await expect(pill).toBeVisible();
    const [titleBox, pillBox] = await Promise.all([page.getByRole('heading', { level: 1 }).boundingBox(), pill.boundingBox()]);
    expect(titleBox!.x + titleBox!.width, 'the pill does not overlap the title').toBeLessThanOrEqual(pillBox!.x + 4);
    expect(pillBox!.x + pillBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const start = page.getByTestId('run-start');
    const [s, m, t, tab] = await Promise.all([start.boundingBox(), spotify.boundingBox(), types.first().boundingBox(), page.getByRole('navigation', { name: 'Main' }).boundingBox()]);
    expect(m!.y + m!.height, 'music sits right above Start').toBeLessThanOrEqual(s!.y + 1);
    expect(s!.y - (m!.y + m!.height), 'nothing between music and Start').toBeLessThanOrEqual(32);
    expect(t!.y + t!.height, 'run types sit above music').toBeLessThanOrEqual(m!.y + 1);
    expect(s!.y + s!.height, 'Start clears the tab bar').toBeLessThanOrEqual(tab!.y);
    // PLAN M12 (SPEC 23.2 Monolith): Start is big words over the ice line, full width (was a round button).
    expect(s!.width, 'one huge Start button').toBeGreaterThanOrEqual(page.viewportSize()!.width * 0.8);
    expect(s!.height, 'at least 56 pt tall').toBeGreaterThanOrEqual(56);
    const vh = page.viewportSize()!.height;
    expect(s!.y + s!.height / 2, 'Start is in the thumb zone').toBeGreaterThan(vh / 2);
    // The map is the hero (SPEC 12.1 "big map"): full bleed from the very top of the screen down to
    // the run types, and nothing scrolls.
    const mapBox = (await page.getByTestId('run-map').boundingBox())!;
    expect(mapBox.y).toBe(0);
    expect(mapBox.width).toBe(page.viewportSize()!.width);
    const share = t!.y / vh;
    console.log(`MAP SHARE ${test.info().project.name}: ${Math.round(share * 100)}% (${Math.round(t!.y)} of ${vh} px)`);
    expect(share, 'the map takes at least a quarter of the screen, more on taller phones').toBeGreaterThanOrEqual(vh < 600 ? 0.25 : 0.36);
    const chip = await page.getByTestId('gps-chip').boundingBox();
    expect(t!.y - (chip!.y + chip!.height), 'open map between the chips and the controls').toBeGreaterThanOrEqual(vh < 600 ? 64 : 110);
    expect(await page.evaluate(() => { const f = document.querySelector('[data-testid="run-float"]')!; return f.scrollHeight - f.clientHeight; }), 'the start screen does not scroll').toBeLessThanOrEqual(0);

    await checkLayout(page, { primary: start });
    await checkControls(page);
    await shot(page, 'start');
    // One tap opens the gym sheet.
    await pill.tap();
    await expect(page.getByTestId('new-gym-row')).toBeVisible();
  });

  test('Distance and Time open a picker; presets are one tap; custom uses the wheel and the unit @matrix', async ({ page }) => {
    await openRun(page);
    await page.getByTestId('run-type-distance').tap();
    const sheet = page.getByTestId('goal-sheet-distance');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('group', { name: 'Distance' }).getByRole('button')).toHaveText(['3 mi', '5 km', '10 km', 'Custom']);
    await checkControls(page);
    await shot(page, 'picker-distance');
    await page.getByTestId('distance-3-mi').tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('run-goal')).toContainText('3 mi');

    // The goal line opens the same picker again; Custom shows the wheel and the unit toggle.
    await page.getByTestId('run-goal').tap();
    await expect(page.getByTestId('distance-3-mi')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('distance-custom').tap();
    await expect(page.getByTestId('distance-wheel')).toBeVisible();
    await page.getByTestId('run-unit').getByRole('radio', { name: 'Kilometers' }).tap();
    await page.getByTestId('run-unit').getByRole('radio', { name: 'Miles' }).tap();
    await page.getByTestId('distance-wheel-column').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('goal-done')).toHaveText('Set 3.5 mi');
    await checkControls(page);
    await shot(page, 'picker-distance-custom');
    await page.getByTestId('goal-done').tap();
    await expect(page.getByTestId('run-goal')).toContainText('3.5 mi');

    await page.getByTestId('run-type-time').tap();
    const time = page.getByTestId('goal-sheet-time');
    await expect(time.getByRole('group', { name: 'Time' }).getByRole('button')).toHaveText(['20 min', '30 min', '45 min', 'Custom']);
    await shot(page, 'picker-time');
    await page.getByTestId('time-45').tap();
    await expect(page.getByTestId('run-goal')).toContainText('45 min');

    await page.getByTestId('run-type-intervals').tap();
    await expect(page.getByTestId('goal-sheet-intervals').getByRole('button', { pressed: true })).toContainText('Beginner');
    await shot(page, 'picker-intervals');
    await page.getByTestId('interval-builder').tap();
    await expect(page.getByTestId('run-goal')).toContainText('Builder');
    await expect(page.getByTestId('run-goal')).toContainText('Run 3 min, walk 1 min, 6 times');

    // Free run has no picker.
    await page.getByTestId('run-type-free').tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the chosen type, goal and unit are still there after a reload', async ({ page }) => {
    await openRun(page);
    await page.getByTestId('run-type-time').tap();
    await page.getByTestId('time-20').tap();
    await page.getByTestId('run-type-distance').tap();
    await page.getByTestId('distance-custom').tap();
    await page.getByTestId('run-unit').getByRole('radio', { name: 'Kilometers' }).tap();
    await page.getByTestId('run-unit').getByRole('radio', { name: 'Miles' }).tap();
    await page.getByTestId('goal-done').tap();
    await expect(page.getByTestId('run-goal')).toContainText('5 mi');
    await page.reload();
    await expect(page.getByTestId('run-type-distance')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('run-goal')).toContainText('5 mi');
    // The other goal was kept too, and the unit is the profile's (Settings shows it).
    await page.getByTestId('run-type-time').tap();
    await expect(page.getByTestId('time-20')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('time-20').tap();
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
    await page.goto('./#/run');
    await page.getByTestId('run-type-distance').tap();
    await expect(page.getByTestId('run-unit').getByRole('radio', { name: 'Miles' })).toHaveAttribute('aria-checked', 'true');
  });

  test('Start: 3, 2, 1 fills the screen, lands on the live run; an empty run ended and discarded leaves nothing @matrix', async ({ page }) => {
    await openRun(page);
    await page.getByTestId('run-type-distance').tap();
    await page.getByTestId('distance-5-km').tap();
    const start = page.getByTestId('run-start');
    // A double tap starts one countdown.
    await start.tap();
    await start.tap({ force: true, timeout: 500 }).catch(() => {});
    const count = page.getByTestId('run-countdown');
    await expect(count).toHaveCount(1);
    const timer = page.getByRole('timer');
    await expect(timer).toHaveAttribute('aria-label', 'Starting in 3');
    const box = await count.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.width).toBe(vp.width);
    expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
    await shot(page, 'countdown');
    await expect(timer).toHaveAttribute('aria-label', 'Starting in 2', { timeout: 2000 });
    await expect(timer).toHaveAttribute('aria-label', 'Starting in 1', { timeout: 2000 });
    // PLAN 4.4a: a clear GO beat before the live screen.
    await expect(timer).toHaveAttribute('aria-label', 'Go', { timeout: 2000 });
    const live = page.getByTestId('live-run');
    await expect(live).toBeVisible({ timeout: 2000 });
    await expect(count).toHaveCount(0);
    await expect(page.getByTestId('live-goal')).toContainText('Goal 5 km');
    await expect.poll(() => runRows(page), { message: 'the run exists from its first moment (4.3)' }).toBe(1);
    await shot(page, 'run-started');
    await endAndDiscard(page);
    expect(await runRows(page), 'a discarded run leaves no row').toBe(0);
  });

  test('Cancel during the countdown goes back; reduced motion still counts down', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRun(page);
    await page.getByTestId('run-start').tap();
    await expect(page.getByRole('timer')).toHaveAttribute('aria-label', 'Starting in 3');
    await page.getByTestId('run-count-cancel').tap();
    await expect(page.getByTestId('run-countdown')).toHaveCount(0);
    await page.waitForTimeout(3300);
    await expect(page.getByTestId('live-run')).toHaveCount(0);
    await expectCountdownThenStop(page);
    expect(await runRows(page)).toBe(0);
  });

  test('GPS allowed: the chip goes from asking to ready, weak says how weak, the dot shows, Start works in every state @matrix', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...PARK, accuracy: 8 });
    await openRun(page);
    const chip = page.getByTestId('gps-chip');
    await useLocation(page);
    await expect(chip).toHaveAttribute('data-status', 'good');
    await expect(chip).toContainText('GPS ready');
    await expect(page.getByTestId('run-dot')).toBeVisible();
    await expectDotCentred(page);
    await shot(page, 'gps-ready');
    await expectCountdownThenStop(page);

    await context.setGeolocation({ ...PARK, accuracy: 80 });
    await expect(chip).toHaveAttribute('data-status', 'weak');
    await expect(chip).toContainText(/GPS weak · about (80 m|260 ft)/);
    await chip.tap();
    await expect(page.getByTestId('gps-sheet')).toContainText('You can start now');
    await page.getByTestId('gps-sheet').getByRole('button', { name: 'Done' }).tap();
    await expect(page.getByTestId('gps-sheet')).toBeHidden();
    await expectCountdownThenStop(page);
    await checkLayout(page, { primary: page.getByTestId('run-start') });
  });

  test('GPS not allowed: Start works before asking and after "no"; the chip says how to turn it on @matrix', async ({ page }) => {
    await openRun(page);
    const chip = page.getByTestId('gps-chip');
    // Nothing is asked on arrival, no dot is invented, and Start is not waiting for anything.
    await expect(chip).toHaveAttribute('data-status', /ask|denied/);
    await expect(page.getByTestId('run-dot')).toHaveCount(0);
    await expect(page.getByTestId('run-start')).toBeEnabled();
    await expectCountdownThenStop(page);

    await useLocation(page);
    await expect(chip).toHaveAttribute('data-status', 'denied');
    await expect(chip).toContainText('Location is off');
    await expect(page.getByTestId('run-dot')).toHaveCount(0);
    await chip.tap();
    const sheet = page.getByTestId('gps-sheet');
    await expect(sheet.getByRole('listitem').first()).toBeVisible();
    await expect(sheet).toContainText('You can still start a run.');
    await expect(sheet.getByTestId('gps-retry')).toBeVisible();
    await checkControls(page);
    await shot(page, 'gps-denied-sheet');
    await sheet.getByTestId('gps-retry').tap();
    await expect(sheet).toBeHidden();
    await expect(chip).toHaveAttribute('data-status', 'denied');
    await shot(page, 'gps-denied');
    await expectCountdownThenStop(page);
    await checkControls(page);
  });

  test('tiles blocked: a plain dark map with a "Map offline" chip, never an error, never white @matrix', async ({ page }) => {
    await openRun(page);
    await expect(page.getByTestId('map-offline')).toBeVisible();
    await expect(page.getByTestId('map-offline')).toHaveText('Map offline');
    await expect(page.getByTestId('map-credit')).toBeVisible();
    // The map area is the app's own dark, whatever MapLibre managed to draw.
    const dark = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const probe = document.createElement('i');
      probe.style.color = bg;
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      const gl = document.querySelector('[data-testid="run-map-gl"]');
      return { want, got: gl ? getComputedStyle(gl).backgroundColor : null };
    });
    expect(dark.got).toBe(dark.want);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectCountdownThenStop(page);
    await checkLayout(page, { primary: page.getByTestId('run-start') });
    await shot(page, 'map-offline');
  });

  test('130% text: nothing is cut or pushed off the side, Start can still be reached', async ({ page }) => {
    await openRun(page);
    await page.getByTestId('run-type-intervals').tap();
    await page.getByTestId('interval-speed').tap();
    await page.evaluate(() => {
      const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
        const s = getComputedStyle(el);
        return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
      });
      for (const { el, size, line } of sizes) {
        el.style.fontSize = `${size * 1.3}px`;
        if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
      }
    });
    await page.waitForTimeout(200);
    const cut = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid="run-screen"] button, [data-testid="run-screen"] a, [data-testid="run-screen"] h1, [data-testid="run-goal"] span, [data-testid="map-credit"]')) {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`${el.textContent}: off the side`);
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`${el.textContent}: cut`);
        const label = el.querySelector<HTMLElement>('span');
        if (label && label.scrollWidth > label.clientWidth + 1 && getComputedStyle(label).overflow !== 'visible') out.push(`${el.textContent}: label cut`);
      }
      return out;
    });
    expect(cut).toEqual([]);
    const [h1, gym] = await Promise.all([page.getByRole('heading', { level: 1 }).boundingBox(), page.getByTestId('gym-pill').boundingBox()]);
    expect(h1!.x + h1!.width, 'the gym pill never sits over the title').toBeLessThanOrEqual(gym!.x + 4);
    const start = page.getByTestId('run-start');
    await start.scrollIntoViewIfNeeded();
    await shot(page, 'text-130');
    await expectCountdownThenStop(page);
  });

  test('only the Run tab asks the tile host, and MapLibre loads only there', async ({ page }) => {
    const outside: string[] = [];
    let own = '';
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return;
      own ||= u.origin;
      if (u.origin !== own) outside.push(r.url());
    });
    const mapFiles = () => page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /RunMapGl|maplibre/i.test(n)).length);
    for (const [hash, title] of [['', 'Today'], ['history', 'History'], ['plans', 'Plan'], ['settings', 'You']] as const) {
      await page.goto(`./#/${hash}`);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await page.waitForTimeout(400);
      expect(await tileAsks(page), `${title} asks the tile host for nothing`).toEqual([]);
      expect(await mapFiles(), `${title} does not load MapLibre`).toBe(0);
    }
    expect(outside).toEqual([]);
    await page.goto('about:blank');
    await page.goto('./#/run');
    await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('map-offline')).toBeVisible();
    expect(await mapFiles()).toBeGreaterThan(0);
    const asks = await tileAsks(page);
    expect(asks.length).toBeGreaterThan(0);
    for (const u of [...asks, ...outside]) expect(new URL(u).origin, u).toBe(TILE_ORIGIN);
  });
});

test.describe('4.2 run map with tiles answered', () => {
  // MapLibre fetches tiles from its web worker; with the service worker blocked every one of them
  // goes through the route stub (tests/helpers/tiles.ts).
  test.use({ serviceWorkers: 'block' });

  test('the map loads: no offline chip, the dot on it, and every outside request goes to the tile host @matrix', async ({ page, context }) => {
    const outside: string[] = [];
    let own = '';
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return;
      own ||= u.origin;
      if (u.origin !== own) outside.push(r.url());
    });
    const tiles = await stubTiles(page);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...PARK, accuracy: 8 });
    await openRun(page);
    await useLocation(page);
    await expect(page.getByTestId('run-dot')).toBeVisible();
    await expectDotCentred(page);
    await expect.poll(() => tiles.asked.some((u) => u.endsWith('.pbf')), { message: 'tiles were asked for' }).toBe(true);
    await expect(page.getByTestId('map-offline')).toHaveCount(0);
    await expect(page.getByTestId('map-credit')).toBeVisible();
    await expect(page.locator('[data-testid="run-map-gl"] canvas')).toBeVisible();
    expect(tiles.asked.some((u) => new URL(u).pathname === '/planet')).toBe(true);
    expect(outside.length).toBeGreaterThan(0);
    for (const u of outside) expect(new URL(u).origin, u).toBe(TILE_ORIGIN);

    // Dragging the map away brings the recentre button; it puts the dot back in the middle.
    const map = (await page.getByTestId('run-map-gl').boundingBox())!;
    const chip = (await page.getByTestId('gps-chip').boundingBox())!;
    const y = chip.y + chip.height + 30;
    await page.mouse.move(map.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(map.width / 2 + 60, y + 10, { steps: 6 });
    await page.mouse.up();
    const recentre = page.getByTestId('run-recentre');
    await expect(recentre).toBeVisible();
    await checkControls(page);
    expect(Math.abs((await dotOffCentre(page)).dx), 'the drag moved the dot off centre').toBeGreaterThan(30);
    await recentre.tap();
    await expect(recentre).toHaveCount(0);
    await expectDotCentred(page);
    await shot(page, 'map-stub');
  });
});
