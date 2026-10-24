// The set table of the exercise view (PLAN 1.7c, SPEC 20.2, 21.1). Pure: no Dexie, no React.
// Rows are the exercise's logged sets in order, then the sets still to do, ALREADY FILLED:
//   a row's own draft (the user changed it) → the engine's target for that set (progress().perSet)
//   → the last set logged in this workout (rebuilt on today's equipment) → the engine's next load
//   → a load that is certain without asking (just you, a hold) → empty (the first tap asks).
// No weight math here: every Load comes from load.ts through the callbacks the screen passes.
import type { Load, SetKind } from '../db/types';
import type { Draft } from './drafts';
import { cellWeight, formatAmount, platesOnly } from './load';
import type { PastSet, Progression, SetLine } from './progression';

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

/** Tap order on the set number (SPEC 21.1): normal → W → D → F → normal. */
export const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

export function nextSetType(t: SetType): SetType {
  return SET_TYPES[(SET_TYPES.indexOf(t) + 1) % SET_TYPES.length]!;
}

/** The letter on the set number: '' for a normal set. */
export const SET_TYPE_LETTER: Record<SetType, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };

/** Plain words for screen readers and the type sheet. */
export const SET_TYPE_WORDS: Record<SetType, string> = { normal: 'Normal set', warmup: 'Warm up', drop: 'Drop set', failure: 'To failure' };

/** How a type is stored (SPEC 2 kinds plus the failure flag). Warm ups never count for progress. */
export function storedType(t: SetType): { kind: SetKind; failure: boolean } {
  if (t === 'warmup') return { kind: 'warmup', failure: false };
  if (t === 'drop') return { kind: 'drop', failure: false };
  return { kind: 'work', failure: t === 'failure' };
}

export function typeOfSet(set: { kind: SetKind; failure?: boolean }): SetType {
  if (set.kind === 'warmup') return 'warmup';
  if (set.kind === 'drop') return 'drop';
  return set.failure ? 'failure' : 'normal';
}

/** Drafts of one row: `${exerciseId}#${index}` in the draft store (index = 0 based set number). */
export const rowKey = (exerciseId: string, index: number) => `${exerciseId}#${index}`;

export type PendingRow = {
  /** 0 based set number. */
  index: number;
  /** What the ✓ logs; null = nothing loadable picked yet (the weight cell asks). */
  load: Load | null;
  /** Plates per side on a bar or horn, kept while the base weight is unknown ("40 + bar"). */
  plates: number[];
  reps?: number;
  seconds?: number;
  type: SetType;
  /** What this set was last workout: from the last workout's complete sets (warm ups included). */
  lastTime?: SetLine | PastSet;
  /** True when the user changed this row (its draft). */
  edited: boolean;
};

export type BuildInput = {
  /** Rows in the table: the plan's sets (or the quick default), more if more were logged or added. */
  count: number;
  /** Sets already logged for this exercise in this workout, logged order. */
  logged: ReadonlyArray<{ reps?: number; seconds?: number; load?: Load }>;
  progression: Progression | undefined;
  draftOf: (index: number) => Draft | null;
  /** Rebuilds a picked load on today's equipment (exerciseLoad.currentLoad): null when not loadable. */
  rebuild: (picked: Load | null, plates: readonly number[]) => Load | null;
  /** An earlier load made again here (exerciseLoad.prefillLoad), or null. */
  carry: (prev: Load | undefined) => Load | null;
  /** A load certain without asking (bodyweight, a hold), else null. */
  certain: Load | null;
  /** Reps when nothing else says (the bottom of the plan's range, else the quick default). */
  defaultReps?: number;
  /** The plan's hold for timed rows, if it gives one. */
  planSeconds?: number;
  defaultType: SetType;
  /**
   * The last workout's sets exactly as done, in order, warm ups and drops included (PLAN 1.7c), so
   * LAST TIME lines up row by row. Without it the progression's working sets are used.
   */
  lastSets?: readonly PastSet[] | null;
};

