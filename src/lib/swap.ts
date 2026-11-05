// The swap engine (PLAN 3.4, SPEC 7.2, 7.5). Pure: no JSON, no Dexie, no React (data/patterns.ts binds
// the committed data). Three things live here:
//   1. which candidates of an exercise's pattern a gym can do, best first;
//   2. how a slot of a workout changes when one is picked, and how a day adapts to a gym;
//   3. the rows and the progress a workout shows once slots have changed.
// A swap never carries a number across exercises: only the slot's targets (sets, reps, rest) stay, and
// the logged sets of the exercise left behind stay under their own id.
import type { BarId, EquipmentId, SessionSwap, SetKind } from '../db/types';
import type { ExerciseLoadType } from './loadTypeRule';
import type { GymKit } from './picker';
import { adjustEntries, countsToward, dayProgress, orderEntries, recount, type DayProgress, type WorkoutEntry } from './planWorkout';
import { amountText } from './plans';

export const PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'horizontal push',
  'vertical push',
  'horizontal pull',
  'vertical pull',
  'chest isolation',
  'lateral delt',
  'rear delt',
  'biceps',
  'triceps',
  'quads isolation',
  'hamstrings isolation',
  'glutes',
  'calves',
  'core',
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Every inner list is "any of these"; all the lists must be met. [] needs nothing. */
export type Requires = EquipmentId[][];

export type Candidate = {
  /** The catalog id (data/catalog.json). */
  id: string;
  /** The plan exercise this is, when the app already knows it: sets log under that id, with its history. */
  planId?: string;
  requires: Requires;
  /** How a catalog only candidate is loaded; 'unknown' asks once, as a bare machine name always does. */
  load?: ExerciseLoadType;
  bar?: BarId;
  eachSide?: boolean;
  /** A hold counted in seconds, never reps. */
  timed?: boolean;
};

export type PatternLadder = {
  /** Why this ladder is short, for people reading the data. */
  thin?: string;
  candidates: Candidate[];
};

/** A plan exercise: null pattern = no ladder holds it; null requires = its gear is not known for sure. */
export type PlanRow = { pattern: Pattern | null; requires: Requires | null };

export type PatternFile = {
  patterns: Record<Pattern, PatternLadder>;
  planExercises: Record<string, PlanRow>;
};

export type SwapData = PatternFile & {
  /** One key for ids that are the same exercise (a plan id, its aliases and its catalog id). */
  sameAs: (id: string) => string;
};

/** The id a candidate's sets log under. */
export const workoutIdOf = (c: Candidate): string => c.planId ?? c.id;

/** Problems with the pattern data; an empty list means it is valid (SPEC 7.2). */
export function validatePatterns(file: PatternFile, catalogIds: ReadonlySet<string>, planIds: readonly string[], equipment: readonly string[]): string[] {
  const problems: string[] = [];
  const names = Object.keys(file.patterns);
  for (const p of PATTERNS) if (!names.includes(p)) problems.push(`missing pattern ${p}`);
  for (const n of names) if (!(PATTERNS as readonly string[]).includes(n)) problems.push(`unknown pattern ${n}`);
  const gear = (where: string, r: Requires) => {
    for (const group of r) {
      if (!group.length) problems.push(`${where}: empty requirement`);
      for (const id of group) if (!equipment.includes(id)) problems.push(`${where}: unknown equipment ${id}`);
    }
  };
  const seen = new Set<string>();
  for (const [name, ladder] of Object.entries(file.patterns)) {
    if (!ladder.candidates.length) problems.push(`${name}: no candidates`);
    for (const c of ladder.candidates) {
      if (!catalogIds.has(c.id)) problems.push(`${name}: ${c.id} not in catalog`);
      if (seen.has(c.id)) problems.push(`${c.id}: listed twice`);
      seen.add(c.id);
      gear(c.id, c.requires);
      if (c.planId && !planIds.includes(c.planId)) problems.push(`${c.id}: unknown plan exercise ${c.planId}`);
      if (!c.planId && !c.load) problems.push(`${c.id}: no plan exercise and no load`);
    }
  }
  for (const id of planIds) if (!file.planExercises[id]) problems.push(`no row for plan exercise ${id}`);
  for (const [id, row] of Object.entries(file.planExercises)) {
    if (!planIds.includes(id)) problems.push(`row for unknown plan exercise ${id}`);
    if (row.pattern !== null && !(PATTERNS as readonly string[]).includes(row.pattern)) problems.push(`${id}: unknown pattern ${row.pattern}`);
    if (row.requires) gear(id, row.requires);
  }
  return problems;
}

