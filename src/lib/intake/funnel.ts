// The intake funnel as a pure state machine (SPEC 14, PLAN 3.3). One question per screen; every
// answer is kept in the state as it is given (the screen saves the state as a draft), Skip clears
// the screen's answer and remembers it was skipped, Back goes to the previous screen that shows.
import { EQUIPMENT_IDS, type DumbbellRange, type EquipmentId, type GymType, type Unit } from '../../db/types';
import { equipmentPreset } from '../../db/gyms';
import type { BodyKind } from '../bodyArt';
import { validDumbbellRange } from '../load';
import {
  AGE_RANGES,
  CARDIO,
  CARDIO_FAVORITES,
  DAYS,
  EASY_ON,
  EXPERIENCE,
  FOCUS,
  GOALS,
  ids,
  MINUTES,
  PLACES,
  STYLES,
  WEEKDAYS,
  WHEN,
  WINS,
  type AgeRangeId,
  type CardioFavoriteId,
  type CardioId,
  type DaysPerWeek,
  type EasyOnId,
  type ExperienceId,
  type FocusId,
  type GoalId,
  type Minutes,
  type PlaceAnswer,
  type StyleId,
  type WeekdayId,
  type WhenId,
  type WinId,
} from './options';

export type DistanceUnit = 'km' | 'mi';
export type MeasureUnit = 'cm' | 'in';
/** body: no pick until the user makes one (the muscle map keeps its default). */
export type UnitsAnswer = { weight: Unit; distance: DistanceUnit; measure: MeasureUnit; body?: BodyKind };
export type Bodyweight = { value: number; unit: Unit };
export type Height = { unit: 'cm'; cm: number } | { unit: 'in'; ft: number; in: number };

export type IntakeAnswers = {
  /** The Main goal (PLAN 3.3a: always goals[0] when goals is set; older answers have only this). */
  goal?: GoalId;
  /** PLAN 3.3a (additive): up to 2 goals, the first is Main and leads the plan, the second is Also. */
  goals?: GoalId[];
  units?: UnitsAnswer;
  focus?: FocusId[];
  win?: WinId[];
  experience?: ExperienceId;
  days?: DaysPerWeek;
  weekdays?: WeekdayId[];
  minutes?: Minutes;
  place?: PlaceAnswer;
  equipment?: EquipmentId[];
  /** The place the equipment list was preset from (a new place presets it again). */
  equipmentFor?: PlaceAnswer;
  /** Typed on the equipment screen, in units.weight, only where no preset exists (needsDumbbellRange). */
  dumbbellRange?: DumbbellRange;
  style?: StyleId;
  cardio?: CardioId;
  cardioFavorites?: CardioFavoriteId[];
  easyOn?: EasyOnId[];
  /** Plan exercise ids. */
  love?: string[];
  never?: string[];
  when?: WhenId;
  name?: string;
  bodyweight?: Bodyweight;
  height?: Height;
  age?: AgeRangeId;
  /** Skip the rest was tapped here: Back from the reveal returns here (never saved on the profile). */
  skipRestFrom?: ScreenId;
  /** Answers the user skipped (empty on purpose). */
  skipped?: AnswerId[];
};

export const SCREENS = [
  'goal',
  'units',
  'focus',
  'win',
  'experience',
  'days',
  'weekdays',
  'minutes',
  'place',
  'equipment',
  'style',
  'cardio',
  'easyOn',
  'exercises',
  'when',
  'bodyweight',
  'about',
  'noPlan',
  'reveal',
] as const;
export type ScreenId = (typeof SCREENS)[number];

/** One stored answer. Merged screens fill several: exercises (love, never), about (name, height, age). */
export type AnswerId =
  | Exclude<ScreenId, 'reveal' | 'noPlan' | 'exercises' | 'about'>
  | 'cardioFavorites'
  | 'love'
  | 'never'
  | 'name'
  | 'height'
  | 'age';
const ANSWER_IDS: readonly AnswerId[] = ['goal', 'units', 'focus', 'win', 'experience', 'days', 'weekdays', 'minutes', 'place', 'equipment', 'style', 'cardio', 'cardioFavorites', 'easyOn', 'love', 'never', 'when', 'name', 'bodyweight', 'height', 'age'];

