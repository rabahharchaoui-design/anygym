// Press and hold (SPEC 12.2: "press and hold to End, 1 second hold with a ring fill, no accidental
// ends") and the lock that the same hold opens. Pure: times come in.

/** SPEC 12.2: one second. */
export const HOLD_MS = 1000;

/** A finger that slides this far off where it went down has left the button: the hold is cancelled. */
export const HOLD_SLOP_PX = 36;

export type Hold = { downAt: number; x: number; y: number };

export const startHold = (now: number, x = 0, y = 0): Hold => ({ downAt: now, x, y });

/** How full the ring is, 0 to 1. */
export function holdFraction(hold: Hold | null, now: number, ms = HOLD_MS): number {
  if (!hold) return 0;
  return Math.min(1, Math.max(0, (now - hold.downAt) / ms));
}

/** The hold has lasted the whole time. */
export const holdDone = (hold: Hold | null, now: number, ms = HOLD_MS): boolean => !!hold && now - hold.downAt >= ms;

/** The finger moved too far from where it went down. */
export const holdLeft = (hold: Hold, x: number, y: number): boolean => Math.hypot(x - hold.x, y - hold.y) > HOLD_SLOP_PX;

/** Lifting the finger: the action happens only after the full hold, otherwise nothing does. */
export const releaseHold = (hold: Hold | null, now: number, ms = HOLD_MS): 'done' | 'cancel' => (holdDone(hold, now, ms) ? 'done' : 'cancel');

export type LockControl = 'pause' | 'resume' | 'end' | 'lock' | 'unlock' | 'cycle' | 'page' | 'settings' | 'hide' | 'recentre';

/** Locked: nothing answers a touch but the hold that unlocks. */
export const allowedWhenLocked = (control: LockControl): boolean => control === 'unlock';

/** What a control may do right now. */
export const controlAllowed = (locked: boolean, control: LockControl): boolean => !locked || allowedWhenLocked(control);
