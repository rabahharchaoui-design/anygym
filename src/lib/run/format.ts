// What the run screens print (SPEC 12.2): distance and pace in the profile's unit. Pure. The one
// place these are formatted. Clocks come from lib/timer.ts (formatElapsed). A pace the tracker does
// not know prints as NO_PACE, never as a guess.
import type { DistanceUnit } from '../intake/answers';
import { pacePerUnit } from '../gps/pace';
import { unitMeters } from '../gps/units';

/** What stands where a pace is not known (yet). */
export const NO_PACE = '--';

/** Slower than this per mile or km is standing about, not a pace anyone reads. */
const MAX_PACE_SEC = 60 * 60;

/**
 * Distance as a number in the unit, two decimals, cut (never rounded up): "4.99" stays 4.99 until
 * the 5 km is really run, so the screen never claims distance that is not covered yet.
 */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  // The tiny lift keeps exact goals exact (5000 m / 1000 = 5.00) against float noise.
  const hundredths = Math.floor((m / unitMeters(unit)) * 100 + 1e-7);
  return (hundredths / 100).toFixed(2);
}

/**
 * Distance still to go, two decimals, lifted (never cut): it reads 0.00 only when nothing is left,
 * the mirror of formatDistance.
 */
export function formatDistanceLeft(meters: number, unit: DistanceUnit): string {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  return (Math.ceil((m / unitMeters(unit)) * 100 - 1e-7) / 100).toFixed(2);
}

/** "5.00 km". */
export const distanceWithUnit = (meters: number, unit: DistanceUnit): string => `${formatDistance(meters, unit)} ${unit}`;

/** Pace as "m:ss" per mile or km from seconds per meter, or NO_PACE. */
export function formatPace(secPerM: number | null, unit: DistanceUnit): string {
  const sec = pacePerUnit(secPerM, unitMeters(unit));
  if (sec === null || !Number.isFinite(sec) || sec <= 0 || sec >= MAX_PACE_SEC) return NO_PACE;
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** "/km" or "/mi", the pace's unit. */
export const paceUnit = (unit: DistanceUnit): string => `/${unit}`;

/** For screen readers: "5 minutes 12 seconds per km", or "no pace yet". */
export function spokenPace(secPerM: number | null, unit: DistanceUnit): string {
  const text = formatPace(secPerM, unit);
  if (text === NO_PACE) return 'no pace yet';
  const [m, s] = text.split(':');
  return `${Number(m)} minutes ${Number(s)} seconds per ${unit}`;
}