/** The stored answers behind each merged screen. */
const FIELDS_OF: Partial<Record<ScreenId, readonly AnswerId[]>> = { exercises: ['love', 'never'], about: ['name', 'height', 'age'] };
const fieldsOf = (s: ScreenId): readonly AnswerId[] => FIELDS_OF[s] ?? (s === 'reveal' || s === 'noPlan' ? [] : [s as AnswerId]);

/** Older drafts stopped on a screen that is now merged. */
const MERGED_STEP: Readonly<Record<string, ScreenId>> = { cardioFavorites: 'cardio', love: 'exercises', never: 'exercises', name: 'about', height: 'about', age: 'about' };

/** The personal group (SPEC 14): from here on "Skip the rest" goes straight to the reveal. */
export const PERSONAL_GROUP: ReadonlySet<ScreenId> = new Set<ScreenId>(['easyOn', 'exercises', 'when', 'bodyweight', 'about']);

export type ScreenKind = 'single' | 'multi' | 'form' | 'notice' | 'reveal';

/** Single choice screens advance on their own after the tap; the rest have Continue. */
export const KIND: Record<ScreenId, ScreenKind> = {
  // PLAN 3.3a: up to 2 picks, so it has Continue.
  goal: 'multi',
  units: 'form',
  focus: 'multi',
  win: 'multi',
  experience: 'single',
  days: 'single',
  weekdays: 'multi',
  minutes: 'single',
  place: 'single',
  equipment: 'multi',
  style: 'single',
  cardio: 'form',
  easyOn: 'multi',
  exercises: 'multi',
  when: 'single',
  bodyweight: 'form',
  about: 'form',
  noPlan: 'notice',
  reveal: 'reveal',
};

/** Personal or optional screens get a Skip (SPEC 14). PLAN 3.3a round 2: and every question not used yet. */
export const SKIPPABLE: ReadonlySet<ScreenId> = new Set<ScreenId>(['weekdays', 'style', 'easyOn', 'exercises', 'when', 'bodyweight', 'about']);

/**
 * PLAN 3.3a round 2 (B6): questions the app does not use yet are optional: Continue works with
 * nothing picked, and what is left blank is remembered as skipped (never a made up answer).
 */
export const NOT_USED_YET: ReadonlySet<ScreenId> = new Set<ScreenId>(['focus', 'win', 'style', 'cardio', 'easyOn', 'exercises', 'when', 'bodyweight']);

/** Which answer field each answer id fills. */
export const ANSWER_KEY: Record<AnswerId, keyof IntakeAnswers> = {
  goal: 'goal',
  units: 'units',
  focus: 'focus',
  win: 'win',
  experience: 'experience',
  days: 'days',
  weekdays: 'weekdays',
  minutes: 'minutes',
  place: 'place',
  equipment: 'equipment',
  style: 'style',
  cardio: 'cardio',
  cardioFavorites: 'cardioFavorites',
  easyOn: 'easyOn',
  love: 'love',
  never: 'never',
  when: 'when',
  name: 'name',
  bodyweight: 'bodyweight',
  height: 'height',
  age: 'age',
};

/**
 * The screens that show for these answers: no exercise lists for someone brand new. The no plan notice is not in the list: only Continue from the equipment opens it.
 */
export function visibleScreens(a: IntakeAnswers): ScreenId[] {
  return SCREENS.filter((s) => s !== 'noPlan' && !(s === 'exercises' && a.experience === 'new'));
}

/** What the equipment screen asks about at this place. Outdoors there is little to carry. */
export function equipmentChoices(place: PlaceAnswer | undefined): readonly EquipmentId[] {
  return place === 'outdoors' ? ['pull_up_bar', 'resistance_bands'] : EQUIPMENT_IDS;
}

/** PLAN 3.3a: the most goals one can pick (Main, then Also). */
export const MAX_GOALS = 2;

/** The goals picked, Main first. Older answers stored only one goal. */
export function goalsOf(a: Pick<IntakeAnswers, 'goal' | 'goals'>): GoalId[] {
  if (a.goals?.length) return a.goals.slice(0, MAX_GOALS);
  return a.goal ? [a.goal] : [];
}

/**
 * One tap on a goal (SPEC 14 step 1): a picked one goes (the Also becomes Main when Main goes), a
 * new one becomes Main, then Also; a third swaps out the Also and Main stays.
 */
export function tapGoal(goals: readonly GoalId[], id: GoalId): GoalId[] {
  if (goals.includes(id)) return goals.filter((g) => g !== id);
  if (goals.length < MAX_GOALS) return [...goals, id];
  return [goals[0]!, id];
}

