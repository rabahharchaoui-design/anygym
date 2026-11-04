// The intake funnel as a pure state machine (SPEC 14, PLAN 3.3). One question per screen; every
// answer is kept in the state as it is given (the screen saves the state as a draft), Skip clears
// the screen's answer and remembers it was skipped, Back goes to the previous screen that shows.
import { EQUIPMENT_IDS, type EquipmentId, type GymType, type Unit } from '../../db/types';
import { equipmentPreset } from '../../db/gyms';
import type { BodyKind } from '../bodyArt';
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
export type UnitsAnswer = { weight: Unit; distance: DistanceUnit; measure: MeasureUnit; body: BodyKind };
export type Bodyweight = { value: number; unit: Unit };
export type Height = { unit: 'cm'; cm: number } | { unit: 'in'; ft: number; in: number };

export type IntakeAnswers = {
  goal?: GoalId;
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
  /** Screens the user skipped (their answer is empty on purpose). */
  skipped?: ScreenId[];
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
  'cardioFavorites',
  'easyOn',
  'love',
  'never',
  'when',
  'name',
  'bodyweight',
  'height',
  'age',
  'reveal',
] as const;
export type ScreenId = (typeof SCREENS)[number];

export type ScreenKind = 'single' | 'multi' | 'form' | 'reveal';

/** Single choice screens advance on their own after the tap; the rest have Continue. */
export const KIND: Record<ScreenId, ScreenKind> = {
  goal: 'single',
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
  cardio: 'single',
  cardioFavorites: 'multi',
  easyOn: 'multi',
  love: 'multi',
  never: 'multi',
  when: 'single',
  name: 'form',
  bodyweight: 'form',
  height: 'form',
  age: 'single',
  reveal: 'reveal',
};

/** Personal or optional screens get a Skip (SPEC 14). */
export const SKIPPABLE: ReadonlySet<ScreenId> = new Set<ScreenId>(['weekdays', 'cardioFavorites', 'easyOn', 'love', 'never', 'when', 'name', 'bodyweight', 'height', 'age']);

/** Which answer field each question screen fills. */
export const ANSWER_KEY: Record<Exclude<ScreenId, 'reveal'>, keyof IntakeAnswers> = {
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

/** The screens that show for these answers (no favorites when cardio is None). */
export function visibleScreens(a: IntakeAnswers): ScreenId[] {
  return SCREENS.filter((s) => !(s === 'cardioFavorites' && a.cardio === 'none'));
}

/** Where a place answer puts the gym (SPEC 3 presets). A mix starts from the full gym. */
export const GYM_TYPE_OF: Record<PlaceAnswer, GymType> = { full: 'full', hotel: 'hotel', home: 'home', outdoors: 'none', mix: 'full' };

/** The equipment a place starts with (SPEC 3 presets; the user edits from there). */
export function presetEquipment(place: PlaceAnswer): EquipmentId[] {
  return equipmentPreset(GYM_TYPE_OF[place], 'lb').equipment;
}

/** Whether the screen has what it needs for Continue (or to advance). */
export function canContinue(screen: ScreenId, a: IntakeAnswers): boolean {
  switch (screen) {
    case 'units':
      return a.units !== undefined;
    case 'equipment':
      // Nothing picked is a real answer: floor and bodyweight only.
      return true;
    case 'name':
      return !!a.name?.trim();
    case 'reveal':
      return true;
    default: {
      const v = a[ANSWER_KEY[screen]];
      return Array.isArray(v) ? v.length > 0 : v !== undefined;
    }
  }
}

export type FunnelState = { step: ScreenId; answers: IntakeAnswers };

export type FunnelAction =
  | { type: 'set'; screen: Exclude<ScreenId, 'reveal'>; value: unknown }
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'back' }
  | { type: 'goto'; screen: ScreenId };

export const startState = (answers: IntakeAnswers = {}): FunnelState => ({ step: 'goal', answers });

const unskip = (a: IntakeAnswers, s: ScreenId): ScreenId[] | undefined => {
  const left = (a.skipped ?? []).filter((x) => x !== s);
  return left.length ? left : undefined;
};

/** Sets one answer, with its knock on effects (a new place presets the equipment). */
export function setAnswer(a: IntakeAnswers, screen: Exclude<ScreenId, 'reveal'>, value: unknown): IntakeAnswers {
  const key = ANSWER_KEY[screen];
  const next: IntakeAnswers = { ...a, [key]: value };
  const skipped = unskip(next, screen);
  if (skipped) next.skipped = skipped;
  else delete next.skipped;
  if (screen === 'place' && value !== a.equipmentFor) {
    const place = value as PlaceAnswer;
    next.equipment = presetEquipment(place);
    next.equipmentFor = place;
  }
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
  const i = list.indexOf(step);
  return list[Math.min(list.length - 1, i + 1)] ?? 'reveal';
}

/** The screen before `step`, or null on the first one. */
export function prevScreen(step: ScreenId, a: IntakeAnswers): ScreenId | null {
  const list = visibleScreens(a);
  const i = list.indexOf(step);
  if (i > 0) return list[i - 1]!;
  if (i === 0) return null;
  // A screen that no longer shows (favorites after cardio None): back to the nearest one before it.
  const order = SCREENS.indexOf(step);
  for (let j = order - 1; j >= 0; j--) if (list.includes(SCREENS[j]!)) return SCREENS[j]!;
  return null;
}

export function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case 'set':
      return { ...state, answers: setAnswer(state.answers, action.screen, action.value) };
    case 'next':
      if (!canContinue(state.step, state.answers)) return state;
      return { ...state, step: nextScreen(state.step, state.answers) };
    case 'skip': {
      if (!SKIPPABLE.has(state.step) || state.step === 'reveal') return state;
      const key = ANSWER_KEY[state.step as Exclude<ScreenId, 'reveal'>];
      const answers: IntakeAnswers = { ...state.answers };
      delete answers[key];
      answers.skipped = [...(answers.skipped ?? []).filter((s) => s !== state.step), state.step];
      return { step: nextScreen(state.step, answers), answers };
    }
    case 'back': {
      const prev = prevScreen(state.step, state.answers);
      return prev ? { ...state, step: prev } : state;
    }
    case 'goto':
      return visibleScreens(state.answers).includes(action.screen) ? { ...state, step: action.screen } : state;
  }
}

/** 0 on the first screen, 1 on the reveal. */
export function progressOf(step: ScreenId, a: IntakeAnswers): number {
  const list = visibleScreens(a);
  const i = Math.max(0, list.indexOf(step));
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
  return weight && distance && measure && body ? { weight, distance, measure, body } : undefined;
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
  const a: IntakeAnswers = {
    goal: oneOf(ids(GOALS), o.goal),
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
    age: oneOf(ids(AGE_RANGES), o.age),
    skipped: manyOf(SCREENS, o.skipped),
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
    const step = oneOf(SCREENS, o.step) ?? 'goal';
    return { step: visibleScreens(answers).includes(step) ? step : 'goal', answers };
  } catch {
    return null;
  }
}

export const serializeDraft = (s: FunnelState): string => JSON.stringify(s);
