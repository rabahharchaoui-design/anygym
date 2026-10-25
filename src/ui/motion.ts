// Motion tokens (SPEC 10, 13.2, 23.3): the only place springs, durations and easings are defined.
// CSS mirrors these as custom properties in src/styles/tokens.css (--dur-*, --ease-*).
import type { Transition } from 'motion/react';

/** Durations in ms. UI motion stays between 150 and 300 ms; celebrations up to 900 ms. */
export const DUR = { press: 80, fast: 160, base: 240, slow: 300, celebrate: 900 } as const;

/** Easings as cubic bezier points (strong ease out, iOS drawer). */
export const EASE = {
  out: [0.23, 1, 0.32, 1],
  drawer: [0.32, 0.72, 0, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;

/** Default spring: stiffness ~400, damping ~30 (SPEC 10). Plates, pills, rows. */
export const SPRING: Transition = { type: 'spring', stiffness: 400, damping: 30 };

/** Snappy: small things that answer a tap (icon bounce, chips). */
export const SNAPPY: Transition = { type: 'spring', stiffness: 520, damping: 32 };

/** Gentle: larger surfaces settling (cards cascading in). */
export const GENTLE: Transition = { type: 'spring', stiffness: 260, damping: 28 };

/** Sheets: settle visually in about 240 ms (inside the 180 to 280 ms band). */
export const SHEET_SPRING: Transition = { type: 'spring', visualDuration: 0.24, bounce: 0.12 };

/** Reduced motion: a short crossfade instead of movement. */
export const FADE: Transition = { type: 'tween', duration: 0.15, ease: 'easeOut' };

/** Picks the reduced motion variant when asked. */
export const motionFor = (reduce: boolean | null, full: Transition): Transition => (reduce ? FADE : full);

/** Stagger between items entering together (30 to 80 ms). */
export const STAGGER = 0.06;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
