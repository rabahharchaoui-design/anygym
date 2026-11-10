// Backup record checks (SPEC 9.2), split from lib/backup.ts (PLAN 3.5e, code organization: a file
// over 400 lines is split when touched, behavior unchanged). Table driven: each record type lists its
// required fields and, when present, its optional ones. A backup with one record that does not match
// is refused before anything on the phone changes.
import type { DumbbellRange } from '../db/types';
import { definitionPlan } from '../data/plans';
import { isKnownPlate, validDumbbellRange, validStackStep } from './load';
import { isReviewRow } from './candidates/review';
import type { TableName } from './backup';

export type Rec = Record<string, unknown>;
export type Check = (v: unknown) => boolean;
export const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str: Check = (v) => typeof v === 'string';
export const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
export const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const orNull = (c: Check): Check => (v) => v === null || c(v);
const listOf = (c: Check): Check => (v) => Array.isArray(v) && v.every(c);
export const recordOf = (c: Check): Check => (v) => isObj(v) && Object.values(v).every(c);
const tuple = (...cs: Check[]): Check => (v) => Array.isArray(v) && v.length === cs.length && cs.every((c, i) => c(v[i]));

type Shape = { req: Record<string, Check>; opt?: Record<string, Check> };
export const shape = ({ req, opt = {} }: Shape): Check => (v) =>
  isObj(v) && Object.entries(req).every(([k, c]) => c(v[k])) && Object.entries(opt).every(([k, c]) => v[k] === undefined || c(v[k]));

export const unit = oneOf('lb', 'kg');
const LOAD_KINDS = ['barbell', 'dumbbell_each', 'single', 'stack', 'plate_machine', 'bodyweight', 'timed'] as const;
const BAR_IDS = ['olympic', 'womens', 'ez_curl', 'trap', 'smith'] as const;

/** Plates per side that are all real plates of that unit (PLATE_SPECS): an unknown size would crash drawing and solving. */
export const knownPlates = (u: unknown): Check => (v) => listOf(num)(v) && (u === 'lb' || u === 'kg') && (v as number[]).every((w) => isKnownPlate(w, u));

/**
 * A stored load (SPEC 5.5): kind, unit and a numeric total; every other number numeric when there,
 * and its plates per side real plates of the load's own unit (PLAN 1.7k).
 */
export const isLoad: Check = (v) =>
  shape({
    req: { kind: oneOf(...LOAD_KINDS), unit, total: num },
    opt: { barWeight: num, barId: oneOf(...BAR_IDS), legacyBarUnresolved: oneOf(true), perSide: listOf(num), collars: num, stackValue: num, added: num },
  })(v) &&
  ((v as Rec).perSide === undefined || knownPlates((v as Rec).unit)((v as Rec).perSide)) &&
  // An unresolved legacy bar (PLAN 2.0c) is a barbell set without a barId: never both.
  ((v as Rec).legacyBarUnresolved === undefined || ((v as Rec).kind === 'barbell' && (v as Rec).barId === undefined));

const isSet = shape({
  req: { id: str, sessionId: str, exerciseId: str, order: num, kind: oneOf('warmup', 'work', 'drop'), uncertain: bool },
  opt: {
    reps: num,
    seconds: num,
    load: isLoad,
    rpe: num,
    note: str,
    failure: bool,
    importMap: shape({ req: { fileName: str, catalogId: orNull(str), match: oneOf('exact', 'variant', 'none'), by: oneOf('name', 'you') } }),
    gymId: str,
  },
});

/** A dumbbell range that makes sense (positive step, min ≥ 0, max ≥ min, a bounded list): never a frozen picker. */
const dumbbellRange: Check = (v) => shape({ req: { min: num, max: num, step: num } })(v) && validDumbbellRange(v as DumbbellRange);

/** A machine's saved answer: a stack step that makes sense, any other weight a finite number ≥ 0. */
const equipmentWeight: Check = (v) => {
  if (!shape({ req: { kind: oneOf('plates_only', 'starting_resistance', 'stack_step', 'bar_weight'), value: orNull(num) } })(v)) return false;
  const { kind, value } = v as { kind: string; value: number | null };
  if (value === null) return true;
  return kind === 'stack_step' ? validStackStep(value) : value >= 0;
};

