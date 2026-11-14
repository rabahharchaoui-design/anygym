// Read older or edited answers without inventing missing personal information.
import { EQUIPMENT_IDS, type DumbbellRange, type Unit } from '../../db/types';
import type { BodyKind } from '../bodyArt';
import { validDumbbellRange } from '../load';
import { AGE_RANGES, CARDIO, CARDIO_FAVORITES, DAYS, EASY_ON, EXPERIENCE, FOCUS, GOALS, ids, MINUTES, PLACES, STYLES, WEEKDAYS, WHEN, WINS, FOCUS_PICKS, SCHEDULE_STYLES } from './options';
import type { Bodyweight, DistanceUnit, Height, IntakeAnswers, MeasureUnit, UnitsAnswer } from './answers';
import { ANSWER_IDS, PERSONAL_GROUP, HIDDEN_SCREENS, MAX_GOALS } from './funnel';
import { normalizeFocusPicks } from '../plan/focus';
const clean = (a: IntakeAnswers): IntakeAnswers => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
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
    focusPicks: Array.isArray(o.focusPicks) ? normalizeFocusPicks(manyOf(ids(FOCUS_PICKS), o.focusPicks)) : undefined,
    scheduleStyle: oneOf(ids(SCHEDULE_STYLES), o.scheduleStyle),
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
    skipRestFrom: oneOf([...PERSONAL_GROUP].filter((s) => !HIDDEN_SCREENS.has(s)), o.skipRestFrom),
    skipped: manyOf(ANSWER_IDS, o.skipped),
  };
  if (a.skipped && !a.skipped.length) delete a.skipped;
  return clean(a);
}

