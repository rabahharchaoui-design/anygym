// Personal records for the finish screen (PLAN 1.7c, SPEC 21.1). Pure: no Dexie, no React.
// Only from real history, never invented:
//   - No earlier work set of this exercise (same load kind, any unit) → no record at all.
//   - Heaviest: this workout's heaviest working weight beats every earlier working weight, all
//     of them compared in today's unit through load.ts (a 100 kg lift beats a 110 lb one).
//     Not for holds or bodyweight without added weight (there is no weight to compare).
//   - Most reps at a weight: this workout did more reps at exactly a weight lifted before
//     (same load, load.ts sameLoad), and no earlier set at that weight or heavier, in any unit,
//     had as many reps. One per exercise, the heaviest such weight.
// Working sets only (kind 'work', to failure included): warm ups and drop sets never count.
// Weights are compared through load.ts (pickedWeight, sameLoad); no arithmetic here.
import type { Load } from '../db/types';
import { comparableWeight, formatWeight, heldWeightOf, sameLoad } from './load';
import type { PastSet } from './progression';

export type RecordKind = 'heaviest' | 'most_reps';

export type PersonalRecord = { exerciseId: string; kind: RecordKind; text: string };

type Work = { reps?: number; load: Load };

const working = (sets: readonly PastSet[], kind: Load['kind'], unit?: Load['unit']): Work[] =>
  sets.filter((s) => s.kind === 'work' && s.load.kind === kind && (unit === undefined || s.load.unit === unit)) as Work[];

const weightText = (load: Load): string => {
  if (load.kind === 'dumbbell_each') return `${formatWeight(heldWeightOf(load)!, load.unit)} each`;
  if (load.kind === 'bodyweight') return load.added ? `+${formatWeight(load.added, load.unit)}` : 'bodyweight';
  return formatWeight(load.total, load.unit);
};

/**
 * Records for one exercise: `today` is this workout's sets, `before` every earlier set of it
 * (already keyed per gym and bar for machines and Smith by the caller, as in SPEC 6).
 */
export function recordsFor(exerciseId: string, name: string, today: readonly PastSet[], before: readonly PastSet[]): PersonalRecord[] {
  const first = today.find((s) => s.kind === 'work');
  if (!first || first.load.kind === 'timed') return [];
  const kind = first.load.kind;
  const unit = first.load.unit;
  const w = (load: Load) => comparableWeight(load, unit);
  const now = working(today, kind, unit);
  const past = working(before, kind);
  if (!now.length || !past.length) return [];
  const out: PersonalRecord[] = [];

  const hasWeight = kind !== 'bodyweight' || now.some((s) => (s.load.added ?? 0) > 0);
  if (hasWeight) {
    const top = now.reduce((a, b) => (w(b.load) > w(a.load) ? b : a));
    const pastTop = Math.max(...past.map((s) => w(s.load)));
    if (w(top.load) > pastTop) out.push({ exerciseId, kind: 'heaviest', text: `${name}: heaviest ever, ${weightText(top.load)}` });
  }

  let best: { load: Load; reps: number } | null = null;
  for (const s of now) {
    const reps = s.reps ?? 0;
    // Lifted before at exactly this weight, and never as many reps at this weight or heavier.
    if (!past.some((p) => sameLoad(p.load, s.load))) continue;
    if (past.some((p) => w(p.load) >= w(s.load) && (p.reps ?? 0) >= reps)) continue;
    if (!best || w(s.load) > w(best.load) || (w(s.load) === w(best.load) && reps > best.reps)) best = { load: s.load, reps };
  }
  if (best) out.push({ exerciseId, kind: 'most_reps', text: `${name}: most reps at ${weightText(best.load)}, ${best.reps}` });
  return out;
}

/**
 * The best set of one exercise in a workout, for the finish screen list (ux-critic, PLAN 1.7e):
 * working sets when there are any (else every set); a hold is the longest, everything else the
 * heaviest (compared through load.ts), then the most reps at that weight. Undefined for no sets.
 */
export function bestSetOf<T extends { kind: PastSet['kind']; reps?: number; seconds?: number; load?: Load }>(sets: readonly T[]): T | undefined {
  const work = sets.filter((s) => s.kind === 'work');
  const pool = work.length ? work : sets;
  const first = pool[0];
  if (!first) return undefined;
  const unit = first.load?.unit ?? 'lb';
  const weight = (s: T) => (s.load ? comparableWeight(s.load, unit) : 0);
  let best = first;
  for (const s of pool.slice(1)) {
    if (first.load?.kind === 'timed' || (s.reps === undefined && s.seconds !== undefined)) {
      if ((s.seconds ?? 0) > (best.seconds ?? 0)) best = s;
      continue;
    }
    const w = weight(s);
    const b = weight(best);
    if (w > b || (w === b && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
  }
  return best;
}
