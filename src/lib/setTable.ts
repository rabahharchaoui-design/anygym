// The set table of the exercise view (PLAN 1.7c, SPEC 20.2, 21.1). Pure: no Dexie, no React.
// Rows are the exercise's logged sets in order, then the sets still to do, ALREADY FILLED:
//   a row's own draft (the user changed it) → the engine's target for that set (progress().perSet)
//   → the last set logged in this workout (rebuilt on today's equipment) → the engine's next load
//   → a load that is certain without asking (just you, a hold) → empty (the first tap asks).
// No weight math here: every Load comes from load.ts through the callbacks the screen passes.
import type { Load, SetKind, Unit } from '../db/types';
import type { Draft } from './drafts';
import { cellWeight, formatAmount, formatSetLine, platesOnly } from './load';
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

/**
 * Draft key of a pending row (PLAN 1.7h): `${exerciseId}@${slot}`, slot 0 = the first row still to
 * do. Slots count pending rows only, so deleting or putting back a logged set never moves a draft
 * away from its row; the row's own draft id is its stable identity (and the id it is logged with).
 */
export const rowKey = (exerciseId: string, slot: number) => `${exerciseId}@${slot}`;

/** Before 1.7h a row draft was keyed by its 0 based set number, logged sets included. */
export const legacyRowKey = (exerciseId: string, index: number) => `${exerciseId}#${index}`;

/** The exercise's pending row drafts by slot, from a workout's drafts; trailing empty slots dropped. */
export function slotsOf(drafts: ReadonlyMap<string, Draft>, exerciseId: string): Array<Draft | null> {
  const prefix = `${exerciseId}@`;
  const out: Array<Draft | null> = [];
  for (const [k, d] of drafts) {
    if (!k.startsWith(prefix)) continue;
    const slot = Number(k.slice(prefix.length));
    if (!Number.isInteger(slot) || slot < 0) continue;
    while (out.length <= slot) out.push(null);
    out[slot] = d;
  }
  return out;
}

/** The draft writes (key → draft, null = clear) that turn `before` into `after`. */
export function slotChanges(exerciseId: string, before: ReadonlyArray<Draft | null>, after: ReadonlyArray<Draft | null>): Map<string, Draft | null> {
  const out = new Map<string, Draft | null>();
  for (let j = 0; j < Math.max(before.length, after.length); j++) {
    const a = after[j] ?? null;
    if (a !== (before[j] ?? null)) out.set(rowKey(exerciseId, j), a);
  }
  return out;
}

/** Committed Log set writes: set id → the draft version it submitted (undefined: a set with no submission). */
export type Committed = ReadonlyMap<string, number | undefined>;

/**
 * The identity a row edited during its own Log set write continues under (PLAN 1.7j): derived
 * from the submitted id alone (A → A~1 → A~2), so it is durable by construction. A restart that
 * reconciles a stale copy of the original draft lands on exactly the id the newer values were
 * logged with, and finds it committed, instead of minting a fresh id that could log them again.
 */
export function successorOf(id: string): string {
  const m = /^(.*)~(\d+)$/.exec(id);
  return m ? `${m[1]}~${Number(m[2]) + 1}` : `${id}~1`;
}

/** Longest successor chain followed (a guard: real chains are one or two long). */
const MAX_CHAIN = 64;

/**
 * Reconciles pending row drafts with committed writes (PLAN 1.7h). A draft whose id committed is
 * used up when its version is the committed one or OLDER (a stale copy storage kept after a newer
 * version committed, PLAN 1.7i): its slot goes and the rows below move up one. Only a strictly
 * newer version (edited during the write) stays where it is under its successor id (successorOf,
 * PLAN 1.7j: it becomes the next set), and the drafts below keep their own slots: nothing is
 * overwritten or dropped. The chain is followed: a successor that committed too is used up the
 * same way. Returns the new slots, or null when nothing changed. `_newId` is unused (kept for callers).
 */