/** Where a place answer puts the gym (SPEC 3 presets). A mix starts from the full gym. */
export const GYM_TYPE_OF: Record<PlaceAnswer, GymType> = { full: 'full', hotel: 'hotel', home: 'home', outdoors: 'none', mix: 'full' };

/** The equipment a place starts with (SPEC 3 presets; the user edits from there). */
export function presetEquipment(place: PlaceAnswer): EquipmentId[] {
  return equipmentPreset(GYM_TYPE_OF[place], 'lb').equipment;
}

/** Dumbbells picked at a place with no SPEC 3 range (home, outdoors): the user gives it, never a guess. */
export function needsDumbbellRange(a: IntakeAnswers): boolean {
  if (!a.place || !a.equipment?.includes('dumbbells')) return false;
  return equipmentPreset(GYM_TYPE_OF[a.place], 'lb').dumbbellRange === null;
}

/** Before Continue: the weekdays picked differ from the days per week answer. Says so, never blocks. */
export function weekdayCountNote(a: IntakeAnswers): string | null {
  const n = a.weekdays?.length ?? 0;
  if (!a.days || n === 0 || n === a.days) return null;
  return `That is ${n} ${n === 1 ? 'day' : 'days'}. You said ${a.days}.`;
}

/** Whether the screen has what it needs for Continue (or to advance). */
export function canContinue(screen: ScreenId, a: IntakeAnswers): boolean {
  if (NOT_USED_YET.has(screen)) return true;
  switch (screen) {
    case 'units':
      return a.units !== undefined;
    case 'equipment':
      // Nothing picked is a real answer: floor and bodyweight only. Dumbbells may need their range.
      return !needsDumbbellRange(a) || (!!a.dumbbellRange && validDumbbellRange(a.dumbbellRange));
    case 'reveal':
    case 'noPlan':
      return true;
    case 'about':
      return !!a.name?.trim() || a.height !== undefined || a.age !== undefined;
    case 'exercises':
      return !!a.love?.length || !!a.never?.length;
    default: {
      const v = a[ANSWER_KEY[screen]];
      return Array.isArray(v) ? v.length > 0 : v !== undefined;
    }
  }
}

export type FunnelState = { step: ScreenId; answers: IntakeAnswers };

export type FunnelAction =
  | { type: 'set'; screen: AnswerId; value: unknown }
  | { type: 'range'; value: DumbbellRange | undefined }
  /** noFit: no plan can fit this equipment; Continue from the equipment says so first. */
  | { type: 'next'; noFit?: boolean }
  | { type: 'skip' }
  | { type: 'skipRest' }
  | { type: 'back' }
  | { type: 'goto'; screen: ScreenId };

export const startState = (answers: IntakeAnswers = {}): FunnelState => ({ step: 'goal', answers });

const unskip = (a: IntakeAnswers, s: AnswerId): AnswerId[] | undefined => {
  const left = (a.skipped ?? []).filter((x) => x !== s);
  return left.length ? left : undefined;
};

/** Sets one answer, with its knock on effects (a new place presets the equipment). */
export function setAnswer(a: IntakeAnswers, screen: AnswerId, value: unknown): IntakeAnswers {
  const key = ANSWER_KEY[screen];
  const next: IntakeAnswers = { ...a, [key]: value };
  if (screen === 'goal') {
    // A list (Main first) or one id (an older caller): goal stays the Main, for every older reader.
    const list = (Array.isArray(value) ? value : value === undefined ? [] : [value]).slice(0, MAX_GOALS) as GoalId[];
    next.goal = list[0];
    next.goals = list.length ? list : undefined;
  }
  const skipped = unskip(next, screen);
  if (skipped) next.skipped = skipped;
  else delete next.skipped;
  if (screen === 'place' && value !== a.equipmentFor) {
    const place = value as PlaceAnswer;
    next.equipment = presetEquipment(place);
    next.equipmentFor = place;
    delete next.dumbbellRange;
  }
  // The range is in the weight unit: 50 lb is never read as 50 kg.
  if (screen === 'units' && (value as UnitsAnswer).weight !== a.units?.weight) delete next.dumbbellRange;
  if (screen === 'equipment' && !(value as EquipmentId[]).includes('dumbbells')) delete next.dumbbellRange;
  if (screen === 'cardio' && value === 'none') delete next.cardioFavorites;
  return clean(next);
}

