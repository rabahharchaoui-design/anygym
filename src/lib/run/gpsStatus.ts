// The GPS chip on the run start screen (PLAN 4.2, competitor gap 5): what the phone knows about
// its position, in plain words. It only informs: nothing here can stop a run from starting.
// Pure: the permission, the last fix and the clock come in.
import type { DistanceUnit } from '../intake/answers';
import { GAP_SEC, MAX_ACCURACY_M, METERS_PER_MILE } from '../gps';

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied';
export type GeoFix = { lat: number; lng: number; accuracy: number; t: number };
export type GeoProblem = 'denied' | 'unavailable' | 'timeout';

export type GeoState = {
  /** The phone has a location API at all. */
  supported: boolean;
  permission: GeoPermission;
  /** The app is listening for positions right now. */
  watching: boolean;
  fix: GeoFix | null;
  problem: GeoProblem | null;
};

export const GEO_START: GeoState = { supported: true, permission: 'unknown', watching: false, fix: null, problem: null };

export type GpsStatus = 'none' | 'ask' | 'searching' | 'good' | 'weak' | 'denied' | 'no-signal';
export type GpsTone = 'ok' | 'warn' | 'off' | 'busy';

/** A fix older than this is no longer where you are: the chip goes back to searching (the gap rule of lib/gps). */
export const FIX_FRESH_MS = GAP_SEC * 1000;

export function gpsStatus(s: GeoState, now: number): GpsStatus {
  if (!s.supported) return 'none';
  if (s.permission === 'denied' || s.problem === 'denied') return 'denied';
  if (s.fix && now - s.fix.t <= FIX_FRESH_MS) return s.fix.accuracy <= MAX_ACCURACY_M ? 'good' : 'weak';
  if (!s.watching) return 'ask';
  if (s.problem) return 'no-signal';
  return 'searching';
}

const FEET_PER_MILE = 5280;

/** "about 40 m" or "about 130 ft": rounded so it never reads as more exact than the phone is. */
export function accuracyWords(accuracyM: number, unit: DistanceUnit): string {
  if (unit === 'mi') {
    const ft = (accuracyM / METERS_PER_MILE) * FEET_PER_MILE;
    return `about ${Math.max(10, Math.round(ft / 10) * 10)} ft`;
  }
  return `about ${Math.max(5, Math.round(accuracyM / 5) * 5)} m`;
}

export type GpsWords = {
  /** The chip. */
  chip: string;
  tone: GpsTone;
  /** The sheet behind the chip: a title and one to three plain lines. */
  title: string;
  lines: string[];
};

export type Platform = 'ios' | 'android' | 'other';

/** How to turn location back on, by phone. The app cannot open these settings itself. */
export function turnOnSteps(platform: Platform): string[] {
  if (platform === 'ios') return ['Open the Settings app, then Privacy & Security, then Location Services.', 'Tap Safari Websites (or AnyGym) and pick While Using the App.', 'Come back here and tap Try again.'];
  if (platform === 'android') return ['Tap and hold the AnyGym icon, then App info, then Permissions.', 'Tap Location and pick Allow only while using the app.', 'Come back here and tap Try again.'];
  return ['Allow location for this site in your browser settings.', 'Come back here and tap Try again.'];
}

export function gpsWords(status: GpsStatus, fix: GeoFix | null, unit: DistanceUnit, platform: Platform): GpsWords {
  switch (status) {
    case 'good':
      return { chip: 'GPS ready', tone: 'ok', title: 'GPS ready', lines: [`Your phone knows where you are to within ${accuracyWords(fix?.accuracy ?? MAX_ACCURACY_M, unit)}.`] };
    case 'weak': {
      const within = accuracyWords(fix?.accuracy ?? MAX_ACCURACY_M, unit);
      return { chip: `GPS weak · ${within}`, tone: 'warn', title: 'GPS is weak', lines: [`Your phone only knows where you are to within ${within}.`, 'It gets better outside, away from tall buildings. You can start now and it will catch up.'] };
    }
    case 'searching':
      return { chip: 'Finding GPS', tone: 'busy', title: 'Finding GPS', lines: ['This takes a few seconds, longer indoors.', 'You can start now. You do not have to wait.'] };
    case 'no-signal':
      return { chip: 'No GPS signal', tone: 'warn', title: 'No GPS signal', lines: ['Your phone cannot find where you are right now.', 'Go outside or stand near a window. You can still start.'] };
    case 'denied':
      return { chip: 'Location is off', tone: 'off', title: 'Location is off for AnyGym', lines: turnOnSteps(platform) };
    case 'none':
      return { chip: 'No GPS here', tone: 'off', title: 'This phone has no GPS here', lines: ['This browser does not share a location, so the map cannot show where you are.'] };
    case 'ask':
      return { chip: 'Turn on GPS', tone: 'off', title: 'See where you are', lines: [LOCATION_REASON] };
  }
}

/** The one line reason shown before the phone asks for location. */
export const LOCATION_REASON = 'AnyGym uses your location to show you on the map and to measure your run. It never leaves your phone.';

/** Which phone this is, from the browser's own name for itself. */
export function platformOf(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}