const bars = shape({ req: Object.fromEntries(BAR_IDS.map((b) => [b, orNull(num)])) });

const gymShape = shape({
  req: {
    id: str,
    name: str,
    type: oneOf('full', 'hotel', 'home', 'none'),
    unit,
    equipment: listOf(str),
    dumbbellRange: orNull(dumbbellRange),
    bars,
    // A step that would break the pin list (0, negative, 1e-12) is refused before anything is replaced (PLAN 1.7j).
    stackStep: (v) => num(v) && validStackStep(v as number),
    equipmentWeights: recordOf(equipmentWeight),
    plateInventory: listOf(shape({ req: { weight: num, enabled: bool } })),
    collars: oneOf('none', 'competition'),
    plateColors: oneOf('black', 'color'),
    isActive: bool,
    createdAt: num,
  },
  opt: { city: str, lastUsedAt: num, timeBudgetMin: num },
});

/** Every plate in a gym's inventory, enabled or not, is a real plate of the gym's unit (PLAN 1.7k: a 999 kg plate crashed loading). */
const inventoryKnown = (g: Rec): boolean => (g.plateInventory as Array<{ weight: number }>).every((p) => isKnownPlate(p.weight, g.unit as 'lb' | 'kg'));

/** One changed slot of a workout (PLAN 3.4). */
const sessionSwap = shape({
  req: { slot: str, current: str },
  opt: { kept: listOf(str), auto: bool, always: bool, reason: str, noFit: bool },
});

/** What a time budget left out of a workout's plan day (PLAN 3.6). */
/** A built Quick workout's targets for one exercise (PLAN 3.5a). */
const range = (v: unknown) => num(v) || tuple(num, num)(v);
// PLAN 3.5b: `pair` marks a superset or circuit member (its group, its place in it, the group's size).
const quickPair = (v: unknown) => shape({ req: { group: num, index: num, size: num } })(v) && (v as Rec).size === Math.round((v as Rec).size as number) && ((v as Rec).size as number) >= 2 && ((v as Rec).index as number) >= 0 && ((v as Rec).index as number) < ((v as Rec).size as number);
const quickTarget = (v: unknown) => shape({ req: { sets: num, restSec: num }, opt: { reps: range, seconds: range, pair: quickPair } })(v);

const dayTrim = shape({
  req: { drop: listOf(str), sets: recordOf(num) },
  // PLAN 3.5b round 2: a fitted plan day's rest and pairs (additive).
  opt: { mobility: listOf(str), rest: recordOf(num), pairs: listOf(listOf(str)) },
});