const clean = (a: IntakeAnswers): IntakeAnswers => {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof IntakeAnswers>) if (out[k] === undefined) delete out[k];
  return out;
};

/** The screen after `step` for these answers (reveal is last). */
export function nextScreen(step: ScreenId, a: IntakeAnswers): ScreenId {
  const list = visibleScreens(a);
  if (step === 'noPlan') return nextScreen('equipment', a);
  const i = list.indexOf(step);
  return list[Math.min(list.length - 1, i + 1)] ?? 'reveal';
}

/** The screen before `step`, or null on the first one. */
export function prevScreen(step: ScreenId, a: IntakeAnswers): ScreenId | null {
  const list = visibleScreens(a);
  if (step === 'noPlan') return 'equipment';
  if (step === 'reveal' && a.skipRestFrom) return a.skipRestFrom;
  const i = list.indexOf(step);
  if (i > 0) return list[i - 1]!;
  if (i === 0) return null;
  // A screen that no longer shows (favorites after cardio None): back to the nearest one before it.
  const order = SCREENS.indexOf(step);
  for (let j = order - 1; j >= 0; j--) if (list.includes(SCREENS[j]!)) return SCREENS[j]!;
  return null;
}

const isBlank = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Clears these answers and remembers they were skipped. */
function markSkipped(a: IntakeAnswers, fields: readonly AnswerId[]): IntakeAnswers {
  const out: IntakeAnswers = { ...a };
  for (const f of fields) delete out[ANSWER_KEY[f]];
  out.skipped = [...(a.skipped ?? []).filter((s) => !fields.includes(s)), ...fields];
  return out;
}

export function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case 'set':
      return { ...state, answers: setAnswer(state.answers, action.screen, action.value) };
    case 'range':
      return { ...state, answers: clean({ ...state.answers, dumbbellRange: action.value }) };
    case 'next': {
      if (!canContinue(state.step, state.answers)) return state;
      if (state.step === 'equipment' && action.noFit) return { ...state, step: 'noPlan' };
      // What was left blank on a merged screen is skipped on purpose (a cleared name goes).
      const blank = state.step === 'about' || NOT_USED_YET.has(state.step) ? fieldsOf(state.step).filter((f) => isBlank(state.answers[ANSWER_KEY[f]])) : [];
      const answers = blank.length ? markSkipped(state.answers, blank) : state.answers;
      return { step: nextScreen(state.step, answers), answers };
    }
    case 'skip': {
      if (!SKIPPABLE.has(state.step)) return state;
      const answers = markSkipped(state.answers, fieldsOf(state.step));
      return { step: nextScreen(state.step, answers), answers };
    }
    case 'skipRest': {
      if (!PERSONAL_GROUP.has(state.step)) return state;
      return { step: 'reveal', answers: { ...markSkipped(state.answers, [...PERSONAL_GROUP].flatMap(fieldsOf)), skipRestFrom: state.step } };
    }
    case 'back': {
      const prev = prevScreen(state.step, state.answers);
      if (!prev) return state;
      const answers = { ...state.answers };
      delete answers.skipRestFrom;
      return { step: prev, answers };
    }
    case 'goto':
      return visibleScreens(state.answers).includes(action.screen) ? { ...state, step: action.screen } : state;
  }
}

/** 0 on the first screen, 1 on the reveal. */
export function progressOf(step: ScreenId, a: IntakeAnswers): number {
  const list = visibleScreens(a);
  const i = Math.max(0, list.indexOf(step === 'noPlan' ? 'equipment' : step));
  return list.length > 1 ? i / (list.length - 1) : 1;
}

// ---------------------------------------------------------------- draft (de)serialization

const oneOf = <T>(list: readonly T[], v: unknown): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const manyOf = <T>(list: readonly T[], v: unknown): T[] | undefined => (Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x as T)) as T[])] : undefined);
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 120))] : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Bodyweight and height bounds the pickers can show. */
export const BODYWEIGHT_RANGE: Record<Unit, { min: number; max: number }> = { kg: { min: 30, max: 250 }, lb: { min: 66, max: 550 } };
export const HEIGHT_CM = { min: 120, max: 230 } as const;
export const HEIGHT_FT = { min: 3, max: 7 } as const;