export function reconcileRows(slots: ReadonlyArray<Draft | null>, committed: Committed, _newId?: () => string): Array<Draft | null> | null {
  const out = [...slots];
  let changed = false;
  for (let j = out.length - 1; j >= 0; j--) {
    let d = out[j] ?? null;
    for (let hops = 0; d && committed.has(d.id) && hops < MAX_CHAIN; hops++) {
      changed = true;
      const rev = committed.get(d.id) ?? d.submitted ?? d.rev ?? 0;
      if ((d.rev ?? 0) <= rev) d = null;
      else {
        const { submitted: _done, ...kept } = d;
        d = { ...kept, id: successorOf(d.id) };
      }
    }
    if (out[j] && d === null) out.splice(j, 1);
    else out[j] = d;
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return changed ? out : null;
}

/** What a Log set write stores: the row's values at the tap. */
export type RowValues = { load: Load; reps?: number; seconds?: number; type: SetType };

/**
 * Before a Log set write of pending slot `slot` (PLAN 1.7h): the rows above it keep what they
 * show (rows with no draft get one with their values), and the row's id, values and version are
 * stored with its `submitted` mark. Returns the new slots and the submitted draft.
 */
export function markSubmitted(
  slots: ReadonlyArray<Draft | null>,
  rows: readonly PendingRow[],
  slot: number,
  values: RowValues,
  newId: () => string,
): { slots: Array<Draft | null>; draft: Draft } {
  const out = [...slots];
  while (out.length <= slot) out.push(null);
  for (let j = 0; j < slot; j++) if (!out[j] && rows[j]) out[j] = rowDraft(rows[j]!, newId());
  const base = out[slot] ?? { id: newId(), load: values.load };
  const draft: Draft = { ...base, load: values.load, plates: values.load.perSide ?? base.plates ?? [], unit: values.load.unit, type: values.type, submitted: base.rev ?? 0 };
  delete draft.reps;
  delete draft.seconds;
  if (values.reps !== undefined) draft.reps = values.reps;
  if (values.seconds !== undefined) draft.seconds = values.seconds;
  out[slot] = draft;
  return { slots: out, draft };
}

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
  /**
   * The row's own pick, kept as it was because it cannot be used here now (PLAN 1.7i): picked in
   * the other unit, or with a plate that is turned off. `load` is then null (nothing is logged)
   * until the user picks again; the cell shows this pick with its unit.
   */
  kept?: KeptPick;
};

export type KeptPick = { why: 'unit' | 'plate'; load: Load | null; plates: number[]; unit: Unit };

