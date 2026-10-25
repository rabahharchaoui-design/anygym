// From a parsed history file plus the review answers to exactly what gets written (SPEC 9.3).
// Pure. Every Load is built by load.ts from the file's own numbers; a weight the file does not
// give is never made up: the set is kept as reps only and stays uncertain.
import { defaultBars } from '../../db/gyms';
import type { BarId, Load, SetKind, Unit } from '../../db/types';
import { barbellLoad, bodyweightLoad, dumbbellLoad, formatAmount, loadAt, plateMachineLoad, platesForSide, singleLoad, stackLoad, type LoadSetup } from '../load';
import type { PlanExercise } from '../loadTypeRule';
import { NO_WEIGHT, mapPlanExercise, type FileLoadType, type ImportedExercise, type ImportedSession, type ImportedSet, type ParsedImport } from './anygymImportV1';

export const SMITH_UNKNOWN = 'Smith bar weight not set for this gym';
export const START_UNKNOWN = 'Starting weight not set for this gym';
export const NOT_LOADABLE = 'This gym cannot make this weight';
export const ASK_LOAD = 'Pick how you load this';
export const NO_PLATES = 'No plates add up to this: check it';

/** What the active gym knows, in the gym's unit, for one exercise. */
export type LoadContext = {
  gymUnit: Unit;
  /** The gym's Olympic bar. */
  olympic: number | null;
  /** The gym's Smith bar (0 = count plates only), null until answered. */
  smith: number | null;
  /** This exercise's plate loaded machine starting weight (0 = plates only), null until answered. */
  machineStart: number | null;
  /** Unknown load types answered with a bar or plate machine: what this gym can load. */
  setupFor: (kind: Load['kind']) => LoadSetup;
};

/** The answers on the review screen. */
export type ReviewChoices = {
  /** Exercise index → plan exercise id, or 'skip' (names the app could not match). */
  picks: Record<number, string>;
  /** Exercise index → how it is loaded (file load type unknown). */
  kinds: Record<number, Load['kind']>;
  /** Set key (setKey) → the user's fix. */
  edits: Record<string, SetEdit>;
};

/** `ok`: looked at and saved as right. */
export type SetEdit = { reps?: number; load?: Load; skip?: boolean; ok?: boolean };

/**
 * A new answer to "How do you load this?" for one exercise: its weights are rebuilt from the file,
 * so every weight picked by hand and every "Looks right" on its sets is dropped (they were for the
 * old answer) and its sets need a look again. Reps and Skip stay.
 */
export function chooseKind(choices: ReviewChoices, parsed: Pick<ParsedImport, 'sessions'>, exerciseIndex: number, kind: Load['kind']): ReviewChoices {
  if (choices.kinds[exerciseIndex] === kind) return choices;
  const edits = { ...choices.edits };
  for (const s of parsed.sessions) {
    if (s.exerciseIndex !== exerciseIndex) continue;
    s.sets.forEach((_, i) => {
      const key = setKey(s, i);
      const e = edits[key];
      if (!e) return;
      const { load: _load, ok: _ok, ...rest } = e;
      if (Object.keys(rest).length === 0) delete edits[key];
      else edits[key] = rest;
    });
  }
  return { ...choices, kinds: { ...choices.kinds, [exerciseIndex]: kind }, edits };
}

export const emptyChoices = (): ReviewChoices => ({ picks: {}, kinds: {}, edits: {} });

export const SKIP = 'skip';

export const setKey = (session: Pick<ImportedSession, 'importSeq'>, index: number): string => `${session.importSeq}.${index}`;

export type PlannedSet = {
  key: string;
  source: ImportedSet;
  kind: SetKind;
  reps: number;
  load?: Load;
  uncertain: boolean;
  reason?: string;
  note?: string;
  skipped: boolean;
  edited: boolean;
};

export type PlannedSession = { source: ImportedSession; already: boolean; sets: PlannedSet[] };

export type PlannedExercise = {
  ex: ImportedExercise;
  /** The plan exercise it is written as (matched or picked). */
  target?: PlanExercise;
  /** The name matched by itself (no pick needed). */
  matched: boolean;
  skipped: boolean;
  needsPick: boolean;
  needsKind: boolean;
  /** How its sets are loaded, once known. */
  kind?: Load['kind'];
  /** A base weight this gym has not answered yet, for the "Set it" button. */
  missingBase?: 'smith' | 'plate_machine';
  sessions: PlannedSession[];
};

export type WriteSet = { kind: SetKind; reps: number; load?: Load; uncertain: boolean; note?: string };
export type WriteSession = { hash: string; exerciseId: string; note?: string; sets: WriteSet[] };
/** Answers the import may fill in when the exercise has none yet (never overrides one). */
export type SettingFill = { exerciseId: string; loadType?: Load['kind']; barId?: BarId };