// ---------------------------------------------------------------- gear

/** Can this gym do it? Dumbbells also need a range (a gym without one has none). */
export function supports(requires: Requires, gym: GymKit): boolean {
  return requires.every((group) => group.some((id) => has(id, gym)));
}

const has = (id: EquipmentId, gym: GymKit) => gym.equipment.includes(id) && (id !== 'dumbbells' || gym.dumbbellRange !== null);

/** Plain words per item: the name ("no cable here") and what a move uses ("uses a cable"). */
const GEAR: Record<EquipmentId, { word: string; uses: string }> = {
  barbell_rack: { word: 'barbell', uses: 'a barbell' },
  flat_bench: { word: 'bench', uses: 'a bench' },
  adjustable_bench: { word: 'adjustable bench', uses: 'an adjustable bench' },
  dumbbells: { word: 'dumbbells', uses: 'dumbbells' },
  kettlebells: { word: 'kettlebells', uses: 'a kettlebell' },
  cable_station: { word: 'cable', uses: 'a cable' },
  smith_machine: { word: 'Smith machine', uses: 'the Smith machine' },
  leg_press: { word: 'leg press', uses: 'the leg press' },
  leg_extension: { word: 'leg extension', uses: 'the leg extension' },
  leg_curl: { word: 'leg curl', uses: 'the leg curl' },
  chest_press_machine: { word: 'chest press machine', uses: 'the chest press' },
  pec_deck: { word: 'pec deck', uses: 'the pec deck' },
  lat_pulldown: { word: 'lat pulldown', uses: 'the lat pulldown' },
  seated_row: { word: 'seated row', uses: 'the seated row' },
  shoulder_press_machine: { word: 'shoulder press machine', uses: 'the shoulder press' },
  calf_raise_machine: { word: 'calf raise machine', uses: 'the calf machine' },
  hip_adductor_abductor: { word: 'hip machine', uses: 'the hip machine' },
  hyperextension_bench: { word: 'back extension bench', uses: 'a back extension bench' },
  pull_up_bar: { word: 'pull up bar', uses: 'a pull up bar' },
  dip_station: { word: 'dip station', uses: 'a dip station' },
  resistance_bands: { word: 'bands', uses: 'bands' },
  ez_curl_bar: { word: 'EZ bar', uses: 'an EZ bar' },
  treadmill: { word: 'treadmill', uses: 'a treadmill' },
  bike: { word: 'bike', uses: 'a bike' },
  stair_climber: { word: 'stair climber', uses: 'a stair climber' },
  rower: { word: 'rower', uses: 'a rower' },
  jump_rope: { word: 'jump rope', uses: 'a jump rope' },
};

/** The first thing this gym lacks, in plain words ("cable"), or null when it has it all. */
export function missingWord(requires: Requires, gym: GymKit): string | null {
  const group = requires.find((g) => !g.some((id) => has(id, gym)));
  return group ? GEAR[group[0]!].word : null;
}

// ---------------------------------------------------------------- candidates

export type CountMode = 'reps' | 'seconds';

const modeOf = (c: Candidate): CountMode => (c.timed ? 'seconds' : 'reps');

function candidateById(data: SwapData, id: string): { candidate: Candidate; pattern: Pattern } | undefined {
  for (const pattern of PATTERNS) {
    const candidate = data.patterns[pattern]?.candidates.find((c) => workoutIdOf(c) === id || c.id === id);
    if (candidate) return { candidate, pattern };
  }
  return undefined;
}

/** The pattern of an exercise (plan id or catalog id), or null when no ladder holds it. */
export function patternOf(data: SwapData, id: string): Pattern | null {
  return data.planExercises[id]?.pattern ?? candidateById(data, id)?.pattern ?? null;
}

