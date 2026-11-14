// Stored intake answers; optional fields keep older profiles readable.
import type { DumbbellRange, EquipmentId, Unit } from '../../db/types';
import type { BodyKind } from '../bodyArt';
import type { AnswerId, ScreenId } from './funnel';
import type { AgeRangeId, CardioFavoriteId, CardioId, DaysPerWeek, EasyOnId, ExperienceId, FocusId, FocusPickId, GoalId, Minutes, PlaceAnswer, ScheduleStyle, StyleId, WeekdayId, WhenId, WinId } from './options';

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
  focusPicks?: FocusPickId[];
  scheduleStyle?: ScheduleStyle;
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

