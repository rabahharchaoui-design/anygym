// The intake funnel (SPEC 14, PLAN 3.3): one question per screen, a big title top left, a round
// back button, the one action pinned in the thumb zone. Single choice screens move on by
// themselves about 250 ms after the tap (the card pulses, the next screen slides in on the shared
// page transition); multi select and form screens have Continue, greyed until there is an answer.
// The answers are kept as a draft on every change, saved on the profile at the reveal.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { EdgeSwipe } from '../../ui/EdgeSwipe';
import { PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { pickPlan } from '../../lib/intake/planPick';
import { useMoreBelow } from './useMoreBelow';
import { useNav, withTransition, type NavKind } from '../../ui/nav';
import { bodyPref } from '../../lib/bodyPref';
import {
  canContinue,
  funnelReducer,
  KIND,
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
import { getProfile, INTAKE_DRAFT_KEY, intakeDoneHere, readIntakeDraft, redoAnswers, writeIntakeDraft } from '../../db/intake';
import { NO_HANDLERS, stepBody, type StepHandlers } from './stepBody';
import { NoPlanNotice } from './NoPlan';
import { PlanSoFar, STRIP_SCREENS, useStripFit } from './PlanSoFar';
import { Reveal } from './Reveal';
import { generate } from '../../data/generator';
import { generatorInputOf } from '../../lib/intake/yourPlan';
import { STAYS_HERE, STAYS_HERE_FIRST } from './copy';
import styles from './Intake.module.css';

/** How long a tapped card pulses before the next screen comes in. */
export const AUTO_ADVANCE_MS = 250;

/**
 * PLAN 3.3a: every screen has its title and one short honest line on why it asks: what the answer
 * does today. Never a use that does not exist: PLAN 3.5u, a question whose feature is not built
 * (win, when, bodyweight) is not asked at all (HIDDEN_SCREENS in lib/intake/funnel.ts).
 */
type Copy = { title: string; why: string };
const COPY: Record<ScreenId, Copy> = {
  goal: { title: "What's your main goal?", why: 'Pick up to 2. The first one leads your plan.' },
  units: { title: 'Your units', why: "Set from your phone's region." },
  // PLAN 3.5: a plan built from the answers uses focus, style, cardio, go easy on and the exercise lists.
  focus: { title: 'What do you want to work on?', why: 'Optional. Adds sets here.' },
  win: { title: 'What would make this a win?', why: 'Optional. Shapes your coach tips.' },
  experience: { title: 'How long have you been training?', why: 'Helps pick a plan at your level.' },
  days: { title: 'How many days a week?', why: 'Picks a plan with this many days.' },
  weekdays: { title: 'Which days work best?', why: 'Used to lay out your week.' },
  minutes: { title: 'How long per workout?', why: 'Checked against how long each plan takes.' },
  place: { title: 'Where do you usually train?', why: 'Sets up your gym and what it has.' },
  equipment: { title: 'What does your gym have?', why: 'Plans use what is on, or swap. Tap ⓘ if unsure.' },
  style: { title: 'How do you like to train?', why: 'Optional. Steers the exercises you get.' },
  cardio: { title: 'How do you feel about cardio?', why: 'Optional. Suggests cardio you like.' },
  easyOn: { title: 'Anything to go easy on?', why: 'Optional. Swaps lifts that strain these.' },
  exercises: { title: 'Any favorites, or ones to avoid?', why: 'Optional. Plans will add or leave these out.' },
  when: { title: 'When do you usually work out?', why: 'Optional. Times your reminders.' },
  bodyweight: { title: 'What do you weigh?', why: 'Optional. Suggests starting weights.' },
  about: { title: 'About you', why: 'All optional. Only what you add is kept.' },
  noPlan: { title: '', why: '' },
  reveal: { title: 'Your plan', why: '' },
};

const NUMERIC: ReadonlySet<string> = new Set(['days', 'minutes']);

const WHY: Partial<Record<ScreenId, string>> = {
  goal: 'Pick at least one',
  equipment: 'Add your dumbbell weights',
  focus: 'Pick at least one',
  win: 'Pick at least one',
  weekdays: 'Pick your days, or skip',
  cardio: 'Pick one',
  easyOn: 'Pick one, or None',
  exercises: 'Pick one, or skip',
  bodyweight: 'Slide or tap the ruler',
  about: 'Add one, or skip',
};

/** Units from the region; the body starts unpicked unless this phone already chose one. */
function withUnits(a: IntakeAnswers): IntakeAnswers {
  if (a.units) return a;
  return { ...a, units: { ...unitsForLocale(phoneLocale()), ...(bodyPref.picked() ? { body: bodyPref.get() } : {}) } };
}

/** The why line under a title. Round 3: weekdays has one prompt only, the count sits in the button's reason. */
function subOf(step: ScreenId, _a?: IntakeAnswers): string | undefined {
  return COPY[step].why || undefined;
}

function readDraft(): FunnelState | null {
  try {
    return parseDraft(localStorage.getItem(INTAKE_DRAFT_KEY));
  } catch {
    // Blocked storage: the draft is read from IndexedDB kv, just after.
    return null;
  }
}

export function IntakeScreen() {
  const [params] = useSearchParams();
  const redo = params.get('redo') === '1';
  // A fresh start resumes its draft at once when localStorage has it; else it looks in IndexedDB
  // first (a blocked localStorage). A redo loads the saved answers first.
  const [state, setState] = useState<FunnelState | null>(() => (redo ? null : readDraft()));
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    let alive = true;
    if (redo) {
      redoAnswers({ ...unitsForLocale(phoneLocale()), ...(bodyPref.picked() ? { body: bodyPref.get() } : {}) })
        .then((a) => alive && setState(startState(a)))
        .catch(() => alive && setState(startState(withUnits({}))));
    } else if (!readDraft()) {
      readIntakeDraft()
        .catch(() => null)
        .then((text) => alive && setState((now) => now ?? parseDraft(text) ?? startState(withUnits({}))));
    }
    if (!redo && intakeDoneHere() && !readDraft()) {
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
  useStripFit(scroller);
  useMoreBelow(scroller);
  // What a gym is compared with when saving: a redo's starting answers, then what was last saved.
  const baseline = useRef<IntakeAnswers | undefined>(redo ? initial.answers : undefined);

  // Every answer is kept as it is given (a draft; a redo keeps its own copy only in memory).
  useEffect(() => {
    if (!redo) void writeIntakeDraft(serializeDraft(state));
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
    // PLAN 3.5: and only when the generator cannot build a week with this gear either.
    const noFit = ref.current.step === 'equipment' && pickPlan(PLANS, SWAP_DATA, a).kind === 'none' && !generate(generatorInputOf(a)).ok;
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
  else if (step === 'noPlan') content = <NoPlanNotice answers={answers} onBack={() => back()} onKeepGoing={() => apply({ type: 'next' }, 'push')} />;
  else {
    const kind = KIND[step];
    const copy = COPY[step];
    const showBack = step !== 'goal' || redo;
    const first = step === 'goal';
    // On the last question Skip already goes to the reveal.
    // 3.5f round 3 (M6, B2): not on the love / never cards (the top Skip does it), where every line counts.
    const deckStep = step === 'exercises';
    const skipRestButton = PERSONAL_GROUP.has(step) && step !== 'about' && !deckStep ? (
      <button type="button" className={`${styles.skipRest} pressable`} onClick={skipRest} data-testid="skip-rest">
        Skip the rest
      </button>
    ) : null;
    const ready = canContinue(step, answers);
    content = (
      <div className={styles.screen} data-testid="intake" data-step={step}>
        <header className={styles.top}>
          {showBack ? <BackButton label={step === 'goal' ? 'Back to Settings' : 'Back'} onPress={() => back()} /> : <span className={styles.topSpacer} aria-hidden="true" />}
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
              <p className={styles.introLine}>Train in any gym. About 2 minutes.</p>
            </div>
          )}
          <h1 className={styles.title}>{copy.title}</h1>
          {subOf(step, answers) && (
            <p className={styles.sub} data-testid="why">
              {subOf(step, answers)}
            </p>
          )}
          {stepBody(step, answers, handlers, pulse)}
          {STRIP_SCREENS.has(step) && <PlanSoFar answers={answers} />}
        </main>
        {kind === 'single' ? (
          <div className={styles.foot}>
            {skipRestButton}
            <p className={styles.footNote}>{first ? STAYS_HERE_FIRST : STAYS_HERE}</p>
          </div>
        ) : (
          <BottomCTA onPress={next} disabled={!ready} {...(deckStep ? {} : { disabledReason: step === 'weekdays' && answers.days ? `Pick ${answers.days}, or skip` : WHY[step] })} reasonAndNote={!deckStep} above={skipRestButton} {...(deckStep ? {} : { note: first ? STAYS_HERE_FIRST : STAYS_HERE })} testId="intake-cta" className={styles.cta}>
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
                {subOf(previous, answers) && <p className={styles.sub}>{subOf(previous, answers)}</p>}
                {stepBody(previous, answers, NO_HANDLERS, null)}
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
