// Personal records from finished runs (PLAN 4.6, SPEC 12.9). Pure. The board is the best each
// distance was ever run; a moment is only the record this run newly set, and only when the
// improvement is large enough to be sure of (a second on the clock, 10 m of distance).
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../intake/answers';
import { METERS_PER_MILE } from '../gps';
import { formatElapsed } from '../timer';
import type { Moment } from '../../ui/celebrate/types';
import { bestEffortSec } from './efforts';
import { distanceWithUnit, formatDistance } from './format';
import { runVerdict } from './summary';

/** The standard half marathon, 21.0975 km. */
export const HALF_MARATHON_M = 21_097.5;

/**
 * A new longest run has to be this much farther than the old one before the finish screen
 * celebrates it. GPS that passed the filter can still wander by meters; 10 m is past that noise.
 * The records list still shows the true longest, however small the difference.
 */
export const LONGEST_STEP_M = 10;

export type EffortId = 'mile' | '5k' | '10k' | 'half' | 'long';

type Def = { id: EffortId; title: string; meters: number; distance: boolean };

/** The five records, in the order the list shows them. `meters` is 0 for the longest run. */
export const RECORD_DEFS: readonly Def[] = [
  { id: 'mile', title: 'Fastest mile', meters: METERS_PER_MILE, distance: false },
  { id: '5k', title: 'Fastest 5 km', meters: 5_000, distance: false },
  { id: '10k', title: 'Fastest 10 km', meters: 10_000, distance: false },
  { id: 'half', title: 'Fastest half marathon', meters: HALF_MARATHON_M, distance: false },
  { id: 'long', title: 'Longest run', meters: 0, distance: true },
];

/** How loudly a first of each kind asks for the screen. A first longest loses to any real distance record. */
const FIRST_WEIGHT: Record<EffortId, number> = { mile: 3, '5k': 3.6, '10k': 4.5, half: 6, long: 1.1 };
/** How loudly an improvement asks, multiplied by how much faster or farther it is. */
const RARITY: Record<EffortId, number> = { mile: 1, '5k': 1.2, '10k': 1.5, half: 2, long: 1.3 };

export type RunRecord = { id: EffortId; title: string; runId: string; value: number; endedAt: number };
export type RecordSlot = { id: EffortId; title: string; hit: RunRecord | null };

/** Finished, and long enough that its distance is not GPS noise. */
export const measurableRuns = (runs: readonly Run[]): Run[] => runs.filter((r) => r.endedAt !== undefined && runVerdict(r) === 'ok');

/** `a` was finished before `b` (the same instant: the one that started first, then the smaller id). */
export function happenedBefore(a: Run, b: Run): boolean {
  const ta = a.endedAt ?? a.startedAt;
  const tb = b.endedAt ?? b.startedAt;
  return ta < tb || (ta === tb && (a.startedAt < b.startedAt || (a.startedAt === b.startedAt && a.id < b.id)));
}

function valueOf(run: Run, def: Def): number | null {
  if (def.distance) return run.distanceM > 0 ? run.distanceM : null;
  return bestEffortSec(run.points, run.gaps, def.meters);
}

/** Lower is better for a time; higher is better for the longest run. */
const better = (def: Def, a: number, b: number): boolean => (def.distance ? a > b + 1e-6 : a < b - 1e-3);

function holder(runs: readonly Run[], def: Def): RunRecord | null {
  let best: { run: Run; value: number } | null = null;
  for (const run of measurableRuns(runs)) {
    const value = valueOf(run, def);
    if (value === null) continue;
    if (!best || better(def, value, best.value) || (Math.abs(value - best.value) <= 1e-3 && happenedBefore(run, best.run))) best = { run, value };
  }
  if (!best?.run.endedAt) return null;
  return { id: def.id, title: def.title, runId: best.run.id, value: best.value, endedAt: best.run.endedAt };
}

/** One slot per record, empty when no finished run has covered it. */
export const recordBoard = (runs: readonly Run[]): RecordSlot[] => RECORD_DEFS.map((def) => ({ id: def.id, title: def.title, hit: holder(runs, def) }));

/** Titles of the records this run currently holds. */
export const titlesHeldBy = (run: Run, runs: readonly Run[]): string[] => recordBoard(runs).filter((s) => s.hit?.runId === run.id).map((s) => s.title);

/**
 * "3 s faster": the gap between the two clocks as shown (formatElapsed floors both), so the claim
 * always matches the two times on screen (PLAN 4.6a 6).
 */
export function fasterWords(prevSec: number, mineSec: number): string {
  const d = Math.floor(prevSec) - Math.floor(mineSec);
  if (d < 1) return '';
  return d < 60 ? `${d} s faster` : `${formatElapsed(d)} faster`;
}

function farther(deltaM: number, unit: DistanceUnit): string {
  const shown = formatDistance(deltaM, unit);
  return shown === '0.00' ? '' : `+${shown} ${unit}`;
}

/**
 * The records this run newly set, as celebration moments. Every one asks for the full screen
 * (PLAN 5.2: run records use the BIG tier); the celebration engine shows one and cards the rest.
 * A time that is not a full second faster, or a longest run under LONGEST_STEP_M farther, is still
 * the record on the board and is not celebrated.
 */
export function recordMoments(run: Run, runs: readonly Run[], unit: DistanceUnit): Moment[] {
  if (run.endedAt === undefined || runVerdict(run) !== 'ok') return [];
  const others = measurableRuns(runs).filter((r) => r.id !== run.id);
  const out: Moment[] = [];
  for (const def of RECORD_DEFS) {
    const mine = valueOf(run, def);
    if (mine === null) continue;
    let prev: number | null = null;
    for (const other of others) {
      const v = valueOf(other, def);
      if (v === null) continue;
      if (prev === null || better(def, v, prev)) prev = v;
    }
    if (prev !== null && !better(def, mine, prev)) continue;
    const gain = prev === null ? null : def.distance ? mine - prev : prev - mine;
    if (gain !== null && (def.distance ? gain < LONGEST_STEP_M : gain < 1)) continue;
    const hero = def.distance ? distanceWithUnit(mine, unit) : formatElapsed(mine);
    const caption = def.distance ? 'Your longest' : 'Best ever';
    const plus = gain === null || prev === null ? '' : def.distance ? farther(gain, unit) : fasterWords(prev, mine);
    const weight = prev === null || !(gain! > 0) ? FIRST_WEIGHT[def.id] : (def.distance ? mine / prev : prev / mine) * RARITY[def.id];
    out.push({
      id: `run:${run.id}:${def.id}`,
      kind: 'run_record',
      big: true,
      weight,
      title: def.title,
      hero,
      caption,
      detail: `${hero}, ${caption.charAt(0).toLowerCase()}${caption.slice(1)}`,
      ...(plus ? { plus } : {}),
    });
  }
  return out;
}
