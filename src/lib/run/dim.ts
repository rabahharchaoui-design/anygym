// Pocket mode dimming (SPEC 12.2): the live run screen goes near black after 10 seconds with no
// touch; a tap wakes it, and that first tap only wakes. Pure: times come in.

/** SPEC 12.2: 10 seconds with no touch. */
export const DIM_AFTER_MS = 10_000;

export type DimInput = {
  /** When the screen was last touched (or shown). */
  lastTouchAt: number;
  now: number;
  /** Dimming applies: the live screen shows, the run is not paused by hand, nothing is open over it. */
  enabled: boolean;
};

export const isDimmed = ({ lastTouchAt, now, enabled }: DimInput): boolean => enabled && now - lastTouchAt >= DIM_AFTER_MS;

/** Milliseconds until the screen dims, 0 when it already should; null when dimming is off. */
export const msUntilDim = ({ lastTouchAt, now, enabled }: DimInput): number | null => (enabled ? Math.max(0, DIM_AFTER_MS - (now - lastTouchAt)) : null);

/**
 * A touch. On a dimmed screen it only wakes: `pass` is false, so whatever is under the finger is
 * not pressed. Either way the 10 seconds start again.
 */
export const touch = (dimmed: boolean, now: number): { lastTouchAt: number; pass: boolean } => ({ lastTouchAt: now, pass: !dimmed });
