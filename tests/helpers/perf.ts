// Timing helpers for the performance budgets (tests/perf). Everything is measured inside the page
// with performance.now(): from the tap's pointerdown to the frame that shows the result, so
// Playwright's own round trips are never counted.
import type { Locator, Page } from '../fixtures';

/**
 * WebKit has no CDP, so there is no CPU slowdown on the iPhone projects: they measure at full speed
 * (the same technique as tests/polish-2.2d.spec.ts). Chromium projects run at 4x through
 * Emulation.setCPUThrottlingRate, as that spec does. Returns the slowdown in effect.
 */
export async function slowDown(page: Page, rate = 4): Promise<number> {
  if (page.context().browser()?.browserType().name() !== 'chromium') return 1;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return rate;
}

/**
 * Arms a listener, runs `act` (the tap), and returns pointerdown to painted in ms. `probe` is the
 * source of a function body `(root) => boolean`, true once the result is in the page; two animation
 * frames after it first holds, that frame has been painted.
 */
export async function tapToPaint(page: Page, act: () => Promise<void>, probe: string): Promise<number> {
  await page.evaluate((src) => {
    const w = window as unknown as { __perf: { down: number; painted: number } };
    w.__perf = { down: 0, painted: 0 };
    // eslint-disable-next-line no-new-func
    const seen = new Function('root', src) as (root: Document) => boolean;
    document.addEventListener(
      'pointerdown',
      () => {
        w.__perf.down = performance.now();
        // Checked on every DOM change, so the answer is seen in the frame it was made in; the
        // result is painted two animation frames after that.
        const done = () => {
          if (w.__perf.painted || !seen(document)) return false;
          mo.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => (w.__perf.painted = performance.now())));
          return true;
        };
        const mo = new MutationObserver(done);
        mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        done();
      },
      { capture: true, once: true },
    );
  }, probe);
  await act();
  await page.waitForFunction(() => (window as unknown as { __perf: { painted: number } }).__perf.painted > 0, null, { timeout: 10_000 });
  return page.evaluate(() => {
    const p = (window as unknown as { __perf: { down: number; painted: number } }).__perf;
    return p.painted - p.down;
  });
}

export const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
export const round = (n: number) => Math.round(n);
export const tapOf = (l: Locator) => () => l.tap();