export type ImportPlan = {
  exercises: PlannedExercise[];
  /** New sessions to write, in file order. */
  sessions: WriteSession[];
  fills: SettingFill[];
  /** Sets that will be written. */
  sets: number;
  /** Exercises still waiting for an answer (pick a name, or how it is loaded). */
  open: PlannedExercise[];
  /** Sessions already imported before (same content): left out. */
  already: number;
};

/** The app's load kind for a file load type; undefined for unknown (asked). */
export function kindOf(t: FileLoadType): Load['kind'] | undefined {
  switch (t) {
    case 'dumbbell_each':
      return 'dumbbell_each';
    case 'single_weight':
    case 'held_weight':
    case 'fixed_bar_total':
      return 'single';
    case 'stack':
      return 'stack';
    case 'barbell_per_side':
    case 'smith_per_side':
      return 'barbell';
    case 'plate_machine_per_side':
      return 'plate_machine';
    case 'bodyweight':
      return 'bodyweight';
    case 'unknown':
      return undefined;
  }
}


/** A file set in plain words before it is a Load: "12 × 45 lb per side", "10 × 30 lb each", "12 reps". */
export function fileSetText(set: ImportedSet): string {
  if (set.weight === undefined) return `${set.reps} reps`;
  const w = `${set.reps} × ${formatAmount(set.weight)} ${set.unit}`;
  if (set.loadType === 'dumbbell_each') return `${w} each`;
  if (set.loadType === 'barbell_per_side' || set.loadType === 'smith_per_side' || set.loadType === 'plate_machine_per_side') return `${w} per side`;
  return set.loadType === 'bodyweight' ? `${set.reps} reps + ${formatAmount(set.weight)} ${set.unit}` : w;
}

export type BuiltLoad = { load?: Load; reason?: string; note?: string };

/**
 * One file set as a Load, from the file's numbers only (load.ts does the sums). No load when the
 * file gives no weight, or the weight needs a base this gym has not answered (the per side number
 * is kept in the note), or the load type is unknown and not answered.
 */
export function buildLoad(set: ImportedSet, chosen: Load['kind'] | undefined, ctx: LoadContext): BuiltLoad {
  const { unit, weight: w } = set;
  if (set.loadType === 'bodyweight' || (set.loadType === 'unknown' && chosen === 'bodyweight')) return { load: bodyweightLoad(unit, w ?? 0) };
  if (w === undefined) return { reason: NO_WEIGHT };
  const sameUnit = unit === ctx.gymUnit;
  const perSideNote = `${formatAmount(w)} ${unit} per side`;
  // Per side numbers become real plates (the diagram draws only real plates); none fit: reps only.
  const side = set.loadType.endsWith('_per_side') ? platesForSide(w, unit, set.plates) : null;
  if (set.loadType.endsWith('_per_side') && !side) return { reason: NO_PLATES, note: perSideNote };
  switch (set.loadType) {
    case 'dumbbell_each':
      return { load: dumbbellLoad(w, unit) };
    case 'single_weight':
    case 'held_weight':
    case 'fixed_bar_total':
      return { load: singleLoad(w, unit) };
    case 'stack':
      return { load: stackLoad(w, unit) };
    case 'barbell_per_side': {
      // The file's convention: an Olympic bar. This gym's when it is in the same unit, else the standard one.
      const bar = sameUnit && ctx.olympic !== null ? ctx.olympic : defaultBars(unit).olympic;
      const load = barbellLoad(bar, side!, 'none', unit, 'olympic');
      return load ? { load } : { reason: NO_WEIGHT };
    }
    case 'smith_per_side': {
      const load = sameUnit ? barbellLoad(ctx.smith, side!, 'none', unit, 'smith') : null;
      return load ? { load } : { reason: SMITH_UNKNOWN, note: perSideNote };
    }
    case 'plate_machine_per_side': {
      const load = sameUnit ? plateMachineLoad(ctx.machineStart, side!, unit) : null;
      return load ? { load } : { reason: START_UNKNOWN, note: perSideNote };
    }
    case 'unknown':
      switch (chosen) {
        case undefined:
        case 'timed':
          return { reason: ASK_LOAD };
        case 'dumbbell_each':
          return { load: dumbbellLoad(w, unit) };
        case 'single':
          return { load: singleLoad(w, unit) };
        case 'stack':
          return { load: stackLoad(w, unit) };
        case 'barbell':
        case 'plate_machine': {
          // The number is read as the total, like the picker shows it, only when this gym can make it
          // exactly. Otherwise the file's number is kept in the note and quoted in the reason.
          const load = sameUnit ? loadAt(chosen, w, ctx.setupFor(chosen)) : null;
          if (load) return { load };
          const as = chosen === 'barbell' ? 'plates on a bar' : 'plates on a machine';
          const number = `${formatAmount(w)} ${unit}`;
          return { reason: `${NOT_LOADABLE}: ${number} as ${as}`, note: `In your file: ${number} total, read as ${as}` };
        }
      }
  }
  return { reason: NO_WEIGHT };
}