/** What an exercise needs: null when that is not known for sure. */
export function requiresOf(data: SwapData, id: string): Requires | null {
  const row = data.planExercises[id];
  if (row) return row.requires;
  return candidateById(data, id)?.candidate.requires ?? null;
}

/** How a catalog only candidate is loaded, its bar and whether it counts each side. */
export function candidateFacts(data: SwapData, id: string): Pick<Candidate, 'load' | 'bar' | 'eachSide'> | undefined {
  return candidateById(data, id)?.candidate;
}

export type SwapOptions = {
  /** What the slot is counted in: a hold is never swapped for reps (no number is invented). */
  mode?: CountMode;
  /** Exercises already in the workout, the current one aside. */
  exclude?: readonly string[];
};

/**
 * The swap candidates of an exercise: same pattern, this gym can do them, same way of counting, not
 * the exercise itself or one already in the workout, best first. Empty when none fits or the
 * exercise has no pattern: the caller says so, never a guess from another pattern.
 */
export function swapCandidates(data: SwapData, id: string, gym: GymKit, opts: SwapOptions = {}): Candidate[] {
  const pattern = patternOf(data, id);
  if (!pattern) return [];
  const mode = opts.mode ?? 'reps';
  const taken = new Set([data.sameAs(id), ...(opts.exclude ?? []).map(data.sameAs)]);
  return data.patterns[pattern].candidates.filter((c) => !taken.has(data.sameAs(workoutIdOf(c))) && modeOf(c) === mode && supports(c.requires, gym));
}

/** SPEC 7.2: the swap sheet shows up to 4 alternatives. */
export const SWAP_SHEET_MAX = 4;

/** The one line reason on a candidate: "No barbell here · uses dumbbells", "Same movement · just your body". */
export function swapReason(data: SwapData, slotId: string, c: Candidate, gym: GymKit): string {
  const main = c.requires[0]?.[0];
  const how = main ? `uses ${GEAR[main].uses}` : 'just your body';
  const slotNeeds = requiresOf(data, slotId);
  const missing = slotNeeds ? missingWord(slotNeeds, gym) : null;
  return `${missing ? `No ${missing} here` : 'Same movement'} · ${how}`;
}

// ---------------------------------------------------------------- a slot changes

export const swapOfRow = (swaps: readonly SessionSwap[] | undefined, id: string): SessionSwap | undefined => swaps?.find((s) => s.current === id);

/** The slot an exercise belongs to now. */
export const slotOf = (swaps: readonly SessionSwap[] | undefined, id: string): string => swaps?.find((s) => s.current === id || s.kept?.includes(id))?.slot ?? id;

export type SwapState = { exerciseIds: string[]; swaps: SessionSwap[] };

/**
 * `from` makes way for `to`. With logged sets `from` stays as its own row, right above `to`; without,
 * `to` takes its place. Back on the slot's own exercise with nothing kept, the record goes: the slot
 * is the plan's again. `facts.always`: from "Always use this".
 */
export function applySwap(state: SwapState, from: string, to: string, fromHasSets: boolean, facts: { always?: boolean } = {}): SwapState {
  const before = swapOfRow(state.swaps, from);
  const slot = before?.slot ?? from;
  const kept = [...new Set([...(before?.kept ?? []), ...(fromHasSets ? [from] : [])])].filter((id) => id !== to);
  const others = state.swaps.filter((s) => s !== before);
  const record: SessionSwap = { slot, current: to };
  if (kept.length) record.kept = kept;
  if (before?.reason) record.reason = before.reason;
  if (facts.always) record.always = true;
  const swaps = to === slot && !kept.length ? others : [...others, record];
  const at = state.exerciseIds.indexOf(from);
  let exerciseIds = [...state.exerciseIds];
  if (exerciseIds.includes(to)) {
    if (!fromHasSets) exerciseIds = exerciseIds.filter((id) => id !== from);
  } else if (at === -1) {
    exerciseIds.push(to);
  } else if (fromHasSets) {
    exerciseIds.splice(at + 1, 0, to);
  } else {
    exerciseIds[at] = to;
  }
  return { exerciseIds, swaps };
}

