// Curated plans (SPEC 7.5, PLAN 1.10). Pure: no Dexie, no React, no JSON imports.
//
// The two shipped plan files have different shapes:
//   five-day-split.json     days[].blocks[]: { type: 'single', exercise, sets?, reps?, seconds?, restSec?, note? }
//                          or { type: 'superset', sets, restSec?, warmup?, items: [{ exercise, reps, note }] }
//   six-week-volume.json   days[].items[]: { exercise, weeks: [{ sets, reps } | { rounds }], note? }
// normalizePlan turns both into one Plan. Every exercise name must resolve to an id in
// data/plan-exercises.json; an unknown name throws (a plan never points at a made up exercise).
//
// Also here: the week table lookup (SPEC 6 rule 6), the duration estimate (SPEC 7.4) and the
// "where is the plan now" state machine (advancePlan).

export type RepRange = [number, number];
export type PlanReps = RepRange | number;
export type PlanSeconds = RepRange | number;
export type ProgressionMode = 'double' | 'weekly_table';
/** One week of a table. `rounds`: the sets are rounds of a timed interval ("10 rounds × 30 sec"). */
export type WeekRow = { sets: number; reps?: number; rounds?: true };

export type PlanItem = {
  /** Slug id from data/plan-exercises.json. */
  exerciseId: string;
  name: string;
  reps?: PlanReps;
  /** Timed items: hold for this long (a range for "60 to 90 sec"). */
  seconds?: PlanSeconds;
  note?: string;
  /** "each side" / "each arm": the reps count per side. */
  eachSide?: boolean;
  /** weekly_table plans: one row per week. */
  weeks?: WeekRow[];
};

export type PlanBlock = {
  kind: 'single' | 'pair';
  warmup?: boolean;
  items: PlanItem[];
  sets?: number;
  restSec?: number;
};

/** A cardio finisher at the end of a day. `minutes` null: the plan gives no length (never invented). */
export type Finisher = { name: string; minutes: number | null };

export type PlanDay = { n: number; name: string; addOn?: string; blocks: PlanBlock[]; finisher?: Finisher };

export type Plan = {
  id: string;
  name: string;
  summary: string;
  gymType: string;
  goal: string;
  level: string;
  daysPerWeek: number;
  weeks?: number;
  progressionMode: ProgressionMode;
  days: PlanDay[];
};

/** Looks an exercise name up in the plan exercise list. */
export type ResolveExercise = (name: string) => { id: string; name: string } | undefined;

// ---------------------------------------------------------------- normalize

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const range = (v: unknown): RepRange | number | undefined => {
  if (Array.isArray(v) && v.length === 2 && num(v[0]) !== undefined && num(v[1]) !== undefined) return [v[0] as number, v[1] as number];
  return num(v);
};

/** "10 seconds rest between sets" → 10: a rest the plan states in a note. */
export function restFromNote(note: string | undefined): number | undefined {
  const m = note ? /(\d+)\s*(?:s|sec|secs|seconds?)\s+rest\b/i.exec(note) : null;
  return m ? Number(m[1]) : undefined;
}

/** "30 Second Interval Sprint" → 30: the hold is in the name itself. */
const secondsInName = (name: string): number | undefined => {
  const m = /^(\d+)\s+second\b/i.exec(name);
  return m ? Number(m[1]) : undefined;
};

function item(raw: Raw, resolve: ResolveExercise, where: string): PlanItem {
  const name = str(raw.exercise);
  const found = name ? resolve(name) : undefined;
  if (!name || !found) throw new Error(`Plan exercise not in data/plan-exercises.json: "${String(raw.exercise)}" (${where})`);
  const out: PlanItem = { exerciseId: found.id, name };
  const reps = range(raw.reps);
  const seconds = range(raw.seconds);
  if (reps !== undefined) out.reps = reps;
  if (seconds !== undefined) out.seconds = seconds;
  const note = str(raw.note);
  if (note) out.note = note;
  if (raw.eachSide === true) out.eachSide = true;
  if (Array.isArray(raw.weeks)) {
    out.weeks = raw.weeks.map((w) => {
      const row = obj(w);
      const rounds = num(row.rounds);
      if (rounds !== undefined) return { sets: rounds, rounds: true as const };
      const r = num(row.reps);
      return r === undefined ? { sets: num(row.sets) ?? 1 } : { sets: num(row.sets) ?? 1, reps: r };
    });
    if (raw.weeks.some((w) => num(obj(w).rounds) !== undefined) && out.seconds === undefined) {
      const s = secondsInName(name);
      if (s !== undefined) out.seconds = s;
    }
  }
  return out;
}

