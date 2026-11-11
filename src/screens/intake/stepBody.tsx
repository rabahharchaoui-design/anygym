// The question part of each intake screen (SPEC 14), and the options its choice screens show. Moved
// out of IntakeScreen.tsx as it was (PLAN 3.5f, code organization).
import type { ReactNode } from 'react';
import { PLANS } from '../../data/plans';
import { estimateDayMinutes } from '../../lib/plans';
import type { DumbbellRange } from '../../db/types';
import { ANSWER_KEY, equipmentChoices, goalsOf, KIND, needsDumbbellRange, weekdayCountNote, type AnswerId, type IntakeAnswers, type ScreenId } from '../../lib/intake/funnel';
import { DAYS, EASY_ON, EXPERIENCE, FOCUS, MINUTES, PLACES, STYLES, WEEKDAYS, WHEN, WINS, type Option } from '../../lib/intake/options';
import { gymKitOf } from '../../lib/intake/planFit';
import { ExerciseDeckStep } from './ExerciseDeckStep';
import { AboutStep, BodyweightStep } from './AboutSteps';
import { CardioStep, EquipmentStep, GoalChoice, MultiChoice, SingleChoice, UnitsStep } from './Steps';
import styles from './Intake.module.css';

// P9: a quiet hint only where it is true of the plans that ship today (from their own data).
const PLAN_AVG_MIN = PLANS.map((p) => p.days.reduce((t, d) => t + estimateDayMinutes(d), 0) / p.days.length);
const fitsMinutes = (m: number) => PLAN_AVG_MIN.some((avg) => (m >= 75 ? avg > 60 : avg <= m));
const DAY_OPTIONS: Option[] = DAYS.map((d) => ({ id: String(d), label: `${d} days`, hint: PLANS.some((p) => p.daysPerWeek === d) ? 'Our curated plans run this many' : undefined }));
const MINUTE_OPTIONS: Option[] = MINUTES.map((m) => ({ id: String(m), label: m === 75 ? '75+ min' : `${m} min`, hint: fitsMinutes(m) ? 'Our curated plans take about this long' : undefined }));
const DAY_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
/** P8: the week as one list of days, never stretched tiles. */
const WEEKDAY_ROWS: Option[] = WEEKDAYS.map((d) => ({ id: d.id, label: DAY_NAMES[d.id]! }));

const SINGLE_OPTIONS: Partial<Record<ScreenId, readonly Option[]>> = {
  experience: EXPERIENCE,
  days: DAY_OPTIONS,
  minutes: MINUTE_OPTIONS,
  place: PLACES,
  style: STYLES,
  when: WHEN,
};

const MULTI_OPTIONS: Partial<Record<ScreenId, readonly Option[]>> = {
  focus: FOCUS,
  win: WINS,
  weekdays: WEEKDAY_ROWS,
  easyOn: EASY_ON,
};

export type StepHandlers = { set: (screen: AnswerId, value: unknown) => void; pickAndGo: (screen: AnswerId, id: string) => void; range: (value: DumbbellRange | undefined) => void };
export const NO_HANDLERS: StepHandlers = { set: () => undefined, pickAndGo: () => undefined, range: () => undefined };

/** The question part of a screen: what the user answers. */
export function stepBody(step: Exclude<ScreenId, 'reveal' | 'noPlan'> | ScreenId, answers: IntakeAnswers, h: StepHandlers, pulse: string | null): ReactNode {
  if (step === 'goal') return <GoalChoice value={goalsOf(answers)} onChange={(v) => h.set('goal', v)} />;
  if (KIND[step] === 'single') {
    const screen = step as AnswerId;
    return <SingleChoice options={SINGLE_OPTIONS[step]!} value={answers[ANSWER_KEY[screen]] as string | number | undefined} onPick={(id) => h.pickAndGo(screen, id)} pulse={pulse} testId={`q-${step}`} />;
  }
  if (MULTI_OPTIONS[step]) {
    const screen = step as AnswerId;
    const countNote = step === 'weekdays' ? weekdayCountNote(answers) : null;
    return (
      <>
        <MultiChoice
          options={MULTI_OPTIONS[step]!}
          value={answers[ANSWER_KEY[screen]] as string[] | undefined}
          onChange={(v) => h.set(screen, v)}
          only={step === 'easyOn' ? 'none' : undefined}
          columns={step === 'weekdays' ? '1' : '2'}
          testId={`q-${step}`}
        />
        {step === 'weekdays' && (
          <p className={styles.countNote} role="status" data-testid="weekday-count">
            {countNote ?? ''}
          </p>
        )}
        {step === 'easyOn' && (
          <p className={styles.safety} data-testid="easy-note">
            A plan built from your answers leaves out lifts that load these. If something hurts, stop and check with a professional.
          </p>
        )}
      </>
    );
  }
  switch (step) {
    case 'cardio':
      return <CardioStep cardio={answers.cardio} favorites={answers.cardioFavorites} onCardio={(id) => h.set('cardio', id)} onFavorites={(v) => h.set('cardioFavorites', v)} />;
    case 'units':
      return <UnitsStep value={answers.units!} onChange={(v) => h.set('units', v)} />;
    case 'equipment':
      return (
        <EquipmentStep
          value={answers.equipment ?? []}
          onChange={(v) => h.set('equipment', v)}
          askRange={needsDumbbellRange(answers)}
          range={answers.dumbbellRange}
          unit={answers.units?.weight ?? 'kg'}
          onRange={h.range}
          choices={equipmentChoices(answers.place)}
        />
      );
    case 'exercises':
      return <ExerciseDeckStep gym={gymKitOf(answers)} love={answers.love ?? []} never={answers.never ?? []} onLove={(v) => h.set('love', v.length ? v : undefined)} onNever={(v) => h.set('never', v.length ? v : undefined)} />;
    case 'bodyweight':
      return <BodyweightStep value={answers.bodyweight} unit={answers.units?.weight ?? 'kg'} onChange={(v) => h.set('bodyweight', v)} />;
    case 'about':
      return <AboutStep answers={answers} measure={answers.units?.measure ?? 'cm'} onName={(v) => h.set('name', v)} onHeight={(v) => h.set('height', v)} onAge={(v) => h.set('age', v)} />;
    default:
      return null;
  }
}
