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

// ---------------------------------------------------------------- active workout (SPEC 13.5)

/** What an active workout must show on one screen: [name, CSS selector]. */
export type ActivePart = [name: string, selector: string];

/** The title, the current row, its reps (or hold) and its ✓ (PLAN 1.7i (9)). */
export const ACTIVE_PARTS: ActivePart[] = [
  ['title', 'main[data-testid^="exercise-"] h2'],
  ['current row', '[data-state="current"]'],
  ['reps', '[data-state="current"] [data-testid="reps-cell"], [data-state="current"] [data-testid="hold-cell"]'],
  ['✓', '[data-testid="check-current"]'],
];

/**
 * Runs in the page and never scrolls anything: each part's FULL box must be inside the safe area,
 * inside every ancestor that clips it (a row scrolled below the fold of the table is cut off), and
 * on top at its middle (nothing covers it). Every scroll position must be the same afterwards.
 */
function inspectActive([insets, parts]: [Insets, ActivePart[]]): string[] {
  const W = innerWidth;
  const H = innerHeight;
  const scrolls = () => [document.scrollingElement, ...document.querySelectorAll('*')].map((e) => (e ? `${e.scrollTop},${e.scrollLeft}` : '')).join('|');
  const before = scrolls();
  const problems: string[] = [];
  for (const [name, sel] of parts) {
    const el = document.querySelector(sel);
    if (!el) {
      problems.push(`${name}: not on the screen (${sel})`);
      continue;
    }
    const r = el.getBoundingClientRect();
    const at = `${name} ${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)}`;
    if (r.width === 0 || r.height === 0) {
      problems.push(`${at} has no size`);
      continue;
    }
    if (r.top < insets.top - 0.5 || r.bottom > H - insets.bottom + 0.5 || r.left < insets.left - 0.5 || r.right > W - insets.right + 0.5) {
      problems.push(`${at} is not fully inside the screen's safe area ${insets.left},${insets.top}..${W - insets.right},${H - insets.bottom} (it needs scrolling)`);
      continue;
    }
    let cut = false;
    for (let p = el.parentElement; p && !cut; p = p.parentElement) {
      const s = getComputedStyle(p);
      const q = p.getBoundingClientRect();
      if (s.overflowY !== 'visible' && (r.top < q.top - 1 || r.bottom > q.bottom + 1)) cut = true;
      if (s.overflowX !== 'visible' && (r.left < q.left - 1 || r.right > q.right + 1)) cut = true;
      if (cut) problems.push(`${at} is cut off by ${p.tagName.toLowerCase()}.${String(p.className).slice(0, 30)} ${Math.round(q.top)}..${Math.round(q.bottom)} (scrolled out of view)`);
    }
    if (cut) continue;
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) problems.push(`${at} is covered by ${top?.tagName.toLowerCase()}.${String(top?.className ?? '').slice(0, 30)}`);
  }
  if (scrolls() !== before) problems.push('the check moved a scroll position');
  return problems;
}

/** The problems of the active workout as it is now (no scrolling, see inspectActive). */
export async function activeWorkoutProblems(page: Page, parts: ActivePart[] = ACTIVE_PARTS): Promise<string[]> {
  return page.evaluate(inspectActive, [insetsOf(), parts] as [Insets, ActivePart[]]);
}

/**
 * SPEC 13.5 on this phone, BEFORE anything scrolls: the exercise title, the current row, its reps
 * and its ✓ are fully on the screen, uncut and uncovered (call right after opening the workout or
 * starting rest, before checkLayout, which scrolls controls into view).
 */
export async function checkActiveWorkout(page: Page) {
  // Springs settled: the parts stay put for 150 ms.
  await page
    .waitForFunction(
      (sels) =>
        new Promise<boolean>((resolve) => {
          const at = () => sels.map((s) => document.querySelector(s)?.getBoundingClientRect()).map((r) => (r ? `${r.x},${r.y},${r.width},${r.height}` : '-')).join('|');
          const a = at();
          setTimeout(() => resolve(at() === a), 150);
        }),
      ACTIVE_PARTS.map(([, s]) => s),
      { timeout: 4000 },
    )
    .catch(() => {});
  expect(await activeWorkoutProblems(page), 'SPEC 13.5: title, current row, reps and ✓ on one screen with no scrolling').toEqual([]);
}

// ---------------------------------------------------------------- controls (SPEC 13.3)