/** The rows still to do, filled as described at the top of this file. */
export function pendingRows(input: BuildInput): PendingRow[] {
  const { count, logged, progression, draftOf, rebuild, carry, certain } = input;
  const perSet = progression?.perSet ?? [];
  const lastLogged = logged[logged.length - 1];
  const out: PendingRow[] = [];
  for (let i = logged.length; i < count; i++) {
    const target = perSet[i]?.target ?? perSet[perSet.length - 1]?.target;
    const lastTime = input.lastSets !== undefined ? (input.lastSets?.[i] ?? undefined) : (perSet[i]?.lastTime ?? progression?.lastTime?.sets[i]);
    const d = draftOf(i);
    let load: Load | null;
    let plates: number[];
    if (d) {
      plates = d.plates ?? d.load?.perSide ?? [];
      load = rebuild(d.load, plates);
    } else {
      const fromTarget = target?.load ? rebuild(target.load, target.load.perSide ?? []) : null;
      load = fromTarget ?? carry(lastLogged?.load) ?? (progression?.next.load ? rebuild(progression.next.load, progression.next.load.perSide ?? []) : null) ?? certain;
      plates = load?.perSide ?? [];
    }
    const reps = d?.reps ?? target?.reps ?? lastLogged?.reps ?? input.defaultReps;
    // A hold the plan prescribes beats last time's hold (PLAN 1.7c); last time stays in LAST TIME.
    const seconds = d?.seconds ?? input.planSeconds ?? target?.seconds;
    const row: PendingRow = { index: i, load, plates, type: d?.type ?? input.defaultType, edited: !!d };
    if (reps !== undefined) row.reps = reps;
    if (seconds !== undefined) row.seconds = seconds;
    if (lastTime) row.lastTime = lastTime;
    out.push(row);
  }
  return out;
}

/**
 * After logging pending row `n` while `k` sets were logged: the rows between move down one
 * place, so every row keeps what it showed. Returns the drafts to write (index → row values);
 * the logged row's own draft is cleared by the caller. Nothing moves when n === k.
 */
export function shiftAfterLog(rows: PendingRow[], k: number, n: number): Array<{ index: number; row: PendingRow }> {
  if (n <= k) return [];
  const byIndex = new Map(rows.map((r) => [r.index, r]));
  const out: Array<{ index: number; row: PendingRow }> = [];
  for (let j = k + 1; j <= n; j++) {
    const from = byIndex.get(j - 1);
    if (from) out.push({ index: j, row: { ...from, index: j } });
  }
  return out;
}

/** A row's values as a draft (to move a row that was showing its target). */
export function rowDraft(r: PendingRow, id: string): Draft {
  const d: Draft = { id, load: r.load, plates: r.plates, type: r.type };
  if (r.reps !== undefined) d.reps = r.reps;
  if (r.seconds !== undefined) d.seconds = r.seconds;
  return d;
}

/**
 * When a delayed write of pending row `n` lands (`k` sets were logged when it was checked), the
 * drafts to write, read from the drafts AS THEY ARE NOW (PLAN 1.7c): edits made during the write
 * are kept. The rows between move down one place (a row that had no draft keeps what it showed,
 * from `snapshot`). The logged row's own draft is used up, unless it was checked in order and
 * edited during the write: then that newer edit moves on to the next set, like the old card.
 * Returns index → draft (null = clear).
 */
