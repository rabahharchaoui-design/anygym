// The intake funnel (SPEC 14, PLAN 3.3): one question per screen, a big title top left, a round
// back button, the one action pinned in the thumb zone. Single choice screens move on by
// themselves about 250 ms after the tap (the card pulses, the next screen slides in on the shared
// page transition); multi select and form screens have Continue, greyed until there is an answer.
// The answers are kept as a draft on every change, saved on the profile at the reveal.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { useNav, withTransition, type NavKind } from '../../ui/nav';
import { bodyPref } from '../../lib/bodyPref';
import {
  ANSWER_KEY,
  canContinue,
  funnelReducer,
  KIND,
  needsDumbbellRange,
  parseDraft,
  progressOf,
  serializeDraft,
  SKIPPABLE,
  startState,
  type FunnelAction,
  type FunnelState,
  type IntakeAnswers,
  type ScreenId,
} from '../../lib/intake/funnel';
import { phoneLocale, unitsForLocale } from '../../lib/intake/region';
import {
  AGE_RANGES,
  CARDIO,
  CARDIO_FAVORITES,
  DAYS,
  EASY_ON,
  EXPERIENCE,
  FOCUS,
  GOALS,
  MINUTES,
  PLACES,
  STYLES,
  WEEKDAYS,
  WHEN,
  WINS,
  type Option,
} from '../../lib/intake/options';
import { getProfile, INTAKE_DRAFT_KEY, intakeDoneHere, redoAnswers } from '../../db/intake';
import { BodyweightStep, EquipmentStep, ExercisesStep, HeightStep, MultiChoice, NameStep, SingleChoice, UnitsStep } from './Steps';
import { Reveal } from './Reveal';
import { STAYS_HERE } from './copy';
import styles from './Intake.module.css';

/** How long a tapped card pulses before the next screen comes in. */
export const AUTO_ADVANCE_MS = 250;

const DAY_OPTIONS: Option[] = DAYS.map((d) => ({ id: String(d), label: `${d} days a week` }));
const MINUTE_OPTIONS: Option[] = MINUTES.map((m) => ({ id: String(m), label: m === 75 ? '75+ min' : `${m} min` }));

type Copy = { title: string; sub?: string };
const COPY: Record<ScreenId, Copy> = {
  goal: { title: "What's your main goal?" },
  units: { title: 'Your units', sub: "Set from your phone's region." },
  focus: { title: 'What do you want to work on?', sub: 'Pick any.' },
  win: { title: 'What would make this a win?', sub: 'Pick any.' },
  experience: { title: 'How long have you been training?' },
  days: { title: 'How many days a week?' },
  weekdays: { title: 'Which days work best?', sub: 'Used to lay out your week.' },
  minutes: { title: 'How long per workout?' },
  place: { title: 'Where do you usually train?' },
  equipment: { title: "What's there?", sub: 'Tap to turn on or off. Tap ⓘ for anything new.' },
  style: { title: 'How do you like to train?' },
  cardio: { title: 'How do you feel about cardio?' },
  cardioFavorites: { title: 'Any cardio you like?', sub: 'Pick any.' },
  easyOn: { title: 'Anything to go easy on?', sub: 'If something hurts, stop and check with a professional.' },
  love: { title: 'Any exercises you love?', sub: 'Optional. Tap any you like.' },
  never: { title: 'Any you never want to see?', sub: 'Optional.' },
  when: { title: 'When do you usually work out?' },
  name: { title: 'What should we call you?', sub: 'For your passport.' },
  bodyweight: { title: 'What do you weigh?', sub: 'Only used to suggest starting weights.' },
  height: { title: 'How tall are you?' },
  age: { title: 'How old are you?' },
  reveal: { title: 'Your plan' },
};

const SINGLE_OPTIONS: Partial<Record<ScreenId, readonly Option[]>> = {
  goal: GOALS,
  experience: EXPERIENCE,
  days: DAY_OPTIONS,
  minutes: MINUTE_OPTIONS,
  place: PLACES,
  style: STYLES,
  cardio: CARDIO,
  when: WHEN,
  age: AGE_RANGES,
};
const NUMERIC: ReadonlySet<ScreenId> = new Set<ScreenId>(['days', 'minutes']);

