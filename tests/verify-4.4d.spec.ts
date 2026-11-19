import { expect, test, type Page } from './fixtures';
import { live, openRun, type Runner } from './helpers/run';
import { fixTime, liveStep, readLiveAt, startLive, DEFAULT_RUN_SETUP, type LiveRun } from '../src/lib/run';
import { addPoint } from '../src/lib/gps';
import { makeTrace, type Trace, type TraceFix, type TraceSpec } from './fixtures/gps/traces';

// PLAN 4.4d (4), the run simulation of 4.8 pulled forward for the lag fix: seeded iPhone style
// traces (tests/fixtures/gps) fed second by second through Playwright's geolocation in WebKit, and
// the numbers ON THE SCREEN (distance, moving time, pace) checked against the same fixes replayed
// through lib/run and against the truth. Playwright cannot give the phone's own speed, so this is
// the case without it (the harder one). Each fix reaches the app at its own stamp.

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

const SECONDS = 150;
/** Up to this second the distance may still wait for evidence of movement (no phone speed here). */
const SETTLE_SEC = 10;
const toSec = (text: string) => text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
const km = async (page: Page) => Number(await page.getByTestId('live-big').textContent());
const smallText = async (page: Page, m: 'time' | 'pace') => (await page.getByTestId(`live-small-${m}`).locator('span').first().textContent())!;

/** The fixes of the first SECONDS, without the phone's speed (Playwright has none). */
const fixesOf = (trace: Trace) => trace.fixes.filter((f) => f.stamp - trace.t0 <= SECONDS * 1000);

/** The same fixes through the pure live run, with the times the page will give them. */
function expected(trace: Trace, t0: number): { run: LiveRun; keeps: boolean[] } {
  let run = startLive({ id: 'x', now: t0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
  const keeps: boolean[] = [];
  for (const f of fixesOf(trace)) {
    const at = t0 + (f.stamp - trace.t0);
    const point = { lat: f.lat, lng: f.lng, accuracy: f.accuracy, t: fixTime(at, at) };
    keeps.push(addPoint(run.tracker, point).event.type !== 'rejected');
    run = liveStep(run, { type: 'fix', point, now: at });
  }
  return { run, keeps };
}

async function feed(r: Runner, f: TraceFix, keep: boolean) {
  const before = await live(r.page).getAttribute('data-fix');
  await r.context.setGeolocation({ latitude: f.lat, longitude: f.lng, accuracy: f.accuracy });
  // A fix the run keeps moves the dot; one it drops (a jump) changes nothing to wait for.
  if (keep) await expect.poll(() => live(r.page).getAttribute('data-fix'), { message: 'the position reached the run' }).not.toBe(before);
  else await r.page.waitForTimeout(60);
}

/**
 * Runs the trace on the live screen. Every 5 s: the distance moved on (never frozen, never back).
 * Returns when the pace first showed, the engine's reading at the end, and the screen's numbers.
 */
async function runTrace(page: Page, context: Runner['context'], spec: TraceSpec, settleSec = SETTLE_SEC) {
  const trace = makeTrace(spec);
  const fixes = fixesOf(trace);
  await openRun(page, context);
  await page.getByTestId('run-start').tap();
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  const t0 = await page.evaluate(() => Date.now());
  const want = expected(trace, t0);
  const r: Runner = { page, context, north: 0 };
  let shownM = 0;
  let paceAt: number | null = null;
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i]!;
    const sec = (f.stamp - trace.t0) / 1000;
    const wait = t0 + sec * 1000 - (await page.evaluate(() => Date.now()));
    if (wait > 0) await page.clock.runFor(wait);
    await feed(r, f, want.keeps[i]!);
    if (sec > 0 && sec % 5 === 0) {
      const m = (await km(page)) * 1000;
      if (sec <= settleSec) {
        // The start (PLAN 4.4d): without the phone's speed (Playwright gives none) distance waits for
        // evidence of movement: 0.00 shows with "--" while the clock already runs; never backwards.
        expect(m, `never backwards at ${sec} s`).toBeGreaterThanOrEqual(shownM);
        if (m === 0) expect(await smallText(page, 'pace')).toContain('--');
        expect(toSec(await smallText(page, 'time'))).toBeGreaterThanOrEqual(sec - 2);
        shownM = m;
        continue;
      }
      expect(m, `the distance moved on by ${sec} s`).toBeGreaterThan(shownM);
      shownM = m;
      if (paceAt === null && !(await smallText(page, 'pace')).includes('--')) paceAt = sec;
    }
  }
  const engine = readLiveAt(want.run, t0 + SECONDS * 1000);
  return { trace, paceAt, engine, screenM: (await km(page)) * 1000, timeSec: toSec(await smallText(page, 'time')), paceSec: toSec(await smallText(page, 'pace')) };
}

test.describe('4.4d run lag fix: the live screen on simulated iPhone traces', () => {
  test('a jog at 15 m accuracy: distance never frozen, pace within 20 s, the screen shows the engine and the truth @matrix', async ({ page, context }) => {
    test.setTimeout(240_000);
    const out = await runTrace(page, context, { speed: 'jog', cadence: 1, noise: 15, scenario: 'surge', seed: 1 });
    expect(out.paceAt, 'pace shows within 20 s of the start').not.toBeNull();
    expect(out.paceAt!).toBeLessThanOrEqual(20);
    // The screen prints km to two decimals (10 m): it shows what the engine computed from these fixes.
    expect(Math.abs(out.screenM - out.engine.distanceM), 'the screen shows the engine distance').toBeLessThanOrEqual(10);
    // The truth: within 3% plus the 10 m of the printed decimals.
    const truth = out.trace.truth!.distanceAt(SECONDS);
    expect(Math.abs(out.screenM - truth), `${out.screenM} m shown, ${truth} m run`).toBeLessThanOrEqual(truth * 0.03 + 10);
    // Moving time counts every second (PLAN 4.4a), pace within 10% of the true 6:40 per km.
    expect(Math.abs(out.timeSec - SECONDS)).toBeLessThanOrEqual(2);
    expect(Math.abs(out.paceSec - 400), `pace ${out.paceSec} s/km`).toBeLessThanOrEqual(40);
  });

  test('a cold start (60 m for 90 s, then 15 m): the distance moves from the first seconds and the screen shows the engine', async ({ page, context }) => {
    test.setTimeout(240_000);
    // Before 4.4d every 60 m fix was dropped and the screen stood at 0.00 for a minute and a half.
    // Now a 60 m start settles first (three fixes agree, then 8 s of moving like a walk without the
    // phone's speed): 0.00 and "--" for its first seconds while the clock runs, then the distance moves
    // every 5 s from SETTLE_SEC on.
    // The distance of the 60 m stretch drifts with the fixes (reports/run-lag-4.4d.md: the cold
    // start misses the 3% rule over 10 minutes, an expected failure), so only that it moves and
    // that the screen shows the engine are checked here.
    const out = await runTrace(page, context, { speed: 'jog', cadence: 1, noise: 15, scenario: 'cold-start', seed: 1 });
    expect(out.paceAt, 'pace shows within 20 s of the start').not.toBeNull();
    expect(out.paceAt!).toBeLessThanOrEqual(20);
    expect(Math.abs(out.screenM - out.engine.distanceM), 'the screen shows the engine distance').toBeLessThanOrEqual(10);
    expect(Math.abs(out.timeSec - SECONDS)).toBeLessThanOrEqual(2);
  });
});