function block(raw: Raw, resolve: ResolveExercise, where: string): PlanBlock {
  const pair = raw.type === 'superset' || Array.isArray(raw.items);
  const items = pair ? (raw.items as unknown[]).map((x, i) => item(obj(x), resolve, `${where} item ${i + 1}`)) : [item(raw, resolve, where)];
  const out: PlanBlock = { kind: pair && items.length > 1 ? 'pair' : 'single', items };
  if (raw.warmup === true) out.warmup = true;
  const sets = num(raw.sets);
  // Rest only when the plan states it: restSec, or a note like "10 seconds rest between sets".
  const rest = num(raw.restSec) ?? (items.length === 1 ? restFromNote(items[0]!.note) : undefined);
  if (sets !== undefined) out.sets = sets;
  if (rest !== undefined) out.restSec = rest;
  return out;
}

/** One Plan from either JSON shape. Throws on any exercise missing from the plan exercise list. */
export function normalizePlan(input: unknown, resolve: ResolveExercise): Plan {
  const raw = obj(input);
  const id = str(raw.id) ?? 'plan';
  const weeks = num(raw.weeks);
  const days = (Array.isArray(raw.days) ? raw.days : []).map((d, di) => {
    const day = obj(d);
    const where = `${id} day ${num(day.n) ?? di + 1}`;
    const rawBlocks = Array.isArray(day.blocks) ? day.blocks : Array.isArray(day.items) ? day.items : [];
    const out: PlanDay = {
      n: num(day.n) ?? di + 1,
      name: str(day.name) ?? `Day ${di + 1}`,
      blocks: rawBlocks.map((b, bi) => block(obj(b), resolve, `${where} block ${bi + 1}`)),
    };
    const addOn = str(day.addOn);
    if (addOn) out.addOn = addOn;
    const fin = obj(day.finisher);
    const finName = str(fin.name);
    if (finName) out.finisher = { name: finName, minutes: num(fin.minutes) ?? null };
    return out;
  });
  const plan: Plan = {
    id,
    name: str(raw.name) ?? id,
    summary: str(raw.summary) ?? '',
    gymType: str(raw.gymType) ?? 'full',
    goal: str(raw.goal) ?? 'muscle',
    level: str(raw.level) ?? 'intermediate',
    daysPerWeek: num(raw.daysPerWeek) ?? days.length,
    progressionMode: raw.progressionMode === 'weekly_table' ? 'weekly_table' : 'double',
    days,
  };
  if (weeks !== undefined) plan.weeks = weeks;
  return plan;
}

// ---------------------------------------------------------------- targets

export const DEFAULT_PLAN_REST_SEC = 90;

/** What one item asks for this week: sets, and reps or a hold. */
export type ItemTarget = { sets: number; reps?: PlanReps; seconds?: PlanSeconds; rounds?: true };

/** Clamps a week index into the table (after the last week it stays on the last week). */
export function clampWeek(weekIndex: number, weeks: number): number {
  return Math.max(0, Math.min(Math.max(0, weeks - 1), Math.floor(weekIndex)));
}

/**
 * Sets and reps for an item: the week's table row (weekly_table, SPEC 6 rule 6), else the block's
 * sets with the item's reps. A lone hold with no sets (a stretch) is one set.
 */
export function itemTarget(block: PlanBlock, it: PlanItem, weekIndex = 0): ItemTarget {
  const row = it.weeks?.length ? it.weeks[clampWeek(weekIndex, it.weeks.length)] : undefined;
  const out: ItemTarget = { sets: row?.sets ?? block.sets ?? 1 };
  if (row?.rounds) out.rounds = true;
  const reps = row ? row.reps : it.reps;
  if (reps !== undefined) out.reps = reps;
  if (it.seconds !== undefined) out.seconds = it.seconds;
  return out;
}

/**
 * Rest timer length after a set (a round, for a pair): the plan's, else the app default of 90 s;
 * a lone hold with no sets has none. The default is never shown as if the plan said it (planRest).
 */
export function blockRest(block: PlanBlock): number {
  if (block.restSec !== undefined) return block.restSec;
  const loneHold = block.sets === undefined && block.items.every((i) => i.seconds !== undefined && !i.weeks);
  return loneHold ? 0 : DEFAULT_PLAN_REST_SEC;
}

/** The rest the plan itself states, or undefined: the only rest the words may show. */
export const planRest = (block: PlanBlock): number | undefined => (block.restSec !== undefined && block.restSec > 0 ? block.restSec : undefined);

/** The low end of a range, or the number. */
export const low = (v: PlanReps): number => (typeof v === 'number' ? v : v[0]);

// ---------------------------------------------------------------- words (SPEC 13.1)

const span = (v: PlanReps): string => (typeof v === 'number' ? `${v}` : `${v[0]} to ${v[1]}`);