/** What every stored record must look like, per table. Exported for the tests. */
export const RECORD_CHECKS: Record<TableName, Check> = {
  profile: shape({
    req: { id: str, defaultUnit: unit, createdAt: num },
    opt: { name: str, goal: str, level: str, daysPerWeek: num, lastBackupAt: num, backedUpSessionIds: listOf(str), backupSnoozeUntil: num, intakeDoneAt: num, intake: isObj, distanceUnit: oneOf('km', 'mi'), measureUnit: oneOf('cm', 'in'), dislikes: shape({ req: {}, opt: { soft: recordOf(num), never: listOf(str) } }), coach: shape({ req: {}, opt: { autoLevelUp: bool, autoIntroAt: num } }), quickIdeas: shape({ req: {}, opt: { shown: listOf(str) } }) },
  }),
  gyms: (v) => gymShape(v) && inventoryKnown(v as Rec),
  // PLAN 3.5: a generated plan's definition must be one this app can run, under the row's own id.
  plans: (v) => shape({ req: { id: str, name: str, source: oneOf('curated', 'generated'), createdAt: num }, opt: { definition: (d) => definitionPlan(d)?.id === (v as Rec).id } })(v),
  planDays: shape({ req: { id: str, planId: str, order: num, name: str } }),
  sessions: shape({
    req: { id: str, gymId: str, startedAt: num, imported: bool },
    opt: { planId: str, dayId: str, endedAt: num, timeBudgetMin: num, importSeq: num, importHash: str, note: str, exerciseIds: listOf(str), weekIndex: num, rowAdjust: recordOf(num), swaps: listOf(sessionSwap), suggestedRest: recordOf(num), trim: dayTrim, targets: recordOf(quickTarget), quickStyle: str },
  }),
  sets: isSet,
  runs: shape({
    req: { id: str, startedAt: num, type: str, movingSec: num, elapsedSec: num, distanceM: num, points: listOf(tuple(num, num, num, num)), gaps: listOf(tuple(num, num)), splits: listOf(num) },
    opt: { endedAt: num, goal: str, city: str, country: str, ghostOfRunId: str, intervalPreset: str },
  }),
  exerciseSettings: shape({ req: { exerciseId: str, gymId: str }, opt: { loadType: oneOf(...LOAD_KINDS), barId: oneOf(...BAR_IDS), restSec: num, restOff: bool, note: str, alwaysUse: recordOf(str) } }),
  planState: shape({
    req: { id: oneOf('active'), planId: str, startedAt: num, weekIndex: num, nextDayIndex: num, doneDays: listOf(num) },
    opt: { partial: recordOf(num) },
  }),
  orderCounters: shape({ req: { sessionId: str, next: num } }),
  submissions: shape({ req: { id: str, sessionId: str, exerciseId: str, rev: num }, opt: { fp: str } }),
  tombstones: shape({ req: { id: str, sessionId: str, set: isSet, expiresAt: num }, opt: { undo: bool, token: str } }),
  // A pending Log set write (PLAN 1.7i): its id, draft key, revision and every value of the row.
  // With `mutation` (PLAN 2.0c): a change to a logged set not landed yet (db/mutations.ts).
  journal: (v) =>
    shape({ req: { id: str, sessionId: str, exerciseId: str, key: str, rev: num, draft: isDraft, at: num }, opt: { mutation: isMutation, covers: listOf(str) } })(v) &&
    (v as Rec).id === ((v as Rec).draft as Rec).id &&
    ((v as Rec).mutation === undefined || mutationIdOk(v as Rec)),
  // PLAN 3.5e: G's decision on one candidate move.
  candidateReviews: isReviewRow,
};

/**
 * A change's id names its own set, kind and revision (PLAN 2.0e): `mut:<kind>:<setId>:<rev>` with
 * the entry's whole revision 1 or more, or `mut:<kind>:<setId>` with revision 0 (before 2.0e).
 */
function mutationIdOk(j: Rec): boolean {
  const m = j.mutation as Rec;
  const base = `mut:${m.kind as string}:${m.setId as string}`;
  const rev = j.rev as number;
  if (j.id === base) return rev === 0;
  return Number.isInteger(rev) && rev >= 1 && j.id === `${base}:${rev}`;
}

/** A change to a logged set (PLAN 2.0c, db/types.ts MutationIntent): an edit's values or a set type. */
export const isMutation: Check = (v) =>
  shape({ req: { kind: oneOf('edit'), setId: str, change: shape({ req: { load: (x) => isLoad(x) }, opt: { reps: num, seconds: num } }) } })(v) ||
  shape({ req: { kind: oneOf('type'), setId: str, setKind: oneOf('warmup', 'work', 'drop'), failure: bool } })(v);

/** A pending set draft (lib/drafts.ts): ids, revisions, submission marker and stopwatch kept as they are. */
export const isDraft = shape({
  req: { id: str, load: orNull(isLoad) },
  opt: {
    plates: listOf(num),
    reps: num,
    seconds: num,
    type: oneOf('normal', 'warmup', 'drop', 'failure'),
    watch: shape({ req: { startedAt: orNull(num), accumulated: num } }),
    rev: num,
    submitted: num,
    pickKind: oneOf(...LOAD_KINDS),
    unit,
  },
});
