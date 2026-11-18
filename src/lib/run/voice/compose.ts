// The voice coach's sentences (PLAN 4.4, SPEC 12.4): from something that happened in the run to the
// recorded clips that say it, in order. Pure. "One mile. Nine minutes, twelve seconds. Pace nine
// twelve." Every id named here is in clips.ts; a test composes every value the app can say and
// checks each id against the shipped manifest. A number the run does not know is never spoken.
import { unitMeters } from '../../gps';
import type { DistanceUnit } from '../../intake/answers';
import type { BlockName } from '../intervals';
import { CLIPS } from './clips';

/** The silence after a clip: inside a phrase, at a comma, at a full stop. */
export const GAP_MS = { word: 35, comma: 150, stop: 340 } as const;
export type Gap = keyof typeof GAP_MS;

export type CueClip = { id: string; gap: Gap };
export type Cue = CueClip[];

export type VoiceEvent =
  | { type: 'start'; first: BlockName | null }
  /** A split is done: how many so far, the moving time at that point, that split's pace (seconds per unit) or null. */
  /** `movingSec` null: the split holds a GPS gap, its time is not known and is not said (PLAN 4.4b 10). */
  | { type: 'split'; count: number; unit: DistanceUnit; movingSec: number | null; paceSec: number | null }
  | { type: 'interval'; name: BlockName; last: boolean }
  | { type: 'intervals-done' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'auto-paused' }
  /** Halfway to, or at, a Distance goal (says the time so far) or a Time goal (says the distance so far). */
  | { type: 'halfway' | 'goal'; say: { kind: 'time'; movingSec: number } | { kind: 'distance'; meters: number; unit: DistanceUnit } }
  | { type: 'finished'; summary: { meters: number; unit: DistanceUnit; movingSec: number; paceSec: number | null } | null };

const w = (id: string): CueClip => ({ id, gap: 'word' });
/** The last clip of a group ends with this pause. */
const end = (clips: CueClip[], gap: Gap): CueClip[] => clips.map((c, i) => (i === clips.length - 1 ? { ...c, gap } : c));

/** The highest whole number the pack can say. */
export const MAX_NUMBER = 999;

/** A whole number from 0 to 999: "twelve", "sixty" "five", "one" "hundred" "twelve". */
export function numberClips(n: number): CueClip[] {
  const v = Math.min(MAX_NUMBER, Math.max(0, Math.floor(n)));
  const out: CueClip[] = [];
  if (v >= 100) out.push(w(`n${Math.floor(v / 100)}`), w('hundred'));
  const rest = v % 100;
  if (v >= 100 && rest === 0) return out;
  if (rest < 60) out.push(w(`n${rest}`));
  else {
    out.push(w(`n${rest - (rest % 10)}`));
    if (rest % 10) out.push(w(`n${rest % 10}`));
  }
  return out;
}

/**
 * A length of time: "Nine minutes," "twelve seconds." Hours only when there are any; no "zero" parts.
 * Cut to the whole second like the clock on the screen (lib/timer formatElapsed), never rounded up
 * (PLAN 4.4b 9): the voice says what the clock shows.
 */
export function timeClips(sec: number): CueClip[] {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const out: CueClip[] = [];
  if (h > 0) out.push(...end([...numberClips(h), w(h === 1 ? 'hour' : 'hours')], 'comma'));
  if (m > 0) out.push({ id: `min${m}`, gap: 'comma' });
  if (s > 0 || out.length === 0) out.push({ id: `sec${s}`, gap: 'comma' });
  return end(out, 'stop');
}

/** Slower than an hour per mile or km is not a pace anyone says (the same line as lib/run/format). */
const MAX_PACE_SEC = 3600;

/** A pace as runners say it: "nine twelve", "nine oh five", "nine minutes". Empty when it is not known. */
export function paceClips(secPerUnit: number | null): CueClip[] {
  if (secPerUnit === null || !Number.isFinite(secPerUnit) || secPerUnit <= 0) return [];
  const total = Math.round(secPerUnit);
  if (total >= MAX_PACE_SEC) return [];
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return [{ id: `sec${s}`, gap: 'stop' }];
  if (s === 0) return [{ id: `min${m}`, gap: 'stop' }];
  return [w(`n${m}`), { id: s < 10 ? `oh${s}` : `n${s}`, gap: 'stop' }];
}

const unitClip = (unit: DistanceUnit, one: boolean): string => (unit === 'mi' ? (one ? 'mile' : 'miles') : one ? 'kilometer' : 'kilometers');

/** A whole number of miles or km: "One mile." "Twelve kilometers." */
export const splitClips = (count: number, unit: DistanceUnit): CueClip[] => end([...numberClips(count), w(unitClip(unit, count === 1))], 'stop');

/** A distance to one decimal, cut (never rounded up): "Three point one miles." */
export function distanceClips(meters: number, unit: DistanceUnit): CueClip[] {
  const tenths = Math.floor((Math.max(0, meters) / unitMeters(unit)) * 10 + 1e-7);
  const wholePart = Math.min(MAX_NUMBER, Math.floor(tenths / 10));
  const tenth = tenths % 10;
  if (tenth === 0) return splitClips(wholePart, unit);
  return end([...numberClips(wholePart), w('point'), w(`n${tenth}`), w(unitClip(unit, false))], 'stop');
}

const stop = (id: string): CueClip => ({ id, gap: 'stop' });

/** The clips that say an event, in order. */
export function composeCue(e: VoiceEvent): Cue {
  switch (e.type) {
    case 'start':
      return e.first ? [stop('run_started'), stop(e.first)] : [stop('run_started')];
    case 'split': {
      const pace = paceClips(e.paceSec);
      return [...splitClips(e.count, e.unit), ...(e.movingSec === null ? [] : timeClips(e.movingSec)), ...(pace.length ? [w('pace'), ...pace] : [])];
    }
    case 'interval':
      return e.last ? [stop('last_one'), stop(e.name)] : [stop(e.name)];
    case 'intervals-done':
      return [stop('intervals_done')];
    case 'paused':
      return [stop('paused')];
    case 'resumed':
      return [stop('resumed')];
    case 'auto-paused':
      return [stop('auto_paused')];
    case 'halfway':
    case 'goal': {
      const head = stop(e.type === 'halfway' ? 'halfway' : 'goal_reached');
      if (e.say.kind === 'time') return [head, ...timeClips(e.say.movingSec)];
      // Under a tenth of a mile or km there is no distance worth saying.
      return e.say.meters < unitMeters(e.say.unit) / 10 ? [head] : [head, ...distanceClips(e.say.meters, e.say.unit)];
    }
    case 'finished': {
      const s = e.summary;
      if (!s) return [stop('run_finished')];
      const pace = paceClips(s.paceSec);
      const paced: CueClip[] = pace.length ? [w('pace'), ...end(pace, 'word'), stop(s.unit === 'mi' ? 'per_mile' : 'per_kilometer')] : [];
      return [stop('run_finished'), ...distanceClips(s.meters, s.unit), ...timeClips(s.movingSec), ...paced];
    }
  }
}

const TEXT = new Map(CLIPS.map((c) => [c.id, c.text]));

/** The same sentence as plain words, for the phone's own voice when a clip cannot be played. */
export const cueText = (cue: Cue): string => cue.map((c) => TEXT.get(c.id) ?? '').join(' ').replace(/\s+/g, ' ').trim();

/** A sample of what a split sounds like, for the Preview button. */
export const previewEvent = (unit: DistanceUnit): VoiceEvent => ({ type: 'split', count: 1, unit, movingSec: 552, paceSec: 552 });
