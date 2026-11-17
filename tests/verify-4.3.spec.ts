import { mkdirSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
import { holdFor, pocketSeen } from './helpers/run';
import { stubTiles } from './helpers/tiles';

// PLAN 4.3 (SPEC 12.2): the live run screen. The phone's position is Playwright's (grantPermissions
// and setGeolocation), stepped along a straight synthetic route north from PARK; the clock is
// page.clock, moved by hand between positions. Tolerances: distance within 1% of the route (plus
// the two decimal cut of the display), moving time within 3 s of the stepped time, pace within
// 15 s per km of the true 5:33 (3 m/s). Tiles never come from the real host (fixtures.ts), except
// in the one screenshot test that runs only with SHOTS_43_REAL=1.

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

const SHOTS = process.env.SHOTS_43;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

const PARK = { latitude: 40.7812, longitude: -73.9665 };
/** Meters per degree of latitude (the same earth radius as lib/gps). */
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const T0 = new Date('2026-06-01T08:00:00Z');
const SPEED = 3;

type Runner = { page: Page; context: BrowserContext; north: number };
const live = (page: Page) => page.getByTestId('live-run');

/** Reports one position `north` meters up the route and waits until the run has taken it. */
async function fix(r: Runner, accuracy = 5) {
  const before = await live(r.page).getAttribute('data-fix');
  await r.context.setGeolocation({ latitude: PARK.latitude + r.north / M_PER_DEG, longitude: PARK.longitude, accuracy });
  await expect.poll(() => live(r.page).getAttribute('data-fix'), { message: 'the position reached the run' }).not.toBe(before);
}
/** `steps` positions, `stepSec` apart on the clock, at 3 m/s (or standing with speed 0). */
async function move(r: Runner, steps: number, stepSec = 5, speed = SPEED) {
  for (let i = 0; i < steps; i++) {
    await r.page.clock.runFor(stepSec * 1000);
    r.north += speed * stepSec;
    await fix(r);
  }
}
/** The clock moved the screen into pocket mode: one tap wakes it. */
async function wake(page: Page) {
  if ((await live(page).getAttribute('data-dim')) === 'lit') return;
  await page.getByTestId('live-dim').tap({ force: true });
  await expect(live(page)).toHaveAttribute('data-dim', 'lit');
}

async function openRun(page: Page, context: BrowserContext, opts: { pocket?: boolean; wake?: 'stub' | 'none' } = {}) {
  await simulateSafeAreas(page);
  if (!opts.pocket) await pocketSeen(page);
  await page.addInitScript((mode) => {
    const w = window as unknown as { __wakeAsks: number };
    w.__wakeAsks = 0;
    const lock = mode === 'none' ? undefined : { request: () => (w.__wakeAsks++, Promise.resolve({ released: false, release: () => Promise.resolve(), addEventListener: () => undefined })) };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: lock });
  }, opts.wake ?? 'stub');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...PARK, accuracy: 5 });
  await page.clock.install({ time: T0 });
  await page.goto('./#/run');
  await expect(page.getByRole('heading', { level: 1, name: 'Run With Me' })).toBeVisible();
}

