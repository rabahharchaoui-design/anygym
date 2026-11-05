// The intake funnel (SPEC 14, PLAN 3.3): one question per screen, a big title top left, a round
// back button, the one action pinned in the thumb zone. Single choice screens move on by
// themselves about 250 ms after the tap (the card pulses, the next screen slides in on the shared
// page transition); multi select and form screens have Continue, greyed until there is an answer.
// The answers are kept as a draft on every change, saved on the profile at the reveal.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { Button } from '../../ui/Button';
import { EdgeSwipe } from '../../ui/EdgeSwipe';
import { useTapGuard } from '../../hooks/useTapGuard';
import { PLANS } from '../../data/plans';
import { planNeeds } from '../../data/places';
import { getActiveGym, startDb } from '../../db/bootstrap';
import { startWorkout } from '../../db/workouts';
import type { DumbbellRange } from '../../db/types';
import { noPlanWords, pickPlan } from '../../lib/intake/planPick';
import { persistAnswers } from './persist';
import { useNav, withTransition, type NavKind } from '../../ui/nav';
import { bodyPref } from '../../lib/bodyPref';
import {
  ANSWER_KEY,
  canContinue,
  equipmentChoices,
  funnelReducer,
  KIND,
  needsDumbbellRange,
  parseDraft,
  PERSONAL_GROUP,
  prevScreen,
  progressOf,
  serializeDraft,
  SKIPPABLE,
  startState,
  type AnswerId,
  type FunnelAction,
  type FunnelState,
  type IntakeAnswers,
  type ScreenId,
} from '../../lib/intake/funnel';
import { phoneLocale, unitsForLocale } from '../../lib/intake/region';
import {
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
import { clearIntakeDraft, getProfile, INTAKE_DRAFT_KEY, intakeDoneHere, redoAnswers } from '../../db/intake';
import { AboutStep, BodyweightStep, BothExercisesStep, EquipmentStep, MultiChoice, SingleChoice, UnitsStep } from './Steps';
import { Reveal } from './Reveal';
import { STAYS_HERE, STAYS_HERE_FIRST } from './copy';
import styles from './Intake.module.css';

/** How long a tapped card pulses before the next screen comes in. */
export const AUTO_ADVANCE_MS = 250;

const DAY_OPTIONS: Option[] = DAYS.map((d) => ({ id: String(d), label: `${d} days` }));
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
  equipment: { title: 'What does your gym have?', sub: 'Tap to turn on or off. Tap ⓘ for anything new.' },
  style: { title: 'How do you like to train?' },
  cardio: { title: 'How do you feel about cardio?' },
  cardioFavorites: { title: 'Any cardio you like?', sub: 'Pick any.' },
  easyOn: { title: 'Anything to go easy on?', sub: 'If something hurts, stop and check with a professional.' },
  exercises: { title: 'Exercises you love or never want', sub: 'Optional. Tap any.' },
  when: { title: 'When do you usually work out?' },
  bodyweight: { title: 'What do you weigh?', sub: 'Saved for later. Nothing uses it yet.' },
  about: { title: 'About you', sub: 'All optional.' },
  noPlan: { title: '' },
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
};
const NUMERIC: ReadonlySet<string> = new Set(['days', 'minutes']);

const MULTI_OPTIONS: Partial<Record<ScreenId, readonly Option[]>> = {
  focus: FOCUS,
  win: WINS,
  weekdays: WEEKDAYS,
  cardioFavorites: CARDIO_FAVORITES,
  easyOn: EASY_ON,
};


const WHY: Partial<Record<ScreenId, string>> = {
  equipment: 'Add your dumbbell weights',
  focus: 'Pick at least one',
  win: 'Pick at least one',
  weekdays: 'Pick your days, or skip',
  cardioFavorites: 'Pick one, or skip',
  easyOn: 'Pick one, or None',
  exercises: 'Pick one, or skip',
  bodyweight: 'Slide or tap the ruler',
  about: 'Add one, or skip',
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
  if (!state) return <div className={styles.frame} />;
  return <Funnel initial={state} redo={redo} />;
}

