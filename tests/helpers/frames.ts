// How fast this machine's browser can draw frames at all, so frame budgets mean the app's cost and
// not the host's (PLAN 3.6v). Headless Chromium on a laptop with no display draws an empty page at
// 15 to 30 frames a second (a gap of 33 to 130 ms between requestAnimationFrame callbacks, measured
// on a page with nothing on it), where WebKit draws 60. A budget written for 60 frames a second
// can never hold there. So a Chromium run first samples its own idle page: when that page holds
// 60 fps (a healthy host, a real phone) every strict number stays as written; when it cannot, the
// budget grows by what the host itself adds, and says so. The iPhone projects (WebKit) are never
// loosened: they keep the strict numbers.
import type { Page } from '../fixtures';

export type Idle = {
  /** Median and 90th percentile gap between frames on the idle page, in ms. */
  p50: number;
  p90: number;
  /** True when this host cannot hold 60 fps on an empty page (Chromium only). */
  slow: boolean;
};

const HEALTHY: Idle = { p50: 16.7, p90: 16.7, slow: false };
/** An idle page whose 90th percentile gap is over this cannot hold the 20 ms smoothness budgets. */
const SLOW_P90_MS = 25;

/** Samples requestAnimationFrame on the page as it is now (nothing running) for `ms`. */
export async function idleFrames(page: Page, ms = 1000): Promise<Idle> {
  if (page.context().browser()?.browserType().name() !== 'chromium') return HEALTHY;
  const gaps = await page.evaluate(
    (span) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const t0 = performance.now();
        let last = 0;
        const loop = (t: number) => {
          if (last) out.push(t - last);
          last = t;
          if (performance.now() - t0 < span) requestAnimationFrame(loop);
          else resolve(out);
        };
        requestAnimationFrame(loop);
      }),
    ms,
  );
  gaps.sort((a, b) => a - b);
  const p50 = gaps[Math.floor(gaps.length / 2)] ?? 16.7;
  const p90 = gaps[Math.floor(gaps.length * 0.9)] ?? 16.7;
  return { p50, p90, slow: p90 > SLOW_P90_MS };
}

/** Frames expected over `spanMs` of an effect: `strict` on a healthy host, else what half the host's own rate allows (never under 3). */
export const framesFloor = (strict: number, spanMs: number, idle: Idle) => (idle.slow ? Math.max(3, Math.min(strict, Math.floor((0.5 * spanMs) / idle.p90))) : strict);

/** A 90th percentile frame gap budget: the strict one, or 3 times the idle page's own on a slow host (its frame gaps swing by 2x from one second to the next). */
export const p90Budget = (strict: number, idle: Idle) => (idle.slow ? Math.max(strict, 3 * idle.p90) : strict);

/** A longest frame gap budget: the strict one, or 4 times the idle page's 90th percentile on a slow host. */
export const longestBudget = (strict: number, idle: Idle) => (idle.slow ? Math.max(strict, 4 * idle.p90) : strict);

/** A "tap to painted" budget: waiting for `frames` frames costs what the idle page's slow frames cost, over a 60 fps frame each. */
export const paintBudget = (strict: number, idle: Idle, frames = 2) => (idle.slow ? strict + frames * Math.max(0, idle.p90 - 16.7) : strict);

/** One line for the log, so a run says which rule it used. */
export const idleNote = (idle: Idle) => `idle frames p50 ${idle.p50.toFixed(1)} ms, p90 ${idle.p90.toFixed(1)} ms${idle.slow ? ' (slow host: budgets widened by that)' : ''}`;
