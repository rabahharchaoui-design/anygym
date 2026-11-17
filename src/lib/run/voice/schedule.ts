// When each clip of a cue plays (PLAN 4.4): back to back with the small gaps of compose.ts, so the
// clips sound like one sentence, and never before the cue ahead of it has ended. Pure: times are
// seconds on whatever clock the player uses.
import { GAP_MS, type Cue } from './compose';

export type TimedClip = { id: string; at: number; sec: number };
export type CuePlan = { clips: TimedClip[]; end: number };

/** The silence between two cues. */
export const CUE_GAP_SEC = 0.25;

/**
 * Lays a cue on the clock. `lengthOf` gives a clip's length in seconds; `startAt` is the earliest
 * moment it may begin. The pause after the last clip is not part of the cue.
 */
export function planCue(cue: Cue, lengthOf: (id: string) => number, startAt: number): CuePlan {
  let t = startAt;
  const clips: TimedClip[] = [];
  cue.forEach((c, i) => {
    const sec = Math.max(0, lengthOf(c.id));
    clips.push({ id: c.id, at: t, sec });
    t += sec + (i === cue.length - 1 ? 0 : GAP_MS[c.gap] / 1000);
  });
  return { clips, end: t };
}

/** When the next cue may start: now (with a moment to get ready), or after the one still playing. */
export const nextStart = (now: number, busyUntil: number, lead = 0.06): number => Math.max(now + lead, busyUntil + CUE_GAP_SEC);

/** A cue that could not start within this long of being asked for is dropped: it would be old news. */
export const STALE_SEC = 20;

/**
 * Where the sound of a decoded clip begins and ends (seconds): encoders pad a file with a little
 * silence, and decoders differ in how much of it they keep, so the player trims by ear. `floor` is
 * the level under which a sample counts as silence.
 */
export function soundBounds(samples: Float32Array, rate: number, floor = 0.004): { start: number; sec: number } {
  let a = 0;
  let b = samples.length - 1;
  while (a < b && Math.abs(samples[a]!) < floor) a++;
  while (b > a && Math.abs(samples[b]!) < floor) b--;
  // A whole clip of silence is played as it is (nothing to find).
  if (a >= b) return { start: 0, sec: samples.length / rate };
  // A few milliseconds are kept on both sides so a soft start or end is not clipped.
  const pad = Math.round(rate * 0.004);
  const from = Math.max(0, a - pad);
  const to = Math.min(samples.length, b + 1 + pad);
  return { start: from / rate, sec: (to - from) / rate };
}
