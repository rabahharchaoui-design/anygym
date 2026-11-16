// Run units (SPEC 12.3: splits per mile or km). Meters inside; the unit only names a split length.
// Formatting for the screen is not here: clocks come from lib/timer.ts (formatClock, formatElapsed).
import type { DistanceUnit } from '../intake/answers';

export const METERS_PER_KM = 1000;

/** The international mile, exact. */
export const METERS_PER_MILE = 1609.344;

/** Length of one split (and of one pace unit) in meters. */
export const unitMeters = (unit: DistanceUnit): number => (unit === 'mi' ? METERS_PER_MILE : METERS_PER_KM);
