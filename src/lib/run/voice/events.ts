// What the voice coach has to say after one step of the run (PLAN 4.4): the run before the step and
// the run after it, compared. Pure. Nothing is remembered: a run that comes back after the app
// closed is simply the new "before", so an old cue is never said twice, and a switch that happens
// in any step is always seen.
import { splitPace, unitMeters } from '../../gps';
import { readIntervals } from '../intervals';
import { readLive, type LiveRun } from '../live';
import type { VoiceEvent } from './compose';

const fraction = (run: LiveRun, r: { distanceM: number; movingSec: number }): number => {
  const g = run.goal;
  if (!g) return 0;
  return g.kind === 'distance' ? r.distanceM / g.meters : r.movingSec / g.seconds;
};

/** The same hair as lib/run/progress: a goal of exactly 5 km is reached at "5.00". */
const REACHED = 1 - 1e-9;

export function runCues(before: LiveRun, after: LiveRun): VoiceEvent[] {
  if (before === after) return [];
  const out: VoiceEvent[] = [];
  const a = readLive(before);
  const b = readLive(after);

  // Pause and resume, by hand or by standing still.
  if (a.status !== 'paused' && b.status === 'paused') out.push({ type: 'paused' });
  else if (a.status === 'paused' && b.status !== 'paused') out.push({ type: 'resumed' });
  else if (a.status === 'running' && b.status === 'auto-paused') out.push({ type: 'auto-paused' });
  else if (a.status === 'auto-paused' && b.status === 'running') out.push({ type: 'resumed' });

  // Every split this step finished (a long step across a gap may finish several), in order. A split
  // that holds a GPS gap is said by its count only: its time is not known (PLAN 4.4b 10).
  for (let i = a.splits.full.length; i < b.splits.full.length; i++) {
    const split = b.splits.full[i]!;
    const movingSec = b.splits.full.slice(0, i + 1).reduce((sum, s) => sum + s.sec, 0);
    const pace = split.gap ? null : splitPace(split);
    out.push({ type: 'split', count: i + 1, unit: after.unit, movingSec: split.gap ? null : movingSec, paceSec: pace === null ? null : pace * unitMeters(after.unit) });
  }

  // Halfway and the goal itself, once each (the crossing).
  const g = after.goal;
  if (g) {
    const fa = fraction(before, a);
    const fb = fraction(after, b);
    const say = g.kind === 'distance' ? ({ kind: 'time', movingSec: b.movingSec } as const) : ({ kind: 'distance', meters: b.distanceM, unit: after.unit } as const);
    if (fa < REACHED && fb >= REACHED) out.push({ type: 'goal', say });
    else if (fa < 0.5 && fb >= 0.5) out.push({ type: 'halfway', say });
  }

  // Intervals: the block changed, or the last one ended.
  if (before.intervals && after.intervals) {
    const ia = readIntervals(before.intervals);
    const ib = readIntervals(after.intervals);
    if (ib.done && !ia.done) out.push({ type: 'intervals-done' });
    else if (!ib.done && ib.index !== ia.index && ib.block) out.push({ type: 'interval', name: ib.block.name, last: ib.lastRound && ib.index % after.intervals.plan.blocks.length === 0 });
  }
  return out;
}