function units(v: unknown): UnitsAnswer | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const weight = oneOf<Unit>(['kg', 'lb'], o.weight);
  const distance = oneOf<DistanceUnit>(['km', 'mi'], o.distance);
  const measure = oneOf<MeasureUnit>(['cm', 'in'], o.measure);
  const body = oneOf<BodyKind>(['male', 'female'], o.body);
  if (!weight || !distance || !measure) return undefined;
  return body ? { weight, distance, measure, body } : { weight, distance, measure };
}

function dumbbells(v: unknown): DumbbellRange | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const { min, max, step } = v as Record<string, unknown>;
  if (!finite(min) || !finite(max) || !finite(step)) return undefined;
  return validDumbbellRange({ min, max, step }) && min > 0 ? { min, max, step } : undefined;
}

function bodyweight(v: unknown): Bodyweight | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const unit = oneOf<Unit>(['kg', 'lb'], o.unit);
  if (!unit || !finite(o.value)) return undefined;
  const r = BODYWEIGHT_RANGE[unit];
  return o.value >= r.min && o.value <= r.max ? { value: o.value, unit } : undefined;
}

function height(v: unknown): Height | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o.unit === 'cm' && finite(o.cm) && Number.isInteger(o.cm) && o.cm >= HEIGHT_CM.min && o.cm <= HEIGHT_CM.max) return { unit: 'cm', cm: o.cm };
  if (o.unit === 'in' && finite(o.ft) && finite(o.in) && Number.isInteger(o.ft) && Number.isInteger(o.in) && o.ft >= HEIGHT_FT.min && o.ft <= HEIGHT_FT.max && o.in >= 0 && o.in <= 11)
    return { unit: 'in', ft: o.ft, in: o.in };
  return undefined;
}

/** Keeps only valid answers (a stored draft or profile from an older or edited copy). */
export function sanitizeAnswers(v: unknown): IntakeAnswers {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const placeIds = ids(PLACES);
  // PLAN 3.3a: goals (Main first) when stored; an older single goal still loads as the Main.
  const goals = manyOf(ids(GOALS), o.goals)?.slice(0, MAX_GOALS);
  const a: IntakeAnswers = {
    goal: goals?.length ? goals[0] : oneOf(ids(GOALS), o.goal),
    goals: goals?.length ? goals : undefined,
    units: units(o.units),
    focus: manyOf(ids(FOCUS), o.focus),
    win: manyOf(ids(WINS), o.win),
    experience: oneOf(ids(EXPERIENCE), o.experience),
    days: oneOf(DAYS, o.days),
    weekdays: manyOf(ids(WEEKDAYS), o.weekdays),
    minutes: oneOf(MINUTES, o.minutes),
    place: oneOf(placeIds, o.place),
    equipment: manyOf(EQUIPMENT_IDS, o.equipment),
    equipmentFor: oneOf(placeIds, o.equipmentFor),
    dumbbellRange: dumbbells(o.dumbbellRange),
    style: oneOf(ids(STYLES), o.style),
    cardio: oneOf(ids(CARDIO), o.cardio),
    cardioFavorites: manyOf(ids(CARDIO_FAVORITES), o.cardioFavorites),
    easyOn: manyOf(ids(EASY_ON), o.easyOn),
    love: strings(o.love),
    never: strings(o.never),
    when: oneOf(ids(WHEN), o.when),
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : undefined,
    bodyweight: bodyweight(o.bodyweight),
    height: height(o.height),
    // Older answers: the two youngest ranges are now one.
    age: oneOf(ids(AGE_RANGES), o.age === 'under_18' || o.age === '18_24' ? 'under_25' : o.age),
    skipRestFrom: oneOf([...PERSONAL_GROUP], o.skipRestFrom),
    skipped: manyOf(ANSWER_IDS, o.skipped),
  };
  if (a.skipped && !a.skipped.length) delete a.skipped;
  return clean(a);
}

/** A saved draft: the screen and the answers so far. Anything unreadable starts fresh. */
export function parseDraft(text: string | null): FunnelState | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const answers = sanitizeAnswers(o.answers);
    const raw = typeof o.step === 'string' ? (MERGED_STEP[o.step] ?? o.step) : o.step;
    const step = oneOf(SCREENS, raw) ?? 'goal';
    return { step: step === 'noPlan' || visibleScreens(answers).includes(step) ? step : 'goal', answers };
  } catch {
    return null;
  }
}

export const serializeDraft = (s: FunnelState): string => JSON.stringify(s);
