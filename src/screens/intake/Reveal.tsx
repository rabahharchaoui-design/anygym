// The plan reveal (SPEC 14 step 14, PLAN 3.3): the week builds in, one plain line on why it fits,
// then a lime check draws itself, and Start Day 1 goes straight into the workout. The plan is the
// best curated plan that fits the user's equipment today (the generator is PLAN 3.5); when none
// fits it says so and offers a quick workout. Never a made up plan.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { useNav } from '../../ui/nav';
import { useTapGuard } from '../../hooks/useTapGuard';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import { explainPick, noPlanWords, pickPlan, weekOf } from '../../lib/intake/planPick';
import { persistAnswers } from './persist';
import { useMoreBelow } from './useMoreBelow';
import { Button } from '../../ui/Button';
import { PLANS, planById } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { planFit } from '../../lib/intake/planFit';
import { clearIntakeDraft } from '../../db/intake';
import { getActiveGym, startDb } from '../../db/bootstrap';
import { choosePlan, choosePlanUndoable } from '../../db/planState';
import { startPlanDay, startWorkout } from '../../db/workouts';
import { STAYS_HERE } from './copy';
import styles from './Intake.module.css';

type Props = { answers: IntakeAnswers; redo: boolean; onBack: () => void; baseline: MutableRefObject<IntakeAnswers | undefined> };

export function Reveal({ answers, redo, onBack, baseline }: Props) {
  const go = useNav();
  const pick = useMemo(() => pickPlan(PLANS, SWAP_DATA, answers), [answers]);
  const [chosenId, setChosenId] = useState(pick.kind === 'plan' ? pick.plan.id : null);
  const plan = planById(chosenId ?? undefined);
  const fits = pick.kind === 'plan' ? [pick.plan, ...pick.others] : [];
  const week = plan ? weekOf(plan, answers) : [];
  // B1: the moves the day list will swap at this gym are said, never hidden.
  const fit = useMemo(() => (plan ? planFit(SWAP_DATA, plan, answers) : null), [plan, answers]);
  const words = plan ? explainPick(plan, answers, fit?.swapped ?? 0, fit?.noFit.length ?? 0) : null;
  const none = noPlanWords(answers.place);

  // The answers are saved as the reveal opens (profile, units, the first gym, the muscle map body).
  const [error, setError] = useState('');
  const saved = useRef<Promise<unknown> | null>(null);
  const save = () => {
    const p = persistAnswers(answers, baseline);
    saved.current = p;
    p.catch(() => setError('Could not save your answers. Try again.'));
    return p;
  };
  useEffect(() => {
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scroller = useRef<HTMLElement>(null);
  useMoreBelow(scroller);

  const busy = useRef(false);
  const act = useTapGuard(async (quickWorkout: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      await (saved.current ?? save()).catch(() => save());
      const gym = (await getActiveGym()) ?? (await startDb());
      if (redo) {
        if (!plan) {
          go('/settings', { kind: 'pop', replace: true });
          return;
        }
        const r = await choosePlanUndoable(plan.id);
        go('/', { kind: 'pop', replace: true, state: r.changed ? { toast: 'Plan saved', planUndo: { chosen: r.state, previous: r.previous ?? null } } : { toast: 'Answers saved' } });
        return;
      }
      if (!plan || quickWorkout) {
        const s = await startWorkout(gym.id);
        void clearIntakeDraft();
        go(`/workout/${s.id}`, { kind: 'push', replace: true });
        return;
      }
      await choosePlan(plan.id);
      const s = await startPlanDay(gym.id, plan.id, 0);
      void clearIntakeDraft();
      go(`/workout/${s.id}`, { kind: 'push', replace: true });
    } catch {
      setError(redo ? 'Could not save that. Try again.' : 'Could not start the workout. Try again.');
    } finally {
      busy.current = false;
    }
  });

  // A redo only sets the plan; a first run can also start something lighter (critic B2).
  const quick = plan && !redo ? (words?.quick ?? null) : null;
  const planLabel = redo ? 'Use this plan' : 'Start Day 1';
  const label = !plan ? (redo ? 'Done' : 'Start a quick workout') : quick === 'primary' ? 'Start a quick workout' : planLabel;
  const secondary = quick === 'primary' ? planLabel : quick === 'secondary' ? 'Start a quick workout' : null;

  return (
    <div className={styles.screen} data-testid="intake" data-step="reveal">
      <header className={styles.top}>
        <BackButton label="Back" onPress={onBack} />
        <div className={styles.progress} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: '100%' }} />
        </div>
        <span className={styles.topSpacer} aria-hidden="true" />
      </header>
      <main ref={scroller} className={styles.body} data-scroller>
        <div className={styles.revealHead}>
          {/* The check is earned by a true match only, never by a closest plan or no plan. */}
          {words?.check && (
            <svg className={styles.check} viewBox="0 0 52 52" aria-hidden="true" data-testid="reveal-check">
              <circle className={styles.checkRing} cx="26" cy="26" r="23" pathLength={1} />
              <path className={styles.checkMark} d="M15 27 L23 35 L38 18" pathLength={1} />
            </svg>
          )}
          <h1 className={styles.title}>{words ? words.title : none.title}</h1>
        </div>
        <section className={styles.planCard} aria-label={plan ? plan.name : 'No plan yet'} data-testid="reveal-card">
          {words?.mismatch && <p className={styles.caveat}>The closest plan we have, if you want it:</p>}
          {plan && <p className={styles.planName}>{plan.name}</p>}
          <p className={styles.reason} data-testid="reveal-reason">
            {words ? words.reason : none.saved}
          </p>
          {words?.goals && (
            <p className={styles.caveat} data-testid="reveal-goals">
              {words.goals}
            </p>
          )}
          {words?.warning && (
            <p className={styles.caveat} data-testid="reveal-warning">
              {words.warning}
            </p>
          )}
          {!plan && (
            <p className={styles.caveat} data-testid="reveal-quick">
              {none.quick}
            </p>
          )}
          {plan && (
            <ol className={styles.week} data-testid="reveal-week">
              {week.map((w, i) => (
                <li key={`${w.label}-${i}`} className={styles.weekRow} style={{ '--i': i } as CSSProperties}>
                  <span className={`${styles.weekDay} num`}>{w.label}</span>
                  <span className={styles.weekName}>{w.dayName}</span>
                  <span className={`${styles.weekTime} num`}>~{words!.minutes[w.dayIndex]} min</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        {/* B2: the plan already shown is not offered again. */}
        {fits.length > 1 && (
          <section className={styles.others} aria-labelledby="reveal-others">
            <h2 id="reveal-others" className={styles.othersTitle}>
              Or pick a curated plan
            </h2>
            <div className={styles.cards}>
              {fits.filter((p) => p.id !== chosenId).map((p) => (
                <ChoiceCard key={p.id} label={p.name} hint={`${p.daysPerWeek} days a week`} picked={p.id === chosenId} onPress={() => setChosenId(p.id)} testId={`reveal-plan-${p.id}`} />
              ))}
            </div>
          </section>
        )}
      </main>
      <BottomCTA
        onPress={() => void act(quick === 'primary')}
        reasonAndNote
        note={STAYS_HERE}
        above={
          <>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {secondary ? (
              <Button variant="secondary" className={styles.keepGoing} onClick={() => void act(quick === 'secondary')} data-testid="reveal-secondary">
                {secondary}
              </Button>
            ) : null}
          </>
        }
        testId="reveal-cta"
        className={styles.cta}
      >
        {label}
      </BottomCTA>
    </div>
  );
}
