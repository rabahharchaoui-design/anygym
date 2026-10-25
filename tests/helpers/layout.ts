// Layout checks for every screen on every phone (SPEC 13.4): no horizontal scroll, nothing wider
// than the screen, nothing tappable under a system bar (safe areas), the primary action not covered.
//
// Safe areas: Playwright cannot make env(safe-area-inset-*) non zero, and the app reads them only
// through --safe-top/-bottom/-left/-right (src/styles/tokens.css). `simulateSafeAreas` sets those
// to the project's phone (Dynamic Island, home indicator, Android status and gesture bars) before
// the app loads, so the real layout code is what moves.
import { test, expect, type Locator, type Page } from '../fixtures';

export type Insets = { top: number; bottom: number; left: number; right: number };

const PHONE_INSETS: Record<string, Insets> = {
  'iPhone SE': { top: 20, bottom: 0, left: 0, right: 0 },
  'iPhone 15': { top: 59, bottom: 34, left: 0, right: 0 },
  'iPhone 17 Pro Max': { top: 62, bottom: 34, left: 0, right: 0 },
  'Pixel 7': { top: 24, bottom: 24, left: 0, right: 0 },
  'Galaxy compact': { top: 24, bottom: 24, left: 0, right: 0 },
  'Small Android': { top: 24, bottom: 16, left: 0, right: 0 },
  '320 floor': { top: 20, bottom: 0, left: 0, right: 0 },
};

export const insetsOf = (project = test.info().project.name): Insets => PHONE_INSETS[project] ?? { top: 0, bottom: 0, left: 0, right: 0 };

/** Sets the app's safe area variables to this phone's insets on every load (call before goto). */
export async function simulateSafeAreas(page: Page, insets = insetsOf()) {
  await page.addInitScript((i) => {
    const apply = () => {
      const s = document.documentElement?.style;
      if (!s) return false;
      s.setProperty('--safe-top', `${i.top}px`);
      s.setProperty('--safe-bottom', `${i.bottom}px`);
      s.setProperty('--safe-left', `${i.left}px`);
      s.setProperty('--safe-right', `${i.right}px`);
      return true;
    };
    // WebKit may run init scripts before <html> exists.
    if (!apply()) new MutationObserver((_, o) => apply() && o.disconnect()).observe(document, { childList: true });
  }, insets);
}

type Problem = string;

/** Runs in the page: every visible control's visible part, clipped by its scroll and clip parents. */
function inspect([insets, scopeSel]: [Insets, string | null]): { wide: Problem[]; unsafe: Problem[]; sideScroll: number } {
  const W = innerWidth;
  const H = innerHeight;
  const root = (scopeSel ? document.querySelector(scopeSel) : document.body) ?? document.body;
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"`;
  const visible = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  /** The element's rect cut by every ancestor that clips (overflow not visible). */
  const clippedRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    let { left, top, right, bottom } = r;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible') {
        const q = p.getBoundingClientRect();
        left = Math.max(left, q.left);
        right = Math.min(right, q.right);
      }
      if (s.overflowY !== 'visible') {
        const q = p.getBoundingClientRect();
        top = Math.max(top, q.top);
        bottom = Math.min(bottom, q.bottom);
      }
    }
    return { left, top, right, bottom };
  };
  const wide: Problem[] = [];
  const unsafe: Problem[] = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const c = clippedRect(el);
    if (c.right - c.left <= 0 || c.bottom - c.top <= 0) continue; // scrolled or clipped out of view
    if (!visible(el)) continue;
    if (c.left < -1 || c.right > W + 1) wide.push(`${label(el)} ${Math.round(c.left)}..${Math.round(c.right)} of ${W}`);
  }
  // With a sheet open, only the top sheet takes taps (the screen behind is scaled back and dimmed).
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const tapRoot = dialogs.length ? dialogs[dialogs.length - 1]! : root;
  const controls = [...tapRoot.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="radio"], [role="tab"], [role="slider"]')].filter(
    (el) => visible(el) && !el.closest('[inert]') && getComputedStyle(el).pointerEvents !== 'none' && !(el as HTMLButtonElement).disabled,
  );
  /** Every ancestor that scrolls (either way) and has more content than fits. */
  const scrollersOf = (el: Element): HTMLElement[] => {
    const out: HTMLElement[] = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      const y = (s.overflowY === 'auto' || s.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1;
      const x = (s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1;
      if (x || y) out.push(p);
    }
    return out;
  };
  // Every scroll position is put back afterwards.
  const saved = new Map<HTMLElement, [number, number, string]>();
  const remember = (sc: HTMLElement) => {
    if (!saved.has(sc)) saved.set(sc, [sc.scrollTop, sc.scrollLeft, sc.style.scrollBehavior]);
    sc.style.scrollBehavior = 'auto';
  };
  /**
   * The control's FULL box lies inside the safe rectangle and inside every ancestor that clips it
   * (nothing of it cut off, and fully clipped counts as hidden), and it is the topmost element at
   * its middle (nothing covers it). Controls in scrolling content are scrolled into view first.
   */
  const problemOf = (el: Element): string | null => {
    const scrollers = scrollersOf(el);
    if (scrollers.length) {
      scrollers.forEach(remember);
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
    }
    const r = el.getBoundingClientRect();
    const c = clippedRect(el);
    const at = `${label(el)} ${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)}`;
    if (c.right - c.left <= 0 || c.bottom - c.top <= 0) return `${at} is fully clipped (hidden)`;
    if (c.left > r.left + 1 || c.top > r.top + 1 || c.right < r.right - 1 || c.bottom < r.bottom - 1) return `${at} is partly cut off by a parent`;
    if (r.top < insets.top - 0.5 || r.bottom > H - insets.bottom + 0.5 || r.left < insets.left - 0.5 || r.right > W - insets.right + 0.5)
      return `${at} reaches under a system bar (safe ${insets.left},${insets.top}..${W - insets.right},${H - insets.bottom})${scrollers.length ? ' even scrolled into view' : ''}`;
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!top || !(top === el || el.contains(top))) return `${at} is covered by ${top?.tagName.toLowerCase()}.${String(top?.className ?? '').slice(0, 30)}`;
    return null;
  };
  try {
    for (const el of controls) {
      const bad = problemOf(el);
      if (bad) unsafe.push(bad);
    }
  } finally {
    for (const [sc, [top, left, behavior]] of saved) {
      sc.scrollTop = top;
      sc.scrollLeft = left;
      sc.style.scrollBehavior = behavior;
    }
  }
  return { wide, unsafe, sideScroll: document.documentElement.scrollWidth - W };
}