/** The mocked phone reports only when its position is set: set it (again) so the new watch hears it. */
async function firstFix(page: Page, context: BrowserContext) {
  await expect(async () => {
    await context.setGeolocation({ ...PARK, accuracy: 5 });
    await expect(live(page)).not.toHaveAttribute('data-fix', '', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

async function startRun(page: Page, context: BrowserContext, opts: Parameters<typeof openRun>[2] = {}): Promise<Runner> {
  await openRun(page, context, opts);
  await page.getByTestId('run-start').tap();
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  return { page, context, north: 0 };
}

type Row = { id: string; endedAt?: number; distanceM: number; movingSec: number; elapsedSec: number; points: number[][]; gaps: number[][]; splits: number[]; type: string; goal?: string };
const runRows = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Row[]>((resolve, reject) => {
        const open = indexedDB.open('anygym');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('runs').objectStore('runs').getAll();
          all.onsuccess = () => (open.result.close(), resolve(all.result as Row[]));
          all.onerror = () => reject(all.error);
        };
      }),
  );

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const toSec = (text: string) => text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
const big = (page: Page) => page.getByTestId('live-big');
const swipe = async (page: Page, from: [number, number], to: [number, number]) => {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6);
  await page.mouse.up();
};

test.describe('4.3 live run', () => {
  test('a run through the countdown: the numbers move and are right, a tap cycles the big number @matrix', async ({ page, context }) => {
    const r = await startRun(page, context);
    await expect(page.getByTestId('run-countdown')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __wakeAsks: number }).__wakeAsks), 'the screen wake lock was asked for').toBeGreaterThanOrEqual(1);
    await expect(live(page)).toHaveAttribute('data-wake', 'on');
    // No pace is claimed before the run has moved.
    await expect(page.getByTestId('live-small-pace')).toContainText('--');
    await expect(big(page)).toHaveText('0.00');
    await shot(page, 'stats-start');

    await move(r, 40); // 600 m in 200 s
    await expect(live(page)).toHaveAttribute('data-status', 'running');
    await expect(page.getByTestId('live-note')).toBeEmpty();
    const km = Number(await big(page).textContent());
    expect(km, 'distance within 1% of 600 m').toBeGreaterThanOrEqual(0.59);
    expect(km).toBeLessThanOrEqual(0.61);
    await expect(page.getByTestId('live-big-label')).toHaveText('Kilometers');
    const t = toSec((await page.getByTestId('live-small-time').locator('span').first().textContent())!);
    expect(t, 'moving time within 3 s of 200 s').toBeGreaterThanOrEqual(200);
    expect(t).toBeLessThanOrEqual(203);
    const pace = toSec((await page.getByTestId('live-small-pace').locator('span').first().textContent())!);
    expect(Math.abs(pace - 333), 'pace within 15 s of 5:33 per km').toBeLessThanOrEqual(15);
    await wake(page);
    await checkLayout(page, { scope: '[data-testid="live-run"]' });
    await shot(page, 'stats-distance');

    // Tap: distance, time, pace, distance.
    await page.getByTestId('live-cycle').tap();
    await expect(big(page)).toHaveAttribute('data-metric', 'time');
    await expect(page.getByTestId('live-small-distance')).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, 'stats-time');
    await page.getByTestId('live-cycle').tap();
    await expect(big(page)).toHaveAttribute('data-metric', 'pace');
    await expect(page.getByTestId('live-big-label')).toHaveText('Pace /km');
    await page.waitForTimeout(400);
    await shot(page, 'stats-pace');
    await page.getByTestId('live-cycle').tap();
    await expect(big(page)).toHaveAttribute('data-metric', 'distance');

    // The giant number is big, and never wider than the screen.
    const box = (await big(page).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.height).toBeGreaterThanOrEqual(vp.width * 0.22);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    // The controls clear the home indicator and are large.
    for (const id of ['live-lock', 'live-pause', 'live-end']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.width, `${id} at least 60 pt`).toBeGreaterThanOrEqual(60);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height - 12);
    }
    expect((await page.getByTestId('live-pause').boundingBox())!.width).toBeGreaterThanOrEqual(84);
  });

  test('swipe to the map page and back; the route draws, a gap is dashed, pan then recentre @matrix', async ({ page, context }) => {
    await stubTiles(page);
    const r = await startRun(page, context);
    await move(r, 12);
    await wake(page);
    const vp = page.viewportSize()!;
    const midY = vp.height * 0.45;
    await swipe(page, [vp.width * 0.8, midY], [vp.width * 0.2, midY]);
    await expect(live(page)).toHaveAttribute('data-page', '1');
    const map = page.getByTestId('live-map');
    await expect(map).toHaveAttribute('data-solid', '1');
    await expect(map).toHaveAttribute('data-dashed', '0');
    await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('map-offline')).toHaveCount(0);
    await expect(page.getByTestId('run-dot')).toBeVisible();
    await expect(page.getByTestId('run-start-mark')).toBeVisible();
    await expect(page.getByTestId('live-map-readout')).toContainText('km');

    // 40 s with no position, then on: a gap. Its join is dashed, never a solid line.
    await page.clock.runFor(40_000);
    r.north += 100;
    await fix(r);
    await move(r, 6);
    await expect(map).toHaveAttribute('data-dashed', '1');
    await expect(map).toHaveAttribute('data-solid', '2');
    await wake(page);
    await shot(page, 'map-route-gap');

    // A drag on the map moves the map (not the page); then the recentre button brings it back.
    await expect(page.getByTestId('live-recentre')).toHaveCount(0);
    await swipe(page, [vp.width * 0.6, midY], [vp.width * 0.3, midY + 60]);
    await expect(live(page)).toHaveAttribute('data-page', '1');
    await expect(page.getByTestId('live-recentre')).toBeVisible();
    await page.getByTestId('live-recentre').tap();
    await expect(page.getByTestId('live-recentre')).toHaveCount(0);

    // Back: a swipe from the left edge, or the dots.
    await swipe(page, [6, midY], [vp.width * 0.6, midY]);
    await expect(live(page)).toHaveAttribute('data-page', '0');
    await page.getByTestId('live-dot-1').tap();
    await expect(live(page)).toHaveAttribute('data-page', '1');
    await page.getByTestId('live-dot-0').tap();
    await expect(live(page)).toHaveAttribute('data-page', '0');
    await expect(big(page)).toBeVisible();
  });

  test('tiles failing: the route still draws on plain dark with the Map offline chip', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 8);
    await wake(page);
    await page.getByTestId('live-dot-1').tap();
    await expect(page.getByTestId('map-offline')).toBeVisible();
    await expect(page.getByTestId('live-map')).toHaveAttribute('data-solid', '1');
    await expect(page.getByTestId('run-dot')).toBeVisible();
    await shot(page, 'map-offline');
  });

  test('pause and resume by hand; auto pause when the position stops, and it looks different @matrix', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 10);
    await wake(page);
    await page.getByTestId('live-pause').tap();
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
    await expect(page.getByTestId('live-note')).toHaveText('Paused');
    await expect(page.getByTestId('live-note')).toHaveAttribute('data-tone', 'paused');
    await expect(page.getByTestId('live-resume')).toBeVisible();
    await expect(page.getByTestId('live-end')).toBeVisible();
    const paused = await big(page).textContent();
    await move(r, 4); // moving while paused adds nothing
    await expect(big(page)).toHaveText(paused!);
    await shot(page, 'paused');
    await page.getByTestId('live-resume').tap();
    await expect(live(page)).not.toHaveAttribute('data-status', 'paused');
    await move(r, 6);
    await expect(live(page)).toHaveAttribute('data-status', 'running');
    expect(Number(await big(page).textContent())).toBeGreaterThan(Number(paused));

    // Standing for 12 s: auto pause. The pause button stays a pause button; the note is amber.
    await move(r, 12, 1, 0);
    await expect(live(page)).toHaveAttribute('data-status', 'auto-paused');
    await expect(page.getByTestId('live-note')).toHaveText('Auto paused · move to go on');
    await expect(page.getByTestId('live-note')).toHaveAttribute('data-tone', 'auto');
    await expect(page.getByTestId('live-pause')).toBeVisible();
    const still = toSec((await page.getByTestId('live-small-time').locator('span').first().textContent())!);
    await move(r, 5, 1, 0);
    expect(toSec((await page.getByTestId('live-small-time').locator('span').first().textContent())!), 'the clock stands while auto paused').toBe(still);
    await wake(page);
    await shot(page, 'auto-paused');
    await move(r, 4);
    await expect(live(page)).toHaveAttribute('data-status', 'running');

    // A pause by hand is never undone by moving.
    await wake(page);
    await page.getByTestId('live-pause').tap();
    await move(r, 4);
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
  });

  test('auto pause can be switched off in run settings, from the paused run and from the start screen', async ({ page, context }) => {
    await openRun(page, context);
    // The start screen: the switch is on by default (SPEC 12.3).
    await page.getByTestId('run-settings').tap();
    const toggle = page.getByRole('switch', { name: /Auto pause/ });
    await expect(toggle).toBeChecked();
    await page.getByTestId('run-settings-done').tap();
    await expect(page.getByTestId('run-settings-sheet')).toBeHidden();
    await page.getByTestId('run-start').tap();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await firstFix(page, context);
    const r: Runner = { page, context, north: 0 };
    // Run settings are reachable while paused; the switch acts on the run that is going on.
    await expect(page.getByTestId('live-settings')).toHaveCount(0);
    await page.getByTestId('live-pause').tap();
    await page.getByTestId('live-settings').tap();
    await expect(toggle).toBeChecked();
    await page.getByText('Auto pause', { exact: true }).tap();
    await expect(toggle).not.toBeChecked();
    await page.getByTestId('run-settings-done').tap();
    await expect(page.getByTestId('run-settings-sheet')).toBeHidden();
    await page.getByTestId('live-resume').tap();
    await move(r, 6);
    await move(r, 12, 1, 0);
    await expect(live(page)).toHaveAttribute('data-status', 'running');
    await expect(page.getByTestId('live-note')).toBeEmpty();
  });

  test('lock blocks every tap; only the one second hold unlocks @matrix', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 4);
    await wake(page);
    const pauseAt = (await page.getByTestId('live-pause').boundingBox())!;
    await page.getByTestId('live-lock').tap();
    await expect(live(page)).toHaveAttribute('data-locked', 'true');
    await expect(page.getByTestId('live-unlock')).toBeVisible();
    await expect(page.getByText('Hold to unlock')).toBeVisible();
    for (const id of ['live-pause', 'live-end', 'live-lock', 'live-hide']) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByTestId('live-cycle')).toBeDisabled();
    await expect(page.getByTestId('live-dot-1')).toBeDisabled();
    // Taps where the controls were, on the numbers, and a swipe: nothing happens.
    await page.touchscreen.tap(pauseAt.x + pauseAt.width / 2, pauseAt.y + pauseAt.height / 2);
    const vp = page.viewportSize()!;
    await page.touchscreen.tap(vp.width / 2, vp.height * 0.4);
    await swipe(page, [vp.width * 0.8, vp.height * 0.4], [vp.width * 0.2, vp.height * 0.4]);
    await expect(live(page)).toHaveAttribute('data-page', '0');
    await expect(big(page)).toHaveAttribute('data-metric', 'distance');
    await expect(live(page)).not.toHaveAttribute('data-status', 'paused');
    await shot(page, 'locked');
    // A short press does not unlock.
    await page.getByTestId('live-unlock').tap();
    await holdFor(page, page.getByTestId('live-unlock'), 450);
    await expect(live(page)).toHaveAttribute('data-locked', 'true');
    await holdFor(page, page.getByTestId('live-unlock'), 1250);
    await expect(live(page)).not.toHaveAttribute('data-locked', 'true');
    await expect(page.getByTestId('live-pause')).toBeVisible();
  });

  test('hold to End: under a second cancels, a second ends; the summary equals the run row; updates wait for the end @matrix', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 30);
    await page.clock.runFor(40_000); // a gap
    r.north += 90;
    await fix(r);
    await move(r, 44);
    await wake(page);
    // While the run goes on its row has no end: exactly what src/pwa.ts reads to hold an app update back.
    const during = await runRows(page);
    expect(during).toHaveLength(1);
    expect(during[0]!.endedAt).toBeUndefined();

    const end = page.getByTestId('live-end');
    await end.tap();
    await expect(live(page)).toBeVisible();
    // Half way: the ring is filling. Then the finger lifts: nothing ends.
    const b = (await end.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    expect(Number(await end.getAttribute('data-fraction'))).toBeGreaterThan(0.25);
    expect(Number(await end.getAttribute('data-fraction'))).toBeLessThan(1);
    await shot(page, 'hold-ring');
    await page.mouse.up();
    await expect(end).toHaveAttribute('data-fraction', '0.00');
    await page.waitForTimeout(900);
    await expect(live(page)).toBeVisible();
    await expect(page.getByTestId('run-summary')).toHaveCount(0);
    // Sliding off cancels too.
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y - 120, { steps: 3 });
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await expect(live(page)).toBeVisible();

    await holdFor(page, end, 1250);
    const summary = page.getByTestId('run-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toHaveAttribute('data-verdict', 'ok');
    await expect(live(page)).toHaveCount(0);
    const [row] = await runRows(page);
    expect(row!.endedAt, 'the run has its end: updates may apply again').toBeGreaterThan(0);
    expect(row!.distanceM, 'distance within 1% of the 1200 m route').toBeGreaterThan(1188);
    expect(row!.distanceM).toBeLessThan(1212);
    expect(row!.gaps).toHaveLength(1);
    expect(row!.splits).toHaveLength(1);
    expect(row!.points.length).toBe(76);
    expect(row!.elapsedSec).toBeGreaterThan(row!.movingSec + 39);
    await expect(page.getByTestId('summary-distance')).toHaveText((Math.floor(row!.distanceM / 10 + 1e-7) / 100).toFixed(2));
    await expect(page.getByTestId('summary-time')).toHaveText(clock(row!.movingSec));
    await expect(page.getByTestId('summary-splits').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('summary-splits')).toContainText(clock(row!.splits[0]!));
    const pace = toSec((await page.getByTestId('summary-pace').textContent())!);
    expect(Math.abs(pace - 333)).toBeLessThanOrEqual(10);
    await expect(page.getByTestId('summary-map')).toHaveAttribute('data-dashed', '1');
    await expect(page.getByTestId('summary-map')).toHaveAttribute('data-solid', '2');
    await checkLayout(page, { scope: '[data-testid="run-summary"]', primary: page.getByTestId('summary-done') });
    await shot(page, 'summary');
    await page.getByTestId('summary-done').tap();
    await expect(summary).toBeHidden();
    await expect(page.getByTestId('run-start')).toBeVisible();
    expect(await runRows(page)).toHaveLength(1);
  });

  test('a run with no distance says so: Discard removes it, Keep keeps it', async ({ page, context }) => {
    await startRun(page, context);
    await holdFor(page, page.getByTestId('live-end'), 1250);
    await expect(page.getByTestId('summary-plain')).toHaveText('Too short to measure');
    await expect(page.getByTestId('summary-distance')).toHaveCount(0);
    await shot(page, 'summary-too-short');
    await page.getByTestId('summary-keep').tap();
    await expect(page.getByTestId('run-start')).toBeVisible();
    expect(await runRows(page)).toHaveLength(1);
    await page.getByTestId('run-start').tap();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await holdFor(page, page.getByTestId('live-end'), 1250);
    await page.getByTestId('summary-discard').tap();
    await expect(page.getByTestId('run-start')).toBeVisible();
    expect(await runRows(page)).toHaveLength(1);
  });

  test('a reload mid run comes straight back, paused, and the time away is a gap @matrix', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 20);
    const before = await big(page).textContent();
    await page.clock.runFor(6000); // the periodic save
    await expect.poll(async () => (await runRows(page))[0]?.points.length).toBe(21);
    await page.goto('./#/history');
    await page.reload();
    // Whatever screen the app opens on, the run is back in front.
    await expect(live(page)).toBeVisible();
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
    await expect(page.getByTestId('live-note')).toHaveText('Paused while the app was closed');
    await expect(big(page)).toHaveText(before!);
    await shot(page, 'resumed-after-close');
    await page.clock.runFor(120_000);
    r.north += 300;
    await page.getByTestId('live-resume').tap();
    await expect(page.getByTestId('live-note')).not.toHaveText('Paused while the app was closed');
    await move(r, 5);
    await wake(page);
    // The first position after Resume starts a new piece of line: 4 legs of 15 m were added, not 300 m.
    const km = Number(await big(page).textContent());
    expect(km).toBeGreaterThanOrEqual(Number(before) + 0.05);
    expect(km).toBeLessThanOrEqual(Number(before) + 0.07);
    await page.getByTestId('live-dot-1').tap();
    await expect(page.getByTestId('live-map')).toHaveAttribute('data-dashed', '1');
    await page.getByTestId('live-dot-0').tap();
    await holdFor(page, page.getByTestId('live-end'), 1250);
    await expect(page.getByTestId('run-summary')).toBeVisible();
    const rows = await runRows(page);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.gaps).toHaveLength(1);
    expect(rows[0]!.movingSec, 'the two minutes away are not moving time').toBeLessThan(130);
  });

  test('the run survives hiding it and switching tabs', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 6);
    await wake(page);
    await page.getByTestId('live-hide').tap();
    await expect(live(page)).toHaveCount(0);
    const going = page.getByTestId('run-going');
    await expect(going).toContainText('Run in progress');
    await expect(page.getByTestId('run-start')).toHaveCount(0);
    await shot(page, 'run-in-progress');
    // Positions keep counting while it is hidden.
    await page.clock.runFor(5000);
    await context.setGeolocation({ latitude: PARK.latitude + 105 / M_PER_DEG, longitude: PARK.longitude, accuracy: 5 });
    await expect(page.getByTestId('run-going-readout')).toContainText('0.10 km');
    // The card's own way back, then out again to another tab.
    await page.getByTestId('run-going-open').tap();
    await expect(live(page)).toBeVisible();
    await page.getByTestId('live-hide').tap();
    await page.getByRole('link', { name: 'History' }).tap();
    await expect(page.getByTestId('run-bar')).toContainText('Run in progress');
    // The bar goes straight back into the live run.
    await page.getByTestId('run-bar').tap();
    await expect(live(page)).toBeVisible();
    await expect(big(page)).toHaveText('0.10');
  });

  test('the pocket mode explainer shows once, before the first run', async ({ page, context }) => {
    await openRun(page, context, { pocket: true });
    await page.getByTestId('run-start').tap();
    const sheet = page.getByTestId('pocket-sheet');
    await expect(sheet).toContainText('Keep AnyGym open with the screen on.');
    await expect(sheet).toContainText('Your music keeps playing.');
    await expect(sheet).toContainText('Locking the phone pauses GPS.');
    await expect(page.getByTestId('run-countdown')).toHaveCount(0);
    await shot(page, 'explainer');
    await page.getByTestId('pocket-go').tap();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await holdFor(page, page.getByTestId('live-end'), 1250);
    await page.getByTestId('summary-discard').tap();
    await page.getByTestId('run-start').tap();
    await expect(page.getByTestId('run-countdown')).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await expect(live(page)).toBeVisible({ timeout: 8000 });
  });

  test('pocket mode: dim after 10 s with no touch; the waking tap presses nothing; a paused screen stays lit @matrix', async ({ page, context }) => {
    const r = await startRun(page, context);
    await move(r, 2, 4);
    await wake(page);
    // A touch (on the bare top of the numbers page) starts the 10 seconds again.
    await page.touchscreen.tap(page.viewportSize()!.width / 2, 130);
    await page.clock.runFor(9000);
    await expect(live(page)).toHaveAttribute('data-dim', 'lit');
    await page.clock.runFor(1500);
    await expect(live(page)).toHaveAttribute('data-dim', 'dim');
    await page.waitForTimeout(400);
    await shot(page, 'dimmed');
    // The tap lands right on Pause: it only wakes.
    const b = (await page.getByTestId('live-pause').boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect(live(page)).toHaveAttribute('data-dim', 'lit');
    await expect(live(page)).not.toHaveAttribute('data-status', 'paused');
    await expect(page.getByTestId('live-pause')).toBeVisible();
    // Now the same tap pauses, and a paused screen never dims.
    await page.getByTestId('live-pause').tap();
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
    await page.clock.runFor(30_000);
    await expect(live(page)).toHaveAttribute('data-dim', 'lit');
  });

  test('a phone that cannot keep its screen on: said once in plain words, and the run goes on', async ({ page, context }) => {
    const r = await startRun(page, context, { wake: 'none' });
    await expect(live(page)).toHaveAttribute('data-wake', 'missing');
    await expect(page.getByText('This phone will not keep the screen on by itself.')).toBeVisible();
    await move(r, 4);
    await expect(big(page)).toHaveText('0.06');
    await wake(page);
    await holdFor(page, page.getByTestId('live-end'), 1250);
    await page.getByTestId('summary-keep').or(page.getByTestId('summary-done')).tap();
    await page.getByTestId('run-start').tap();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(500);
    await expect(page.getByText('This phone will not keep the screen on by itself.')).toHaveCount(0);
  });

  test('130% text and reduced motion: nothing is cut, the big number still fits, pages still change', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const r = await startRun(page, context);
    await move(r, 10);
    await wake(page);
    await page.getByTestId('live-pause').tap();
    await page.evaluate(() => {
      const sizes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="live-run"] *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
      for (const { el, size } of sizes) el.style.fontSize = `${size * 1.3}px`;
    });
    await page.waitForTimeout(300);
    const vp = page.viewportSize()!;
    const cut = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      for (const id of ['live-big', 'live-note', 'live-small-time', 'live-small-pace', 'live-lock', 'live-resume', 'live-end', 'live-controls']) {
        const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`${id}: off the side`);
        if (r.bottom > innerHeight + 0.5 || r.top < 0) out.push(`${id}: off the screen`);
      }
      const note = document.querySelector('[data-testid="live-note"]')!.getBoundingClientRect();
      const bigTop = document.querySelector('[data-testid="live-big"]')!.getBoundingClientRect().top;
      if (note.bottom > bigTop + 1) out.push('the note sits on the number');
      const pair = document.querySelector('[data-testid="live-small-time"]')!.getBoundingClientRect();
      const controls = document.querySelector('[data-testid="live-controls"]')!.getBoundingClientRect();
      if (pair.bottom > controls.top + 1) out.push('the small numbers sit under the controls');
      return out;
    });
    expect(cut).toEqual([]);
    expect((await big(page).boundingBox())!.width).toBeLessThanOrEqual(vp.width);
    await shot(page, 'text-130');
    await page.getByTestId('live-dot-1').tap();
    await expect(live(page)).toHaveAttribute('data-page', '1');
    await page.getByTestId('live-dot-0').tap();
    await page.getByTestId('live-cycle').tap();
    await expect(big(page)).toHaveAttribute('data-metric', 'time');
  });

  test('real tiles, for the review screenshot only', async ({ page, context }) => {
    test.skip(!process.env.SHOTS_43_REAL, 'runs only for the screenshot pass');
    await page.addInitScript(() => {
      (window as unknown as { __pwTiles: string }).__pwTiles = 'pass';
    });
    await context.route('https://tiles.openfreemap.org/**', (route) => route.continue());
    const r = await startRun(page, context);
    await move(r, 30);
    await page.clock.runFor(40_000);
    r.north += 100;
    await fix(r);
    await move(r, 12);
    await wake(page);
    await page.getByTestId('live-dot-1').tap();
    await page.waitForTimeout(6000);
    await wake(page);
    await page.waitForTimeout(500);
    await shot(page, 'map-real-tiles');
  });
});

