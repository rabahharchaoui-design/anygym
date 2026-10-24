// PLAN 1.10b: hidden gesture to the viewport diagnostics (G cannot type a URL in the Home
// Screen app). Fires when `count` taps land within `windowMs` of each other's first tap.

export const SECRET_TAPS = 7;
export const SECRET_WINDOW_MS = 3000;

/** Returns the taps still in the window after a tap at `now`, and whether the gesture fired. */
export function registerTap(
  taps: readonly number[],
  now: number,
  count = SECRET_TAPS,
  windowMs = SECRET_WINDOW_MS,
): { taps: number[]; fired: boolean } {
  const recent = [...taps.filter((t) => now - t < windowMs), now];
  if (recent.length >= count) return { taps: [], fired: true };
  return { taps: recent, fired: false };
}
