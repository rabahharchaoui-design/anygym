// Personal records for the finish screen (PLAN 1.7c, SPEC 21.1). Pure: no Dexie, no React.
// Only from real history, never invented:
//   - No earlier work set of this exercise (same load kind, any unit) → no record at all.
//   - Heaviest: this workout's heaviest working weight beats every earlier working weight, all
//     of them compared in today's unit through load.ts (a 100 kg lift beats a 110 lb one).
//     Not for holds or bodyweight without added weight (there is no weight to compare).
//   - Most reps at a weight: this workout did more reps at a resistance lifted before (load.ts
//     sameResistance: in any unit, after conversion; just you is the same in lb and kg), and no
//     earlier set at that weight or heavier, in any unit, had as many reps. One per exercise, the
//     heaviest such weight. Today's sets count in every unit (PLAN 1.7i).
// Working sets only (kind 'work', to failure included): warm ups and drop sets never count.
// Weights are compared through load.ts (comparableWeight, sameResistance); no arithmetic here.
import type { Load } from '../db/types';
import { beatsVolume, biggerGain, comparableWeight, formatWeight, gainRatio, heavierThan, heldWeightOf, sameResistance, setScore } from './load';
import type { PastSet } from './progression';

export type RecordKind = 'heaviest' | 'most_reps';

export type PersonalRecord = { exerciseId: string; kind: RecordKind; text: string };

type Work = { reps?: number; load: Load };

const working = (sets: readonly PastSet[], kind: Load['kind']): Work[] => sets.filter((s) => s.kind === 'work' && s.load.kind === kind) as Work[];

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
  const now = working(today, kind);
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
    if (!past.some((p) => sameResistance(p.load, s.load))) continue;
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

// ---------------------------------------------------------------- live PRs (PLAN 2.2e)
//
// A logged set is a PR the moment it beats this exercise's best so far: every earlier working set
// (`before`, keyed per gym and bar by the caller as for recordsFor) plus the working sets logged
// before it today, in order. Never on the first ever session (no earlier working set: no claim).
// Three ways to beat it, all compared through load.ts:
//   - volume:    best set volume, weight × reps (beatsVolume: the same weight needs more reps);
//   - heaviest:  heavier than every earlier set (heavierThan, never conversion noise);
//   - most_reps: more reps than any earlier set at this resistance or heavier, at a resistance
//                lifted before (bodyweight with nothing added: just you, the only way it counts).
// A tie is never a PR. No estimated max is shown (SPEC 6: no 1RM numbers in v1).

export type SetRecordKind = 'volume' | 'heaviest' | 'most_reps';

/** One set that set a record: which way (the biggest gain), by how much (a ratio), and in words. */
export type SetRecord = { setId: string; kind: SetRecordKind; gain: number; text: string };

export type RecordSet = { id: string; kind: PastSet['kind']; reps?: number; load: Load };

const RECORD_WORDS: Record<SetRecordKind, string> = { volume: 'best ever', heaviest: 'heaviest ever', most_reps: 'most reps at this weight' };

/** "185 lb × 6", "50 lb each × 8", "+25 lb × 8", "12 reps" (bodyweight, nothing added). */
export function recordSetText(s: { reps?: number; load: Load }): string {
  const reps = s.reps ?? 0;
  if (s.load.kind === 'bodyweight' && !(s.load.added ?? 0)) return `${reps} reps`;
  return `${weightText(s.load)} × ${reps}`;
}

/** The record sets among `today` (its working sets in logged order), see above. */
export function recordSets(today: readonly RecordSet[], before: readonly PastSet[]): SetRecord[] {
  const first = today.find((s) => s.kind === 'work');
  if (!first || first.load.kind === 'timed') return [];
  const kind = first.load.kind;
  const unit = first.load.unit;
  const w = (load: Load) => comparableWeight(load, unit);
  const pool: Work[] = working(before, kind);
  if (!pool.length) return [];
  const out: SetRecord[] = [];
  for (const s of today) {
    if (s.kind !== 'work' || s.load.kind !== kind) continue;
    const reps = s.reps ?? 0;
    if (reps > 0) {
      const hasWeight = kind !== 'bodyweight' || (s.load.added ?? 0) > 0;
      const wins: Array<{ kind: SetRecordKind; gain: number }> = [];
      if (hasWeight && pool.every((p) => beatsVolume(s, p, unit))) {
        wins.push({ kind: 'volume', gain: gainRatio(setScore(s, unit), Math.max(...pool.map((p) => setScore(p, unit)))) });
      }
      if (hasWeight && pool.every((p) => heavierThan(s.load, p.load, unit))) {
        wins.push({ kind: 'heaviest', gain: gainRatio(w(s.load), Math.max(...pool.map((p) => w(p.load)))) });
      }
      const same = pool.filter((p) => sameResistance(p.load, s.load));
      if (same.length && !pool.some((p) => !heavierThan(s.load, p.load, unit) && (p.reps ?? 0) >= reps)) {
        wins.push({ kind: 'most_reps', gain: gainRatio(reps, Math.max(...same.map((p) => p.reps ?? 0))) });
      }
      // The biggest gain names it; on a tie the order above (volume, heaviest, most reps).
      const top = wins.reduce<(typeof wins)[number] | null>((a, b) => (!a || biggerGain(b.gain, a.gain) ? b : a), null);
      if (top) out.push({ setId: s.id, kind: top.kind, gain: top.gain, text: `${recordSetText(s)}, ${RECORD_WORDS[top.kind]}` });
    }
    pool.push({ reps: s.reps, load: s.load });
  }
  return out;
}

/** The finish screen's lead line (PLAN 2.2e): the biggest real win of the workout, or null. */
export type Win = { exerciseId: string; setId: string; kind: SetRecordKind; text: string };

/**
 * The biggest win among each exercise's record sets (in workout order): the largest gain over its
 * own earlier best; a tie goes to the earlier one. "Barbell Bench Press 185 lb × 6, best ever".
 */
export function biggestWin(groups: ReadonlyArray<{ exerciseId: string; name: string; records: readonly SetRecord[] }>): Win | null {
  let best: { g: (typeof groups)[number]; r: SetRecord } | null = null;
  for (const g of groups) for (const r of g.records) if (!best || biggerGain(r.gain, best.r.gain)) best = { g, r };
  return best ? { exerciseId: best.g.exerciseId, setId: best.r.setId, kind: best.r.kind, text: `${best.g.name} ${best.r.text}` } : null;
}