/**
 * Undo of applySwap: `from` is back, the slot's record is what it was. `toStays`: `to` had logged sets
 * before the swap too (a member of the slot), so its row stays.
 */
export function revertSwap(state: SwapState, from: string, to: string, before: SessionSwap | undefined, toStays: boolean): SwapState {
  const others = state.swaps.filter((s) => s.current !== to);
  const swaps = before ? [...others, before] : others;
  let exerciseIds = [...state.exerciseIds];
  const hasFrom = exerciseIds.includes(from);
  if (!toStays) {
    const at = exerciseIds.indexOf(to);
    if (hasFrom) exerciseIds = exerciseIds.filter((id) => id !== to);
    else if (at !== -1) exerciseIds[at] = from;
    else exerciseIds.push(from);
  } else if (!hasFrom) {
    exerciseIds.splice(exerciseIds.indexOf(to), 0, from);
  }
  return { exerciseIds, swaps };
}

// ---------------------------------------------------------------- a day meets a gym

export type AdaptEntry = Pick<WorkoutEntry, 'exerciseId' | 'seconds' | 'finisher'>;

/**
 * What a plan day does at this gym (SPEC 7.5). "Always use this" first, while this gym can do it. Then
 * only an exercise whose gear is known and missing changes: to its best candidate, or marked as
 * nothing fits. A gear that is not known for sure leaves the plan's exercise alone, and a
 * supported exercise is never replaced by something "better".
 */
export function adaptDay(data: SwapData, entries: readonly AdaptEntry[], gym: GymKit, always: Readonly<Record<string, string>> = {}): SwapState {
  const exerciseIds = entries.map((e) => e.exerciseId);
  const swaps: SessionSwap[] = [];
  const replace = (id: string, to: string) => {
    exerciseIds[exerciseIds.indexOf(id)] = to;
  };
  for (const e of entries) {
    const id = e.exerciseId;
    const pick = always[id];
    const others = () => exerciseIds.filter((x) => x !== id);
    if (pick && pick !== id && !others().some((x) => data.sameAs(x) === data.sameAs(pick))) {
      const needs = requiresOf(data, pick);
      if (needs && supports(needs, gym)) {
        replace(id, pick);
        swaps.push({ slot: id, current: pick, always: true });
        continue;
      }
    }
    if (e.finisher) continue;
    const needs = data.planExercises[id]?.requires;
    if (!needs || supports(needs, gym)) continue;
    const reason = `no ${missingWord(needs, gym)} here`;
    const best = swapCandidates(data, id, gym, { mode: e.seconds !== undefined ? 'seconds' : 'reps', exclude: others() })[0];
    if (best) {
      const to = workoutIdOf(best);
      replace(id, to);
      swaps.push({ slot: id, current: to, auto: true, reason });
    } else {
      swaps.push({ slot: id, current: id, noFit: true, reason });
    }
  }
  return { exerciseIds, swaps };
}

/** The quiet line on a changed row, or null: "Swapped: no cable here", "Nothing fits: no cable here. Skip it." */
export function swapLine(s: SessionSwap | undefined): string | null {
  if (!s) return null;
  if (s.noFit) return `Nothing fits: ${s.reason ?? 'not at this gym'}. Skip it.`;
  if (s.current === s.slot) return null;
  if (s.reason) return `Swapped: ${s.reason}`;
  return s.always ? 'Swapped: your pick for this plan' : 'Swapped: your pick today';
}

// ---------------------------------------------------------------- the rows of a changed workout

type LoggedSet = { exerciseId: string; kind: SetKind };

export type LiveInput = {
  planEntries: readonly WorkoutEntry[];
  exerciseIds: readonly string[];
  make: (id: string, block: number) => WorkoutEntry;
  swaps?: readonly SessionSwap[] | undefined;
  adjust?: Readonly<Record<string, number>> | undefined;
  sets: readonly LoggedSet[];
  nameOf: (id: string) => string;
  eachSideOf?: (id: string) => boolean;
};

const members = (s: SessionSwap): string[] => [...new Set([s.slot, ...(s.kept ?? []), s.current])];

