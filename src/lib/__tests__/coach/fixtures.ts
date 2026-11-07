// Shared builders for the coach tests (PLAN 3.8): lifts, workouts and gyms in lb and kg.
import type { Load, Unit } from '../../../db/types';
import { dumbbellLoad, loadAt, stackLoad, type LoadSetup } from '../../load';
import type { RepRange } from '../../progression';
import type { Pattern } from '../../swap';
import type { ChangeRecord, Effort, Lift, LiftSession, PlannedChange } from '../../coach';

export const LB: LoadSetup = { unit: 'lb', base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: { min: 5, max: 100, step: 5 }, stackStep: 5 };
export const KG: LoadSetup = { unit: 'kg', base: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'none', dumbbellRange: { min: 2, max: 40, step: 2 }, stackStep: 2.5 };
export const setupFor = (unit: Unit): LoadSetup => (unit === 'lb' ? LB : KG);

/** Wednesday 11 Nov 2026, noon: last week is Mon 2 to Sun 8 Nov. */
export const NOW = new Date(2026, 10, 11, 12).getTime();
export const DAY = 24 * 60 * 60 * 1000;
/** A local date in Nov 2026 at 18:00. */
export const nov = (d: number, h = 18) => new Date(2026, 10, d, h).getTime();

export const bar = (total: number, s: LoadSetup = LB): Load => {
  const l = loadAt('barbell', total, s);
  if (!l) throw new Error(`not loadable ${total}`);
  return l;
};
export const db = (each: number, unit: Unit = 'lb'): Load => dumbbellLoad(each, unit);
export const pin = (v: number, unit: Unit = 'lb'): Load => stackLoad(v, unit);

let seq = 0;
export function sess(date: number, reps: number[], load: Load, range: RepRange | null = [8, 12], effort?: Effort): LiftSession {
  return { sessionId: `s${seq++}`, date, sets: reps.map((r) => ({ reps: r, load })), range, ...(effort ? { effort } : {}) };
}

export function lift(over: Partial<Lift> & { sessions: LiftSession[] }): Lift {
  const loadKind = over.loadKind ?? (over.sessions[0]?.sets[0]?.load.kind ?? 'barbell');
  const exerciseId = over.exerciseId ?? 'barbell-back-squat';
  return {
    key: over.key ?? `${exerciseId}||${loadKind}`,
    exerciseId,
    name: over.name ?? 'Barbell Back Squat',
    loadKind,
    pattern: (over.pattern === undefined ? 'squat' : over.pattern) as Pattern | null,
    setup: over.setup === undefined ? LB : over.setup,
    sessions: over.sessions,
    ...(over.target ? { target: over.target } : {}),
    ...(over.variation ? { variation: over.variation } : {}),
    ...(over.scale !== undefined ? { scale: over.scale } : {}),
  };
}

export function record(c: PlannedChange, appliedAt: number, cardId = 'levelup:x', over: Partial<ChangeRecord> = {}): ChangeRecord {
  return { ...c, id: `c${seq++}`, cardId, weekKey: 'x', appliedAt, ...over };
}