const MULTI_OPTIONS: Partial<Record<ScreenId, readonly Option[]>> = {
  focus: FOCUS,
  win: WINS,
  weekdays: WEEKDAYS,
  cardioFavorites: CARDIO_FAVORITES,
  easyOn: EASY_ON,
};


const WHY: Partial<Record<ScreenId, string>> = {
  equipment: 'Fill in your dumbbells, or turn them off',
  focus: 'Pick at least one',
  win: 'Pick at least one',
  weekdays: 'Pick your days, or skip',
  cardioFavorites: 'Pick one, or skip',
  easyOn: 'Pick one, or None',
  love: 'Pick one, or skip',
  never: 'Pick one, or skip',
  name: 'Type your name, or skip',
  bodyweight: 'Slide the ruler, or skip',
  height: 'Spin the wheel, or skip',
};

function withUnits(a: IntakeAnswers): IntakeAnswers {
  return a.units ? a : { ...a, units: { ...unitsForLocale(phoneLocale()), body: bodyPref.get() } };
}

function readDraft(): FunnelState | null {
  try {
    return parseDraft(localStorage.getItem(INTAKE_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function IntakeScreen() {
  const [params] = useSearchParams();
  const redo = params.get('redo') === '1';
  // A fresh start resumes its draft at once; a redo loads the saved answers first.
  const [state, setState] = useState<FunnelState | null>(() => (redo ? null : (readDraft() ?? startState(withUnits({})))));
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    let alive = true;
    if (redo) {
      redoAnswers({ ...unitsForLocale(phoneLocale()), body: bodyPref.get() })
        .then((a) => alive && setState(startState(a)))
        .catch(() => alive && setState(startState(withUnits({}))));
    } else if (intakeDoneHere() && !readDraft()) {
      // Done already (an old link): Today, never the funnel again by itself.
      getProfile()
        .then((p) => alive && p?.intakeDoneAt !== undefined && setLeave(true))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [redo]);
  if (leave) return <Navigate to="/" replace />;
  if (!state) return <div className={styles.screen} />;
  return <Funnel initial={state} redo={redo} />;
}

function Funnel({ initial, redo }: { initial: FunnelState; redo: boolean }) {
  const go = useNav();
  const [state, setState] = useState(initial);
  const ref = useRef(state);
  const timer = useRef<number>(undefined);
  const [pulse, setPulse] = useState<string | null>(null);
  const scroller = useRef<HTMLElement>(null);
  // What a gym is compared with when saving: a redo's starting answers, then what was last saved.
  const baseline = useRef<IntakeAnswers | undefined>(redo ? initial.answers : undefined);

  // Every answer is kept as it is given (a draft; a redo keeps its own copy only in memory).
  useEffect(() => {
    if (redo) return;
    try {
      localStorage.setItem(INTAKE_DRAFT_KEY, serializeDraft(state));
    } catch {
      // Private mode: the funnel still works, it just will not resume after a reload.
    }
  }, [state, redo]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const apply = useCallback((action: FunnelAction, kind: NavKind) => {
    const before = ref.current;
    const next = funnelReducer(before, action);
    ref.current = next;
    if (next.step !== before.step) {
      setPulse(null);
      withTransition(kind, () => setState(next));
    } else setState(next);
  }, []);

  // A new screen starts at its top.
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [state.step]);

  const set = (screen: Exclude<ScreenId, 'reveal'>, value: unknown) => apply({ type: 'set', screen, value }, 'none');
  const next = () => apply({ type: 'next' }, 'push');
  const skip = () => {
    window.clearTimeout(timer.current);
    apply({ type: 'skip' }, 'push');
  };
  const back = () => {
    window.clearTimeout(timer.current);
    if (ref.current.step === 'goal') {
      if (redo) go('/settings', { kind: 'pop', replace: true });
      return;
    }
    apply({ type: 'back' }, 'pop');
  };
  const pickAndGo = (screen: Exclude<ScreenId, 'reveal'>, id: string) => {
    set(screen, NUMERIC.has(screen) ? Number(id) : id);
    setPulse(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(next, AUTO_ADVANCE_MS);
  };

  const { step, answers } = state;
  const kind = KIND[step];
  const copy = COPY[step];
  const showBack = step !== 'goal' || redo;
  const skippable = SKIPPABLE.has(step);

  let body: ReactNode = null;
  if (step === 'reveal') {
    return <Reveal answers={answers} redo={redo} onBack={back} baseline={baseline} />;
  }
  const screen = step as Exclude<ScreenId, 'reveal'>;
  if (kind === 'single') {
    body = <SingleChoice options={SINGLE_OPTIONS[step]!} value={answers[ANSWER_KEY[screen]] as string | number | undefined} onPick={(id) => pickAndGo(screen, id)} pulse={pulse} testId={`q-${step}`} />;
  } else if (MULTI_OPTIONS[step]) {
    body = (
      <MultiChoice
        options={MULTI_OPTIONS[step]!}
        value={answers[ANSWER_KEY[screen]] as string[] | undefined}
        onChange={(v) => set(screen, v)}
        only={step === 'easyOn' ? 'none' : undefined}
        testId={`q-${step}`}
      />
    );
  } else if (step === 'units') {
    body = <UnitsStep value={answers.units!} onChange={(v) => set('units', v)} />;
  } else if (step === 'equipment') {
    body = (
      <EquipmentStep
        value={answers.equipment ?? []}
        onChange={(v) => set('equipment', v)}
        askRange={needsDumbbellRange(answers)}
        range={answers.dumbbellRange}
        unit={answers.units?.weight ?? 'kg'}
        onRange={(value) => apply({ type: 'range', value }, 'none')}
      />
    );
  } else if (step === 'love' || step === 'never') {
    body = (
      <ExercisesStep
        value={answers[step] ?? []}
        exclude={step === 'never' ? (answers.love ?? []) : (answers.never ?? [])}
        onChange={(v) => set(step, v.length ? v : undefined)}
        testId={`q-${step}`}
      />
    );
  } else if (step === 'name') {
    body = <NameStep value={answers.name ?? ''} onChange={(v) => set('name', v || undefined)} onDone={next} />;
  } else if (step === 'bodyweight') {
    body = <BodyweightStep value={answers.bodyweight} unit={answers.units?.weight ?? 'kg'} onChange={(v) => set('bodyweight', v)} />;
  } else if (step === 'height') {
    body = <HeightStep value={answers.height} measure={answers.units?.measure ?? 'cm'} onChange={(v) => set('height', v)} />;
  }

  const ready = canContinue(step, answers);
  return (
    <div className={styles.screen} data-testid="intake" data-step={step}>
      <header className={styles.top}>
        {showBack ? <BackButton label="Back" onPress={back} /> : <span className={styles.topSpacer} aria-hidden="true" />}
        <div className={styles.progress} role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressOf(step, answers) * 100)}>
          <span className={styles.progressFill} style={{ width: `${Math.max(4, progressOf(step, answers) * 100)}%` }} />
        </div>
        {skippable ? (
          <button type="button" className={`${styles.skip} pressable`} onClick={skip} data-testid="skip">
            Skip
          </button>
        ) : (
          <span className={styles.topSpacer} aria-hidden="true" />
        )}
      </header>
      <main ref={scroller} className={styles.body} data-scroller>
        <h1 className={styles.title}>{copy.title}</h1>
        {copy.sub && <p className={styles.sub}>{copy.sub}</p>}
        {body}
      </main>
      {kind === 'single' ? (
        <p className={styles.footNote}>{STAYS_HERE}</p>
      ) : (
        <BottomCTA onPress={next} disabled={!ready} disabledReason={WHY[step]} note={STAYS_HERE} testId="intake-cta" className={styles.cta}>
          Continue
        </BottomCTA>
      )}
    </div>
  );
}
