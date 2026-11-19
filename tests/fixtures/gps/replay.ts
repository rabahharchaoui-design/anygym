// PLAN 4.4d (1, 4): a trace through the live run exactly as the app feeds it (lib/run liveStep with
// the phone's stamp through fixTime and the arrival time as `now`), with the screen read every
// second (readLiveAt), and the numbers the pass rules are about.
import { addPoint } from '../../../src/lib/gps';
import { fixTime, liveStep, readLive, readLiveAt, startLive, DEFAULT_RUN_SETUP, type LiveRun } from '../../../src/lib/run';
import type { Trace, TraceFix } from './traces';

/** What happened to one fix: kept, or the reject or hold reason. */
export type FixFate = { fix: TraceFix; t: number; fate: string; distanceM: number };

export type ReplayResult = {
  fates: FixFate[];
  /** The screen every second from the first fix: [ms, distance m, current pace s/m or null]. */
  ticks: Array<{ at: number; distanceM: number; pace: number | null }>;
  /** The distance saved at End. */
  endM: number;
  run: LiveRun;
};

const MOVING_MPS = 1.2;

/** Feed every fix in arrival order, read the screen each second, end the run after the last fix. */
export function replay(trace: Trace, opts: { autoPause?: boolean } = {}): ReplayResult {
  let run = startLive({ id: 'replay', now: trace.t0, setup: { ...DEFAULT_RUN_SETUP, autoPause: opts.autoPause ?? true }, unit: 'km', autoPause: opts.autoPause ?? true });
  const fixes = [...trace.fixes].sort((a, b) => a.arrival - b.arrival);
  const fates: FixFate[] = [];
  const ticks: ReplayResult['ticks'] = [];
  const last = fixes[fixes.length - 1]?.arrival ?? trace.t0;
  let i = 0;
  for (let at = trace.t0; at <= last + 1000; at += 1000) {
    for (; i < fixes.length && fixes[i]!.arrival <= at; i++) {
      const f = fixes[i]!;
      const point = { lat: f.lat, lng: f.lng, accuracy: f.accuracy, t: fixTime(f.stamp, f.arrival) };
      const { event } = addPoint(run.tracker, point);
      run = liveStep(run, { type: 'fix', point, now: f.arrival });
      const fate = event.type === 'rejected' ? `rejected:${event.reason}` : event.type === 'held' ? `held:${event.reason}` : 'kept';
      fates.push({ fix: f, t: point.t, fate, distanceM: readLive(run).distanceM });
    }
    const r = readLiveAt(run, at);
    ticks.push({ at, distanceM: r.distanceM, pace: r.currentPace });
  }
  const ended = liveStep(run, { type: 'pause', now: last + 1000 });
  return { fates, ticks, endM: readLive(ended).distanceM, run: ended };
}

export type Metrics = {
  name: string;
  trueM: number;
  endM: number;
  distErrPct: number;
  /** Longest stretch the shown distance stood still while moving with fixes arriving that did not move it. */
  frozenSec: number;
  /** What the fixes in that stretch were (the most common fate). */
  frozenCause: string | null;
  /** Longest stretch between two changes of the shown distance while moving, whatever the cause (info). */
  waitSec: number;
  /** Seconds from the first fix until a current pace shows (Infinity: never). */
  paceFirstSec: number;
  /** How far that first pace was from the truth, percent. */
  paceFirstErrPct: number | null;
  /** Seconds until the shown pace is within 10% of the new true pace after a speed change (worst change). */
  followSec: number | null;
  /** Distance added while standing at the light, once the 8 s standing rule (plus 2 s) had time to see it. */
  standingAddedM: number | null;
  /** Fixes by fate. */
  fates: Record<string, number>;
  /** Good fixes held as "standing" while really moving at 1.2 m/s or more. */
  stillWhileMoving: number;
};

const movingThroughout = (trace: Trace, fromMs: number, toMs: number): boolean => {
  const truth = trace.truth!;
  for (const w of [truth.tunnel, truth.stop]) if (w && fromMs < trace.t0 + w[1] * 1000 && toMs > trace.t0 + w[0] * 1000) return false;
  for (let ms = fromMs; ms <= toMs; ms += 500) if (truth.speedAt((ms - trace.t0) / 1000) < MOVING_MPS) return false;
  return true;
};

/** The pass rule numbers of one replayed trace (it must have a truth). */
export function measure(trace: Trace, r: ReplayResult = replay(trace)): Metrics {
  const truth = trace.truth!;
  const trueM = truth.distanceAt(truth.durationSec);
  const fates: Record<string, number> = {};
  let stillWhileMoving = 0;
  for (const f of r.fates) {
    fates[f.fate] = (fates[f.fate] ?? 0) + 1;
    if (f.fate === 'held:still' && truth.speedAt((f.fix.stamp - trace.t0) / 1000) >= MOVING_MPS) stillWhileMoving++;
  }

  // Freezes, read off the screen each second: a stretch of moving seconds (1.2 m/s or more, outside
  // the tunnel and the light) in which the shown distance did not change although fixes arrived.
  let frozenSec = 0;
  let frozenCause: string | null = null;
  let waitSec = 0;
  let from: number | null = null;
  let prevM: number | null = null;
  let k = 0;
  let inStreak: string[] = [];
  for (const tick of r.ticks) {
    const arrived: string[] = [];
    for (; k < r.fates.length && r.fates[k]!.fix.arrival <= tick.at; k++) arrived.push(r.fates[k]!.fate);
    const moving = movingThroughout(trace, tick.at - 1000, tick.at);
    if (!moving || prevM === null || tick.distanceM !== prevM || from === null) {
      from = moving ? tick.at : null;
      inStreak = [];
    } else {
      inStreak.push(...arrived.map((f) => (f === 'kept' ? 'kept, no distance' : f)));
      const span = (tick.at - from) / 1000;
      waitSec = Math.max(waitSec, span);
      if (inStreak.length && span > frozenSec) {
        frozenSec = span;
        const counts = new Map<string, number>();
        for (const w of inStreak) counts.set(w, (counts.get(w) ?? 0) + 1);
        frozenCause = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      }
    }
    prevM = tick.distanceM;
  }

  const tickAt = (sec: number) => r.ticks.find((t) => t.at >= trace.t0 + sec * 1000);
  const first = r.ticks.find((t) => t.pace !== null);
  const paceFirstSec = first ? (first.at - trace.t0) / 1000 : Infinity;
  const truePace = (sec: number) => 1 / truth.speedAt(sec);
  const paceFirstErrPct = first ? (Math.abs(first.pace! - truePace((first.at - trace.t0) / 1000)) / truePace((first.at - trace.t0) / 1000)) * 100 : null;
  let followSec: number | null = null;
  for (const c of truth.changes) {
    const want = truePace(c + 0.5);
    const hit = r.ticks.find((t) => t.at >= trace.t0 + c * 1000 && t.pace !== null && Math.abs(t.pace - want) / want <= 0.1);
    const sec = hit ? (hit.at - trace.t0) / 1000 - c : Infinity;
    followSec = Math.max(followSec ?? 0, sec);
  }
  const standingAddedM = truth.stop ? (tickAt(truth.stop[1])?.distanceM ?? 0) - (tickAt(truth.stop[0] + 10)?.distanceM ?? 0) : null;
  return {
    name: trace.name,
    trueM,
    endM: r.endM,
    distErrPct: ((r.endM - trueM) / trueM) * 100,
    frozenSec,
    frozenCause,
    waitSec,
    paceFirstSec,
    paceFirstErrPct,
    followSec,
    standingAddedM,
    fates,
    stillWhileMoving,
  };
}