test.describe('4.3 live run, miles', () => {
  test.use({ locale: 'en-US' });

  test('a Distance run shows calm progress and says when the goal is reached; miles on a phone set to miles', async ({ page, context }) => {
    await openRun(page, context);
    // Half a mile, the smallest goal, saved the way the picker saves it.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('anygym');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction(['kv'], 'readwrite');
            tx.objectStore('kv').put({ key: 'anygym-run-setup', value: JSON.stringify({ type: 'distance', distance: { value: 0.5, unit: 'mi' }, timeMin: 30, interval: 'beginner', autoPause: true }), at: Date.now() });
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    // Leaving the tab and coming back reads the saved choice again.
    await page.getByRole('link', { name: 'History' }).tap();
    await page.getByRole('link', { name: 'Run', exact: true }).tap();
    await expect(page.getByTestId('run-goal')).toContainText('0.5 mi');
    await page.getByTestId('run-start').tap();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await firstFix(page, context);
    const r: Runner = { page, context, north: 0 };
    const goal = page.getByTestId('live-goal');
    await expect(goal).toContainText('Goal 0.5 mi');
    await move(r, 20);
    await expect(page.getByTestId('live-big-label')).toHaveText('Miles');
    await expect(page.getByTestId('live-goal-line')).toHaveText(/^0\.3[12] mi to go$/);
    await wake(page);
    await shot(page, 'goal-progress');
    await move(r, 34);
    await expect(page.getByTestId('live-goal-line')).toHaveText('Goal reached');
    await expect(goal).toHaveAttribute('data-reached', 'true');
    await wake(page);
    await shot(page, 'goal-reached');
  });
});
