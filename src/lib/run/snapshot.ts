// A live run written down and read back (PLAN 4.3, SPEC 13.3: "app killed mid run: run restores,
// gap recorded"). Pure. The run row holds the track; the snapshot holds the rest of the state, so a
// run that comes back continues with the very same numbers. It always comes back paused: the time
// away is a pause, never moving time, and the line breaks there.
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../intake/answers';
import { fromRunPoint, pauseRun, processTrack, readTracker, toRunGaps, toRunPoint, unitMeters, type TrackBreak, type TrackInput, type TrackerState } from '../gps';
import { INTERVAL_PRESETS, RUN_TYPES, type IntervalPresetId, type RunType } from './goal';
import type { LiveRun, RunGoal } from './live';

export const SNAPSHOT_VERSION = 1;

export type RunSnapshot = {
  v: typeof SNAPSHOT_VERSION;
  id: string;
  type: RunType;
  goal: RunGoal | null;
  intervalPreset: IntervalPresetId | null;
  unit: DistanceUnit;
  tracker: TrackerState;
  breaks: TrackBreak[];
};

/** The run as its row (SPEC 12.11), without an end: saved every few seconds while it runs. */
export function liveRow(run: LiveRun): Run {
  const r = readTracker(run.tracker);
  return {
    id: run.id,
    startedAt: run.startedAt,
    type: run.type,
    ...(run.goal ? { goal: run.goal.label } : {}),
    movingSec: r.movingSec,
    elapsedSec: r.elapsedSec,
    distanceM: r.distanceM,
    points: run.points.map(toRunPoint),
    gaps: toRunGaps(run.breaks),
    splits: r.splits.full.map((s) => s.sec),
    splitGaps: r.splits.full.filter((s) => s.gap).map((s) => s.index),
    splitUnit: run.unit,
    timedM: run.tracker.timedM,
    ...(run.intervalPreset ? { intervalPreset: run.intervalPreset } : {}),
  };
}

export const toSnapshot = (run: LiveRun): RunSnapshot => ({ v: SNAPSHOT_VERSION, id: run.id, type: run.type, goal: run.goal, intervalPreset: run.intervalPreset, unit: run.unit, tracker: run.tracker, breaks: run.breaks });

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isType = (v: unknown): v is RunType => RUN_TYPES.some((t) => t.value === v);
const isPreset = (v: unknown): v is IntervalPresetId => INTERVAL_PRESETS.some((p) => p.id === v);

function goalFrom(v: unknown): RunGoal | null {
  const g = v as Partial<{ kind: string; meters: number; seconds: number; label: string }> | null;
  if (!g || typeof g !== 'object' || typeof g.label !== 'string') return null;
  if (g.kind === 'distance' && num(g.meters) && g.meters > 0) return { kind: 'distance', meters: g.meters, label: g.label };
  if (g.kind === 'time' && num(g.seconds) && g.seconds > 0) return { kind: 'time', seconds: g.seconds, label: g.label };
  return null;
}

function trackerFrom(v: unknown): TrackerState | null {
  const t = v as Partial<TrackerState> | null;
  if (!t || typeof t !== 'object') return null;
  const ok = num(t.splitM) && t.splitM >= 1 && num(t.distanceM) && num(t.timedM) && num(t.movingMs) && typeof t.autoPause === 'boolean' && Array.isArray(t.recent) && Array.isArray(t.pace) && !!t.splits && Array.isArray(t.splits.full) && !!t.splits.open;
  return ok ? (t as TrackerState) : null;
}

/** Reads a stored snapshot (JSON text). Null when it is missing, broken or belongs to another run. */
export function parseSnapshot(text: string | null | undefined, runId: string): RunSnapshot | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text) as Partial<RunSnapshot> | null;
    if (!s || s.v !== SNAPSHOT_VERSION || s.id !== runId || !isType(s.type) || (s.unit !== 'km' && s.unit !== 'mi')) return null;
    const tracker = trackerFrom(s.tracker);
    if (!tracker || !Array.isArray(s.breaks)) return null;
    return { v: SNAPSHOT_VERSION, id: runId, type: s.type, goal: goalFrom(s.goal), intervalPreset: isPreset(s.intervalPreset) ? s.intervalPreset : null, unit: s.unit, tracker, breaks: s.breaks };
  } catch {
    return null;
  }
}

/**
 * The track alone, replayed (no snapshot to go by): every stored break becomes a pause, so no
 * distance is ever added across one. Less exact than the snapshot (time spent standing between two
 * recorded points counts), which is why it is only the fallback.
 */
function replay(row: Run, unit: DistanceUnit, autoPause: boolean): { tracker: TrackerState; breaks: TrackBreak[] } {
  const after = new Map(row.gaps.map(([fromT, toT]) => [toT, fromT]));
  const inputs: TrackInput[] = [];
  for (const p of row.points) {
    if (after.has(p[2])) inputs.push({ type: 'pause' }, { type: 'resume' });
    inputs.push({ type: 'point', point: fromRunPoint(p) });
  }
  const out = processTrack(inputs, { splitM: unitMeters(unit), autoPause });
  return { tracker: out.state, breaks: out.breaks };
}

/**
 * A run that was still going when the app closed, back as a live run: paused by hand, marked
 * `closed`. With a snapshot it is exact; without one the track is replayed.
 */
export function restoreLive(row: Run, snapshot: RunSnapshot | null, fallback: { unit: DistanceUnit; autoPause: boolean }): LiveRun {
  const points = row.points.map(fromRunPoint);
  const last = points[points.length - 1] ?? null;
  // The snapshot is only trusted when it ends where the stored track ends.
  const fits = snapshot && (snapshot.tracker.lastRecorded?.t ?? null) === (last?.t ?? null);
  const unit = snapshot?.unit ?? fallback.unit;
  const { tracker, breaks } = fits ? snapshot : replay(row, unit, fallback.autoPause);
  return {
    id: row.id,
    startedAt: row.startedAt,
    type: snapshot?.type ?? (isType(row.type) ? row.type : 'free'),
    goal: snapshot?.goal ?? null,
    intervalPreset: snapshot?.intervalPreset ?? (isPreset(row.intervalPreset) ? row.intervalPreset : null),
    unit,
    tracker: pauseRun(tracker),
    points,
    breaks,
    here: last,
    closed: true,
    gps: null,
  };
}