export function settleRows(
  k: number,
  n: number,
  submittedRev: number | undefined,
  read: (index: number) => Draft | null,
  snapshot: readonly PendingRow[],
  nextId: string,
): Array<{ index: number; draft: Draft | null }> {
  const byIndex = new Map(snapshot.map((r) => [r.index, r]));
  const now = new Map<number, Draft | null>();
  for (let j = k; j <= n + 1; j++) now.set(j, read(j));
  const out: Array<{ index: number; draft: Draft | null }> = [];
  if (n > k) {
    for (let j = n; j >= k + 1; j--) {
      const prev = byIndex.get(j - 1);
      const src = now.get(j - 1) ?? (prev ? rowDraft(prev, nextId) : null);
      out.push({ index: j, draft: src });
    }
    out.push({ index: k, draft: null });
    return out;
  }
  const mine = now.get(n);
  const editedDuring = !!mine && mine.rev !== submittedRev;
  if (editedDuring && !now.get(n + 1)) out.push({ index: n + 1, draft: { ...mine!, id: nextId } });
  out.push({ index: n, draft: null });
  return out;
}

/**
 * Why a row's ✓ cannot log yet, in one plain sentence; null when it can. `baseUnknown`: the bar
 * (or a plate machine's starting weight) is not known yet, so even plates cannot make a weight.
 */
export function blockedReason(kind: Load['kind'], row: Pick<PendingRow, 'load' | 'reps' | 'seconds'>, liveSeconds = 0, baseUnknown = false): string | null {
  if (row.load === null) {
    if (baseUnknown && kind === 'barbell') return 'Set the bar weight first';
    if (baseUnknown && kind === 'plate_machine') return 'Set the starting weight first';
    return 'Pick a weight';
  }
  if (kind === 'timed') return liveSeconds > 0 || (row.seconds ?? 0) > 0 ? null : 'Start the timer';
  return (row.reps ?? 0) > 0 ? null : 'Pick the reps';
}

// ---------------------------------------------------------------- words for the cells

/**
 * The WEIGHT cell: "185", "30" (one dumbbell), "+25" (added to bodyweight), "Just you", "40 + bar"
 * while the bar weight is unknown, '' when nothing is picked. Units live in the column header.
 */
export function weightCell(kind: Load['kind'], load: Load | null, plates: readonly number[], unit: Load['unit']): string {
  if (load) {
    if (load.kind === 'bodyweight') return load.added ? `+${formatAmount(load.added)}` : 'Just you';
    const w = cellWeight(load);
    return w === null ? '' : formatAmount(w);
  }
  if ((kind === 'barbell' || kind === 'plate_machine') && plates.length) {
    return `${formatAmount(platesOnly(plates, unit))} + ${kind === 'barbell' ? 'bar' : 'start'}`;
  }
  return '';
}

/**
 * The LAST TIME cell: "12 × 185", "12 × 30", "12 reps", "12 + 25", "45 s"; a warm up or drop
 * set is tagged ("W 10 × 135"), and a weight in the other unit says so ("12 × 185 lb" in a kg gym).
 */
export function lastTimeCell(s: SetLine | PastSet | undefined, activeUnit?: Load['unit']): string {
  if (!s) return '';
  const kind = 'kind' in s ? s.kind : 'work';
  const tag = kind === 'warmup' ? 'W ' : kind === 'drop' ? 'D ' : '';
  const unit = activeUnit && s.load.unit !== activeUnit ? ` ${s.load.unit}` : '';
  if (s.load.kind === 'timed') return `${tag}${s.seconds ?? 0} s`;
  const reps = s.reps ?? 0;
  if (s.load.kind === 'bodyweight') return s.load.added ? `${tag}${reps} + ${formatAmount(s.load.added)}${unit}` : `${tag}${reps} reps`;
  const w = cellWeight(s.load);
  return w === null ? `${tag}${reps}` : `${tag}${reps} × ${formatAmount(w)}${unit}`;
}

/** The WEIGHT column header: "lb", "lb each" for dumbbells, "Added lb" for bodyweight. */
export function weightHeader(kind: Load['kind'], unit: Load['unit']): string {
  if (kind === 'dumbbell_each') return `${unit} each`;
  if (kind === 'bodyweight') return `+ ${unit}`;
  return unit;
}