export type BuildInput = {
  /** Rows in the table: the plan's sets (or the quick default), more if more were logged or added. */
  count: number;
  /** Sets already logged for this exercise in this workout, logged order. */
  logged: ReadonlyArray<{ reps?: number; seconds?: number; load?: Load }>;
  /**
   * How many of `logged` count toward the planned sets (PLAN 1.7j: warm ups on a normal lift do
   * not), so the first row still to do gets the target of the first planned set not done yet.
   * Default: every logged set.
   */
  workLogged?: number;
  progression: Progression | undefined;
  draftOf: (index: number) => Draft | null;
  /** Rebuilds a picked load on today's equipment (exerciseLoad.currentLoad): null when not loadable. */
  rebuild: (picked: Load | null, plates: readonly number[]) => Load | null;
  /** An earlier load made again here (exerciseLoad.prefillLoad), or null. */
  carry: (prev: Load | undefined) => Load | null;
  /** A load certain without asking (bodyweight, a hold), else null. */
  certain: Load | null;
  /** Today's unit (the gym's). */
  unit?: Unit;
  /** Why a row's own draft cannot be used here now (exerciseLoad.pickProblem), else null. */
  stale?: (d: Draft) => 'unit' | 'plate' | null;
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
  const shift = logged.length - Math.min(logged.length, Math.max(0, input.workLogged ?? logged.length));
  const out: PendingRow[] = [];
  for (let i = logged.length; i < count; i++) {
    const target = perSet[i - shift]?.target ?? perSet[perSet.length - 1]?.target;
    const lastTime = input.lastSets !== undefined ? (input.lastSets?.[i] ?? undefined) : (perSet[i]?.lastTime ?? progression?.lastTime?.sets[i]);
    const d = draftOf(i);
    let load: Load | null;
    let plates: number[];
    let kept: KeptPick | undefined;
    if (d) {
      plates = d.plates ?? d.load?.perSide ?? [];
      const why = input.stale?.(d) ?? null;
      if (why) {
        // Kept exactly as picked, never turned into a different loggable weight (PLAN 1.7i).
        load = null;
        kept = { why, load: d.load, plates: [...plates], unit: d.load?.unit ?? d.unit ?? input.unit ?? 'lb' };
      } else load = rebuild(d.load, plates);
    } else {
      const fromTarget = target?.load ? rebuild(target.load, target.load.perSide ?? []) : null;
      // "Just you" or a hold only when no history asks for a weight it cannot give here (PLAN 1.7j:
      // weighted dips last time in lb never become an unweighted row in a kg gym).
      const historyBlocks = !!progression?.lastTime && !progression.next.load;
      load = fromTarget ?? carry(lastLogged?.load) ?? (progression?.next.load ? rebuild(progression.next.load, progression.next.load.perSide ?? []) : null) ?? (historyBlocks ? null : certain);
      plates = load?.perSide ?? [];
    }
    const reps = d?.reps ?? target?.reps ?? lastLogged?.reps ?? input.defaultReps;
    // A hold the plan prescribes beats last time's hold (PLAN 1.7c); last time stays in LAST TIME.
    const seconds = d?.seconds ?? input.planSeconds ?? target?.seconds;
    const row: PendingRow = { index: i, load, plates, type: d?.type ?? input.defaultType, edited: !!d };
    if (kept) row.kept = kept;
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
 * Whether a logged set counts reps or seconds (PLAN 1.7h): from the set itself (its count, then its
 * load kind). Today's load type is only used for a record that says neither.
 */
export function countModeOf(set: { reps?: number; seconds?: number; load?: Pick<Load, 'kind'> }, todayKind?: Load['kind']): 'reps' | 'seconds' {
  if (set.reps !== undefined) return 'reps';
  if (set.seconds !== undefined) return 'seconds';
  const kind = set.load?.kind ?? todayKind;
  return kind === 'timed' ? 'seconds' : 'reps';
}

/**
 * Why a row's ✓ cannot log yet, in one plain sentence; null when it can. `baseUnknown`: the bar
 * (or a plate machine's starting weight) is not known yet, so even plates cannot make a weight.
 */
export function blockedReason(kind: Load['kind'], row: Pick<PendingRow, 'load' | 'reps' | 'seconds' | 'kept'>, liveSeconds = 0, baseUnknown = false): string | null {
  if (row.kept) return row.kept.why === 'unit' ? `Picked in ${row.kept.unit}. Pick again` : 'A plate is turned off. Pick again';
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
 * The WEIGHT cell of a kept pick (PLAN 1.7i): what was picked, with its unit when that is not
 * today's ("135 lb", "+25 lb", "90 lb + bar"), never converted.
 */
export function keptCell(kept: KeptPick, kind: Load['kind'], unit: Unit): string {
  const tag = kept.unit !== unit ? ` ${kept.unit}` : '';
  if (kept.load) {
    if (kept.load.kind === 'bodyweight') return kept.load.added ? `+${formatAmount(kept.load.added)}${tag}` : 'Just you';
    const w = cellWeight(kept.load);
    return w === null ? '' : `${formatAmount(w)}${tag}`;
  }
  if (kept.plates.length) return `${formatAmount(platesOnly(kept.plates, kept.unit))}${tag} + ${kind === 'plate_machine' ? 'start' : 'bar'}`;
  return '';
}

/**
 * A saved row's cells (PLAN 1.7i), always from the set's own record: its unit, load kind and
 * count. Anything that differs from today's column heading says so: "135 lb" under a kg heading,
 * "30 each" under a plain heading, "60 total" under an "each" or "+ lb" heading, "10 reps" or
 * "10 × 135 lb" in today's Hold column, "45 s" in today's Reps column.
 */
export function savedCells(set: { reps?: number; seconds?: number; load?: Load }, kind: Load['kind'], unit: Unit): { weight: string; amount: string } {
  const load = set.load;
  const mode = countModeOf(set, kind);
  if (kind === 'timed') {
    if (mode === 'seconds') return { weight: '', amount: set.seconds ? `${set.seconds} s` : '' };
    return { weight: '', amount: formatSetLine(set) };
  }
  const amount = mode === 'seconds' ? `${set.seconds ?? 0} s` : set.reps ? `${set.reps}` : '';
  if (!load) return { weight: '', amount };
  const tag = load.unit !== unit ? ` ${load.unit}` : '';
  if (load.kind === 'bodyweight') return { weight: load.added ? `+${formatAmount(load.added)}${tag}` : 'Just you', amount };
  const w = cellWeight(load);
  if (w === null) return { weight: '', amount };
  // The heading says "each" (dumbbells) or "+ lb" (added to bodyweight): a set loaded another way says how.
  const each = load.kind === 'dumbbell_each' && kind !== 'dumbbell_each' ? ' each' : '';
  const total = load.kind !== 'dumbbell_each' && (kind === 'dumbbell_each' || kind === 'bodyweight') ? ' total' : '';
  return { weight: `${formatAmount(w)}${tag}${each}${total}`, amount };
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
