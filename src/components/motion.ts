// Shared motion values (SPEC 10, 13.2): springy but quick.
import type { Transition } from 'motion/react';

/** Plates sliding on and off: stiffness ~400, damping ~30. */
export const SPRING: Transition = { type: 'spring', stiffness: 400, damping: 30 };

/** Sheets: settles visually in about 240 ms (inside the 180 to 280 ms band). */
export const SHEET_SPRING: Transition = { type: 'spring', visualDuration: 0.24, bounce: 0.12 };

/** Reduced motion: a short crossfade instead of movement. */
export const FADE: Transition = { type: 'tween', duration: 0.15, ease: 'easeOut' };
