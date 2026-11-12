// Motion tokens (SPEC 10, 13.2, 23.3): the only place springs, durations and easings are defined.
// CSS mirrors these as custom properties in src/styles/tokens.css (--dur-*, --ease-*).
import type { Transition, Variants } from 'motion/react';

/** Durations in ms. UI motion stays between 150 and 300 ms; celebrations up to 900 ms. */
export const DUR = { press: 80, fast: 160, base: 240, slow: 300, celebrate: 900, /** the app behind a closing sheet coming forward */ sheetBack: 200 } as const;

/** Easings as cubic bezier points (strong ease out, iOS drawer). */
export const EASE = {
  out: [0.23, 1, 0.32, 1],
  drawer: [0.32, 0.72, 0, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;

/** Default spring: stiffness ~400, damping ~30 (SPEC 10). Plates, pills, rows. */
export const SPRING: Transition = { type: 'spring', stiffness: 400, damping: 30 };

/**
 * PLAN 2.2e: the three named springs every component uses.
 * tap: small things answering a press (a toggle's pill, a choice ring filling, the PR badge),
 * settled in about 180 ms with a hint of overshoot.
 */
export const TAP_SPRING: Transition = { type: 'spring', stiffness: 520, damping: 32 };

/** Snappy: the tap spring under its older name (icon bounce, chips). */
export const SNAPPY: Transition = TAP_SPRING;

/** Gentle: larger surfaces settling (cards cascading in). */
export const GENTLE: Transition = { type: 'spring', stiffness: 260, damping: 28 };

/** A light or a card gliding to a new place on the same screen: no overshoot, at rest inside about 380 ms (PLAN 3.5w). */
export const GLIDE: Transition = { type: 'spring', visualDuration: 0.3, bounce: 0 };

/** Sheets: settle visually in about 240 ms (inside the 180 to 280 ms band). */
export const SHEET_SPRING: Transition = { type: 'spring', visualDuration: 0.24, bounce: 0.12 };

/**
 * Screen push and pop (PLAN 2.2d round 3): stiffness 980, critically damped (no overshoot past the
 * screen edge), settled in about 220 ms. CSS mirrors it as --ease-nav-spring and --dur-nav.
 */
export const PAGE_SPRING: Transition = { type: 'spring', stiffness: 980, damping: 2 * Math.sqrt(980), restDelta: 0.5 };

/** The page spring under its 2.2d name. */
export const NAV_SPRING: Transition = PAGE_SPRING;

/** The three named springs (PLAN 2.2e). */
export const SPRINGS = { tap: TAP_SPRING, sheet: SHEET_SPRING, page: PAGE_SPRING } as const;

/**
 * The one page transition (PLAN 2.2e, SPEC 23.1). Push: the new page slides in from the right over
 * the old one, which moves 30% left, shrinks slightly and dims; back (pop) is the exact reverse.
 * 220 ms on the page spring (inside 180 to 280 ms). Reduced motion: no movement, only a short
 * crossfade (SPEC 13.2: crossfades instead of movement; transitions.css and pageVariantsReduced). The View Transitions CSS mirrors these numbers in tokens.css
 * (--dur-nav, --page-shift, --page-scale, --page-dim); the Motion fallback uses pageVariants.
 */
export const PAGE = { durationMs: 220, shift: '-30%', scale: 0.96, dim: 0.6 } as const;

const under = `translateX(${PAGE.shift}) scale(${PAGE.scale})`;

/**
 * Motion variants for a page layer without View Transitions (older iOS). custom: 1 push, -1 pop,
 * 0 no movement (an edge swipe or a sheet already covered the change). Full transform strings run
 * on the compositor (WAAPI), so a busy main thread never drops frames.
 */
export const pageVariants: Variants = {
  enter: (dir: number) =>
    dir === 0 ? { transform: 'translateX(0%) scale(1)', opacity: 1 } : dir > 0 ? { transform: 'translateX(100%) scale(1)', opacity: 1, zIndex: 2 } : { transform: under, opacity: PAGE.dim, zIndex: 1 },
  center: { transform: 'translateX(0%) scale(1)', opacity: 1 },
  exit: (dir: number) =>
    dir === 0 ? { opacity: 0, transition: { duration: 0 } } : dir > 0 ? { transform: under, opacity: PAGE.dim, zIndex: 1 } : { transform: 'translateX(100%) scale(1)', opacity: 1, zIndex: 2 },
};

/** Reduced motion: no movement (SPEC 13.2), a clean crossfade: out in 80 ms, then in over 120 ms. */
export const pageVariantsReduced: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { type: 'tween', duration: 0.12, delay: 0.08, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { type: 'tween', duration: 0.08, ease: 'easeOut' } },
};

/** Reduced motion: a short crossfade instead of movement. */
export const FADE: Transition = { type: 'tween', duration: 0.15, ease: 'easeOut' };

/** Picks the reduced motion variant when asked. */
export const motionFor = (reduce: boolean | null, full: Transition): Transition => (reduce ? FADE : full);

/** Stagger between items entering together (30 to 80 ms). */
export const STAGGER = 0.06;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