/**
 * Runs in the page: every visible control (in the top sheet when one is open) has a non empty
 * accessible name, and every enabled one a reachable hit area of at least 48 × 48: scrolled into
 * view, its middle and the four edge midpoints of a 48 px square around it all hit the control
 * itself (its padding and pseudo elements count, a neighbour or an overlay does not). Scroll positions are put back.
 */
function auditControls([scopeSel]: [string | null]): string[] {
  const visible = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const textOf = (el: Element): string => {
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? '';
      else if (n instanceof Element && n.getAttribute('aria-hidden') !== 'true') {
        out += n instanceof HTMLImageElement ? (n.alt ?? '') : n.getAttribute('aria-label') ?? textOf(n);
      }
    }
    return out;
  };
  const nameOf = (el: Element): string => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t;
    }
    const aria = el.getAttribute('aria-label')?.trim();
    if (aria) return aria;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      const labels = [...(el.labels ?? [])].map((l) => l.textContent ?? '').join(' ').trim();
      if (labels) return labels;
      if ('placeholder' in el && el.placeholder) return el.placeholder;
    }
    const text = textOf(el).trim();
    if (text) return text;
    return el.getAttribute('title')?.trim() ?? '';
  };
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const root = scopeSel ? [...document.querySelectorAll(scopeSel)].pop() ?? document.body : dialogs.length ? dialogs[dialogs.length - 1]! : document.body;
  const controls = [
    ...root.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="radio"], [role="tab"], [role="slider"], [role="option"], [role="switch"], [role="checkbox"]',
    ),
  ].filter((el) => visible(el) && !el.closest('[inert]') && el.getBoundingClientRect().width > 0);
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${String(el.className).split(' ')[0]?.slice(0, 24)} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
  const saved = new Map<HTMLElement, [number, number, string]>();
  const problems: string[] = [];
  try {
    for (const el of controls) {
      if (!nameOf(el)) problems.push(`${label(el)} has no accessible name`);
      if ((el as HTMLButtonElement).disabled || getComputedStyle(el).pointerEvents === 'none') continue;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && !saved.has(p)) {
          saved.set(p, [p.scrollTop, p.scrollLeft, p.style.scrollBehavior]);
          p.style.scrollBehavior = 'auto';
        }
      }
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      // The edges of a 48 px target around the middle (a 48 px round button reaches all four; its
      // rounded corners are not part of any shape's extent).
      const misses = [
        [cx, cy],
        [cx - 23.5, cy],
        [cx + 23.5, cy],
        [cx, cy - 23.5],
        [cx, cy + 23.5],
      ]
        // A layer that hands plain taps on to what is under it (the edge swipe strip) is looked through.
        .map(([x, y]) => document.elementsFromPoint(x!, y!).find((e) => !e.closest('[data-tap-through]')) ?? null)
        .filter((hit) => !hit || !(hit === el || el.contains(hit)));
      if (misses.length) {
        const hit = misses[0];
        const h = hit?.getBoundingClientRect();
        problems.push(
          `${label(el)} ${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.top)}..${Math.round(r.bottom)}: its hit area is smaller than 48 × 48 (${misses.length} of 5 probe points hit ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]?.slice(0, 24)} ${Math.round(h!.top)}..${Math.round(h!.bottom)}` : 'nothing'})`,
        );
      }
    }
  } finally {
    for (const [sc, [top, left, behavior]] of saved) {
      sc.scrollTop = top;
      sc.scrollLeft = left;
      sc.style.scrollBehavior = behavior;
    }
  }
  return problems;
}

/** The control problems of the screen as it is now (see auditControls). */
export async function controlProblems(page: Page, scope?: string): Promise<string[]> {
  return page.evaluate(auditControls, [scope ?? null] as [string | null]);
}

/** SPEC 13.3 on this screen: every control is named and has a 48 × 48 hit area. */
export async function checkControls(page: Page, scope?: string) {
  // Staggered entrances wait still before they move: every control must hold its place for 600 ms.
  await page
    .waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const at = () => [...document.querySelectorAll('button, a[href], [role="radio"], [role="option"]')].map((e) => { const r = e.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}`; }).join('|');
          const a = at();
          setTimeout(() => resolve(at() === a), 600);
        }),
      null,
      { timeout: 6000 },
    )
    .catch(() => {});
  expect(await controlProblems(page, scope), 'every control has an accessible name and a 48 × 48 hit area').toEqual([]);
}