/**
 * The layout rules of SPEC 13.4 on the screen as it is now. `primary` (the main action) must be
 * visible, inside the safe area and not covered by anything (the topmost element at its middle).
 */
export async function checkLayout(page: Page, opts: { primary?: Locator; scope?: string } = {}) {
  await page.waitForTimeout(300);
  // No view transition running (Chromium): its overlay takes every hit until it ends.
  await page.waitForFunction(() => !document.documentElement.dataset.nav, null, { timeout: 5000 }).catch(() => {});
  // Springs and transitions settled: every control stays put for 150 ms.
  await page
    .waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const at = () => [...document.querySelectorAll('button, a[href], [role="dialog"]')].map((e) => { const r = e.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}`; }).join('|');
          const a = at();
          setTimeout(() => resolve(at() === a), 150);
        }),
      null,
      { timeout: 4000 },
    )
    .catch(() => {});
  const insets = insetsOf();
  const r = await page.evaluate(inspect, [insets, opts.scope ?? null] as [Insets, string | null]);
  expect(r.sideScroll, 'no horizontal scroll').toBeLessThanOrEqual(0);
  expect(r.wide, 'nothing wider than the screen').toEqual([]);
  expect(r.unsafe, 'every control fully inside the safe area, not cut off, not covered').toEqual([]);
  if (opts.primary) {
    await expect(opts.primary).toBeVisible();
    await opts.primary.scrollIntoViewIfNeeded();
    const covered = await opts.primary.evaluate((el, i) => {
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      if (y < i.top || y > innerHeight - i.bottom) return `middle ${Math.round(y)} outside the safe area`;
      const top = document.elementFromPoint(x, y);
      return top && (el === top || el.contains(top)) ? null : `covered by ${top?.tagName} ${top?.className}`;
    }, insets);
    expect(covered, 'the primary action is not covered').toBeNull();
  }
}

/**
 * Text fully shown: not clamped or cut by its own box, and inside every ancestor that clips. (A
 * glyph's descender may poke 1 to 2 px under a tight line height in Chromium; that is not a cut.)
 */
export const fullyShown = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el);
    if (s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '') return false;
    if (s.overflow !== 'visible' && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) return false;
    if (el.scrollWidth > el.clientWidth + 1) return false;
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (getComputedStyle(p).overflow === 'visible') continue;
      const q = p.getBoundingClientRect();
      if (r.top < q.top - 1 || r.bottom > q.bottom + 1 || r.left < q.left - 1 || r.right > q.right + 1) return false;
    }
    return true;
  });

/** Optional screenshots for the session report (SHOTS_112=1): reports/shots/1.12/<name>-<phone>.png */
export async function matrixShot(page: Page, name: string) {
  if (!process.env.SHOTS_112) return;
  await page.screenshot({ path: `reports/shots/1.12/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
}