function Funnel({ initial, redo }: { initial: FunnelState; redo: boolean }) {
  const go = useNav();
  const [state, setState] = useState(initial);
  const ref = useRef(state);
  const timer = useRef<number>(undefined);
  const [pulse, setPulse] = useState<string | null>(null);
  const scroller = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
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

  const set = (screen: AnswerId, value: unknown) => apply({ type: 'set', screen, value }, 'none');
  const next = () => {
    const a = ref.current.answers;
    // Right after the equipment: when no plan can fit, say so now, not 9 questions later.
    const noFit = ref.current.step === 'equipment' && pickPlan(PLANS, planNeeds, a).kind === 'none';
    apply({ type: 'next', noFit }, 'push');
  };
  const skip = () => {
    window.clearTimeout(timer.current);
    apply({ type: 'skip' }, 'push');
  };
  const skipRest = () => {
    window.clearTimeout(timer.current);
    apply({ type: 'skipRest' }, 'push');
  };
  const back = (kind: NavKind = 'pop') => {
    window.clearTimeout(timer.current);
    if (ref.current.step === 'goal') {
      if (redo) go('/settings', { kind, replace: true });
      return;
    }
    apply({ type: 'back' }, kind);
  };
  const pickAndGo = (screen: AnswerId, id: string) => {
    set(screen, NUMERIC.has(screen) ? Number(id) : id);
    setPulse(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(next, AUTO_ADVANCE_MS);
  };

  const { step, answers } = state;
  const handlers: StepHandlers = { set, pickAndGo, range: (value) => apply({ type: 'range', value }, 'none') };
  const previous = prevScreen(step, answers);

  let content: ReactNode;
  if (step === 'reveal') content = <Reveal answers={answers} redo={redo} onBack={() => back()} baseline={baseline} />;
  else if (step === 'noPlan') content = <NoPlanNotice answers={answers} baseline={baseline} onBack={() => back()} onKeepGoing={() => apply({ type: 'next' }, 'push')} />;
  else {
    const kind = KIND[step];
    const copy = COPY[step];
    const showBack = step !== 'goal' || redo;
    const first = step === 'goal';
    // On the last question Skip already goes to the reveal.
    const skipRestButton = PERSONAL_GROUP.has(step) && step !== 'about' ? (
      <button type="button" className={`${styles.skipRest} pressable`} onClick={skipRest} data-testid="skip-rest">
        Skip the rest
      </button>
    ) : null;
    const ready = canContinue(step, answers);
    content = (
      <div className={styles.screen} data-testid="intake" data-step={step}>
        <header className={styles.top}>
          {showBack ? <BackButton label="Back" onPress={() => back()} /> : <span className={styles.topSpacer} aria-hidden="true" />}
          <div className={styles.progress} role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressOf(step, answers) * 100)}>
            <span className={styles.progressFill} style={{ width: `${Math.max(4, progressOf(step, answers) * 100)}%` }} />
          </div>
          {SKIPPABLE.has(step) ? (
            <button type="button" className={`${styles.skip} pressable`} onClick={skip} data-testid="skip">
              Skip
            </button>
          ) : (
            <span className={styles.topSpacer} aria-hidden="true" />
          )}
        </header>
        <main ref={scroller} className={styles.body} data-scroller>
          {first && !redo && (
            <div className={styles.intro} data-testid="intake-intro">
              <span className={styles.wordmark}>AnyGym</span>
              <p className={styles.introLine}>A plan for whatever gym you&apos;re in. About 2 minutes.</p>
            </div>
          )}
          <h1 className={styles.title}>{copy.title}</h1>
          {copy.sub && <p className={styles.sub}>{copy.sub}</p>}
          {stepBody(step, answers, handlers, pulse)}
        </main>
        {kind === 'single' ? (
          <div className={styles.foot}>
            {skipRestButton}
            <p className={styles.footNote}>{first ? STAYS_HERE_FIRST : STAYS_HERE}</p>
          </div>
        ) : (
          <BottomCTA onPress={next} disabled={!ready} disabledReason={WHY[step]} reasonInButton above={skipRestButton} note={STAYS_HERE} testId="intake-cta" className={styles.cta}>
            Continue
          </BottomCTA>
        )}
      </div>
    );
  }
  return (
    <div className={styles.frame}>
      <div ref={layer} className={styles.layer}>
        {content}
      </div>
      {/* SPEC 23.1: the edge swipe on every pushed screen. The ruler sits clear of the 20 pt strip. */}
      {previous && previous !== 'noPlan' && previous !== 'reveal' && (
        <EdgeSwipe
          key={`swipe-${step}`}
          layerRef={layer}
          onBack={() => back('none')}
          under={() => (
            <div className={styles.screen}>
              <div className={styles.top}>
                <span className={styles.topSpacer} />
              </div>
              <div className={styles.body}>
                <h2 className={styles.title}>{COPY[previous].title}</h2>
                {COPY[previous].sub && <p className={styles.sub}>{COPY[previous].sub}</p>}
                {stepBody(previous, answers, NO_HANDLERS, null)}
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}

type StepHandlers = { set: (screen: AnswerId, value: unknown) => void; pickAndGo: (screen: AnswerId, id: string) => void; range: (value: DumbbellRange | undefined) => void };
const NO_HANDLERS: StepHandlers = { set: () => undefined, pickAndGo: () => undefined, range: () => undefined };

/** The question part of a screen: what the user answers. */
function stepBody(step: Exclude<ScreenId, 'reveal' | 'noPlan'> | ScreenId, answers: IntakeAnswers, h: StepHandlers, pulse: string | null): ReactNode {
  if (KIND[step] === 'single') {
    const screen = step as AnswerId;
    return <SingleChoice options={SINGLE_OPTIONS[step]!} value={answers[ANSWER_KEY[screen]] as string | number | undefined} onPick={(id) => h.pickAndGo(screen, id)} pulse={pulse} testId={`q-${step}`} />;
  }
  if (MULTI_OPTIONS[step]) {
    const screen = step as AnswerId;
    return (
      <MultiChoice
        options={MULTI_OPTIONS[step]!}
        value={answers[ANSWER_KEY[screen]] as string[] | undefined}
        onChange={(v) => h.set(screen, v)}
        only={step === 'easyOn' ? 'none' : undefined}
        columns={step === 'weekdays' ? '4' : '2'}
        testId={`q-${step}`}
      />
    );
  }
  switch (step) {
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
      return <BothExercisesStep love={answers.love ?? []} never={answers.never ?? []} onLove={(v) => h.set('love', v.length ? v : undefined)} onNever={(v) => h.set('never', v.length ? v : undefined)} />;
    case 'bodyweight':
      return <BodyweightStep value={answers.bodyweight} unit={answers.units?.weight ?? 'kg'} onChange={(v) => h.set('bodyweight', v)} />;
    case 'about':
      return <AboutStep answers={answers} measure={answers.units?.measure ?? 'cm'} onName={(v) => h.set('name', v)} onHeight={(v) => h.set('height', v)} onAge={(v) => h.set('age', v)} />;
    default:
      return null;
  }
}

/** Right after the equipment, when no plan can fit: say so, and let them start or keep going. */
function NoPlanNotice({ answers, baseline, onBack, onKeepGoing }: { answers: IntakeAnswers; baseline: MutableRefObject<IntakeAnswers | undefined>; onBack: () => void; onKeepGoing: () => void }) {
  const go = useNav();
  const words = noPlanWords(answers.place);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const quick = useTapGuard(async () => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      await persistAnswers(answers, baseline);
      const gym = (await getActiveGym()) ?? (await startDb());
      const s = await startWorkout(gym.id);
      clearIntakeDraft();
      go(`/workout/${s.id}`, { kind: 'push', replace: true });
    } catch {
      setError('Could not start the workout. Try again.');
    } finally {
      busy.current = false;
    }
  });
  return (
    <div className={styles.screen} data-testid="intake" data-step="noPlan">
      <header className={styles.top}>
        <BackButton label="Back" onPress={onBack} />
        <div className={styles.progress} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${Math.max(4, progressOf('noPlan', answers) * 100)}%` }} />
        </div>
        <span className={styles.topSpacer} aria-hidden="true" />
      </header>
      <main className={styles.body} data-scroller>
        <h1 className={styles.title}>{words.title}</h1>
        <p className={styles.sub}>{words.quick}</p>
        <p className={styles.sub}>Your answers so far are kept either way.</p>
      </main>
      <BottomCTA
        onPress={() => void quick()}
        note={STAYS_HERE}
        testId="noplan-cta"
        className={styles.cta}
        above={
          <>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <Button variant="secondary" className={styles.keepGoing} onClick={onKeepGoing} data-testid="noplan-continue">
              Keep going
            </Button>
          </>
        }
      >
        Start a quick workout
      </BottomCTA>
    </div>
  );
}