export type PlanDeps = {
  planExercises: readonly PlanExercise[];
  contextFor: (exerciseId: string, name: string) => LoadContext;
  /** Hashes of sessions imported before. */
  existing: ReadonlySet<string>;
};

/** The review screen's model and the exact write, from the file and the answers so far. */
export function planImport(parsed: ParsedImport, choices: ReviewChoices, deps: PlanDeps): ImportPlan {
  const byId = new Map(deps.planExercises.map((e) => [e.id, e]));
  const exercises: PlannedExercise[] = [];
  const sessions: WriteSession[] = [];
  const fills: SettingFill[] = [];
  let sets = 0;
  let already = 0;
  for (const ex of parsed.exercises) {
    const own = parsed.sessions.filter((s) => s.exerciseIndex === ex.index);
    const auto = mapPlanExercise(ex.planExercise, deps.planExercises);
    const pick = choices.picks[ex.index];
    const skipped = !auto && pick === SKIP;
    const target = auto ?? (pick && pick !== SKIP ? byId.get(pick) : undefined);
    const fresh = own.filter((s) => !deps.existing.has(s.hash));
    already += own.length - fresh.length;
    const kind = kindOf(ex.loadType) ?? choices.kinds[ex.index];
    const ctx = target ? deps.contextFor(target.id, target.name) : undefined;
    const planned: PlannedExercise = {
      ex,
      matched: !!auto,
      skipped,
      needsPick: !target && !skipped && fresh.length > 0,
      needsKind: !skipped && kind === undefined && fresh.length > 0,
      sessions: [],
    };
    if (target) planned.target = target;
    if (kind) planned.kind = kind;
    if (ctx && ex.loadType === 'smith_per_side' && ctx.smith === null) planned.missingBase = 'smith';
    if (ctx && ex.loadType === 'plate_machine_per_side' && ctx.machineStart === null) planned.missingBase = 'plate_machine';

    for (const s of own) {
      const isAlready = deps.existing.has(s.hash);
      const ps: PlannedSession = { source: s, already: isAlready, sets: [] };
      s.sets.forEach((set, i) => {
        const key = setKey(s, i);
        const edit = choices.edits[key] ?? {};
        const built: BuiltLoad = ctx ? buildLoad(set, choices.kinds[ex.index], ctx) : {};
        const load = edit.load ?? built.load;
        const fileReason = set.uncertain ? set.reason : built.reason;
        // Not matched to an exercise yet: only the file's own doubts show (nothing is built).
        const reason = !ctx
          ? set.reason
          : !load
            ? (built.reason ?? set.reason ?? NO_WEIGHT)
            : edit.ok || edit.load
              ? undefined
              : fileReason;
        const p: PlannedSet = {
          key,
          source: set,
          kind: set.kind,
          reps: edit.reps ?? set.reps,
          uncertain: reason !== undefined,
          skipped: !!edit.skip,
          edited: edit.reps !== undefined || edit.load !== undefined || !!edit.ok,
        };
        if (load) p.load = load;
        if (reason) p.reason = reason;
        const note = [set.note, !edit.load ? built.note : undefined].filter(Boolean).join(' · ');
        if (note) p.note = note;
        ps.sets.push(p);
      });
      planned.sessions.push(ps);
      if (isAlready || skipped || !target || kind === undefined) continue;
      const write = ps.sets.filter((x) => !x.skipped).map((x): WriteSet => {
        const w: WriteSet = { kind: x.kind, reps: x.reps, uncertain: x.uncertain };
        if (x.load) w.load = x.load;
        if (x.note) w.note = x.note;
        return w;
      });
      if (write.length === 0) continue;
      const out: WriteSession = { hash: s.hash, exerciseId: target.id, sets: write };
      if (s.note) out.note = s.note;
      sessions.push(out);
      sets += write.length;
    }

    if (target && kind && sessions.some((w) => w.exerciseId === target.id)) {
      const fill: SettingFill = { exerciseId: target.id };
      if (target.loadType === 'unknown') fill.loadType = kind;
      if (ex.loadType === 'smith_per_side' && target.bar !== 'smith') fill.barId = 'smith';
      if (fill.loadType || fill.barId) fills.push(fill);
    }
    exercises.push(planned);
  }
  return { exercises, sessions, fills, sets, open: exercises.filter((e) => e.needsPick || e.needsKind), already };
}