/** "8 to 12 reps", "20 reps each side", "45 sec", "60 to 90 sec", or '' when the plan says nothing. */
export function amountText(t: Pick<ItemTarget, 'reps' | 'seconds'>, eachSide = false): string {
  if (t.reps !== undefined) return `${span(t.reps)} reps${eachSide ? ' each side' : ''}`;
  if (t.seconds !== undefined) return `${span(t.seconds)} sec`;
  return '';
}

/**
 * "4 sets × 8 to 12", "5 sets × 6", "3 sets × 60 to 90 sec", "45 sec", "10 sets". With `reps`:
 * "4 sets × 8 to 12 reps" (the plan viewer, where nothing else says what the number counts).
 */
export function setsText(t: ItemTarget, reps = false): string {
  const loneHold = t.sets === 1 && t.reps === undefined && t.seconds !== undefined && !t.rounds;
  if (loneHold) return `${span(t.seconds!)} sec`;
  const sets = t.rounds ? `${t.sets} ${t.sets === 1 ? 'round' : 'rounds'}` : `${t.sets} ${t.sets === 1 ? 'set' : 'sets'}`;
  if (t.reps !== undefined) return `${sets} × ${span(t.reps)}${reps ? ' reps' : ''}`;
  if (t.seconds !== undefined) return `${sets} × ${span(t.seconds)} sec`;
  return sets;
}

/**
 * "4 sets × 8 to 12 reps · 90 s rest" (the line after the name). The rest shows only when the plan
 * states one; the app's default rest timer is never presented as the plan's.
 */
export function itemLine(block: PlanBlock, it: PlanItem, weekIndex = 0): string {
  const rest = planRest(block);
  const parts = [setsText(itemTarget(block, it, weekIndex), true)];
  if (rest !== undefined) parts.push(`${rest} s rest`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- duration (SPEC 7.4)

const WORK_SEC = 40;
const CHANGE_SEC = 60;

/**
 * Estimated minutes for a day (SPEC 7.4): every set is 40 s of work (a hold: its time) plus the
 * rest after it; a pair rests once per round; 60 s per exercise change. Warm up blocks count like
 * any other block. A finisher adds its minutes when the plan gives them (plus the change to it).
 * Rounded to the nearest minute.
 */
export function estimateDayMinutes(day: PlanDay, weekIndex = 0): number {
  let sec = 0;
  let exercises = 0;
  for (const b of day.blocks) {
    const rest = blockRest(b);
    const targets = b.items.map((it) => itemTarget(b, it, weekIndex));
    const rounds = Math.max(...targets.map((t) => t.sets));
    for (const t of targets) {
      const work = t.reps === undefined && t.seconds !== undefined ? low(t.seconds) : WORK_SEC;
      sec += t.sets * work;
    }
    sec += rounds * rest;
    exercises += b.items.length;
  }
  if (day.finisher?.minutes) {
    sec += day.finisher.minutes * 60;
    exercises += 1;
  }
  sec += Math.max(0, exercises - 1) * CHANGE_SEC;
  return Math.round(sec / 60);
}

// ---------------------------------------------------------------- where the plan is (planState)

export type PlanPosition = {
  /** Day index (0 based) to do next. */
  nextDayIndex: number;
  /** weekly_table only: 0 based week, stays on the last week after the table ends. */
  weekIndex: number;
  /** Days finished in this pass through the plan (0 based). */
  doneDays: number[];
};

/**
 * After finishing day `doneDayIndex`: the next day is the one after it. Finishing the last day
 * wraps to day 1, clears the done marks and, for a weekly table, moves to the next week (never
 * past the last week).
 */
export function advancePlan(pos: PlanPosition, doneDayIndex: number, plan: Pick<Plan, 'days' | 'progressionMode' | 'weeks'>): PlanPosition {
  const count = plan.days.length;
  const done = Math.max(0, Math.min(count - 1, doneDayIndex));
  if (done + 1 < count) {
    return { nextDayIndex: done + 1, weekIndex: pos.weekIndex, doneDays: [...new Set([...pos.doneDays, done])].sort((a, b) => a - b) };
  }
  const weekly = plan.progressionMode === 'weekly_table';
  const weekIndex = weekly ? clampWeek(pos.weekIndex + 1, plan.weeks ?? 1) : pos.weekIndex;
  return { nextDayIndex: 0, weekIndex, doneDays: [] };
}

/** "Stair climbing · 15 min", or just "Cycling" when the plan gives no length. */
export function finisherText(f: Finisher): string {
  return f.minutes ? `${f.name} · ${f.minutes} min` : f.name;
}

/** Day id stored on a session: the day number as text ("1" for Day 1). */
export const dayIdOf = (day: PlanDay): string => String(day.n);

/** The day index for a stored day id, or -1. */
export function dayIndexOf(plan: Pick<Plan, 'days'>, dayId: string | undefined): number {
  return dayId === undefined ? -1 : plan.days.findIndex((d) => dayIdOf(d) === dayId);
}