const counter = (slotEntry: Pick<WorkoutEntry, 'warmup'>, sets: readonly LoggedSet[]) => (id: string) => sets.filter((x) => x.exerciseId === id && countsToward(slotEntry, x.kind)).length;

/** The slot's sets in all (rows added or removed by hand on any of its exercises count). */
const slotTotal = (e: Pick<WorkoutEntry, 'sets'>, s: SessionSwap, adjust: LiveInput['adjust']) => Math.max(0, e.sets + members(s).reduce((a, id) => a + (adjust?.[id] ?? 0), 0));

/** The slot's entry under another exercise: its targets stay, its own words (name, note) do not. */
function retarget(slot: WorkoutEntry, id: string, sets: number, input: Pick<LiveInput, 'nameOf' | 'eachSideOf'>): WorkoutEntry {
  const e: WorkoutEntry = { ...slot, exerciseId: id, sets, setsText: recount(slot.setsText, sets), line: recount(slot.line, sets) };
  if (id !== slot.exerciseId) {
    e.name = input.nameOf(id);
    delete e.note;
    if (input.eachSideOf?.(id)) e.eachSide = true;
    else delete e.eachSide;
    const amount = amountText({ ...(slot.reps !== undefined ? { reps: slot.reps } : {}), ...(slot.seconds !== undefined ? { seconds: slot.seconds } : {}) }, e.eachSide);
    if (amount) e.amount = amount;
  }
  return e;
}

/**
 * The workout's rows, in its own order, once slots have changed. A kept exercise's row is exactly its
 * logged sets (none left: no row); the current one gets what is left of the slot. With no swaps this is
 * the plain order and adjustment.
 */
export function liveEntries(input: LiveInput): WorkoutEntry[] {
  const { planEntries, exerciseIds, make, swaps, adjust, sets } = input;
  if (!swaps?.length) return adjustEntries(orderEntries([...planEntries], [...exerciseIds], make), adjust);
  const byPlan = new Map(planEntries.map((e) => [e.exerciseId, e]));
  const rows = new Map<string, WorkoutEntry | null>();
  for (const s of swaps) {
    const slot = byPlan.get(s.slot) ?? make(s.slot, planEntries.length + Math.max(0, exerciseIds.indexOf(s.current)));
    const countOf = counter(slot, sets);
    let keptDone = 0;
    for (const k of s.kept ?? []) {
      if (k === s.current) continue;
      const d = countOf(k);
      keptDone += d;
      rows.set(k, d > 0 ? retarget(slot, k, d, input) : null);
    }
    const left = Math.max(0, slotTotal(slot, s, adjust) - keptDone);
    const row = retarget(slot, s.current, left, input);
    if (s.noFit) row.noFit = true;
    rows.set(s.current, row);
  }
  return exerciseIds.flatMap((id, i) => {
    const row = rows.get(id);
    if (row) return [row];
    if (row === null) return [];
    return adjustEntries([byPlan.get(id) ?? make(id, planEntries.length + i)], adjust);
  });
}

/**
 * How much of the plan day a changed workout covered: one slot per plan exercise, however many
 * exercises filled it, capped at its sets. A slot nothing fits at this gym counts only if sets were
 * logged on it anyway: it can be skipped without costing the day.
 */
export function slotProgress(planEntries: readonly WorkoutEntry[], swaps: readonly SessionSwap[] | undefined, adjust: Readonly<Record<string, number>> | undefined, sets: readonly LoggedSet[]): DayProgress {
  const done = new Map<string, number>();
  const folded: WorkoutEntry[] = [];
  for (const e of planEntries) {
    const s = swaps?.find((x) => x.slot === e.exerciseId);
    const countOf = counter(e, sets);
    const n = (s ? members(s) : [e.exerciseId]).reduce((a, id) => a + countOf(id), 0);
    if (s?.noFit && n === 0) continue;
    done.set(e.exerciseId, n);
    const total = s ? slotTotal(e, s, adjust) : Math.max(0, e.sets + (adjust?.[e.exerciseId] ?? 0));
    folded.push({ ...e, sets: total });
  }
  return dayProgress(folded, (id) => done.get(id) ?? 0);
}
