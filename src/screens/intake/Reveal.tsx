// The plan reveal (SPEC 14 step 14, PLAN 3.3): the week builds in, one plain line on why it fits,
// then a lime check draws itself, and Start Day 1 goes straight into the workout. The plan is the
// best curated plan that fits the user's equipment today (the generator is PLAN 3.5); when none
// fits it says so and offers a quick workout. Never a made up plan.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { useNav } from '../../ui/nav';
import { useTapGuard } from '../../hooks/useTapGuard';
import { bodyPref } from '../../lib/bodyPref';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import { caveatFor, pickPlan, reasonFor, weekOf } from '../../lib/intake/planPick';
import { PLANS, planById } from '../../data/plans';
import { planNeeds } from '../../data/places';
import { INTAKE_DRAFT_KEY, saveIntake } from '../../db/intake';
import { getActiveGym, startDb } from '../../db/bootstrap';
import { choosePlan, choosePlanUndoable } from '../../db/planState';
import { startPlanDay, startWorkout } from '../../db/workouts';
import { STAYS_HERE } from './copy';
import styles from './Intake.module.css';

const clearDraft = () => {
  try {
    localStorage.removeItem(INTAKE_DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
};

type Props = { answers: IntakeAnswers; redo: boolean; onBack: () => void };

export function Reveal({ answers, redo, onBack }: Props) {
  const go = useNav();
  const pick = useMemo(() => pickPlan(PLANS, planNeeds, answers), [answers]);
  const [chosenId, setChosenId] = useState(pick.kind === 'plan' ? pick.plan.id : null);
  const plan = planById(chosenId ?? undefined);
  const fits = pick.kind === 'plan' ? [pick.plan, ...pick.others] : [];
  const week = plan ? weekOf(plan, answers) : [];
  const reason = plan ? reasonFor(plan) : pick.reason;
  const caveat = plan ? caveatFor(plan, answers) : pick.kind === 'none' ? pick.caveat : null;

  // The answers are saved as the reveal opens (profile, units, the first gym, the muscle map body).
  const [error, setError] = useState('');
  const saved = useRef<Promise<unknown> | null>(null);
  const save = () => {
    const p = saveIntake(answers).then(() => {
      if (answers.units) bodyPref.set(answers.units.body);
    });
    saved.current = p;
    p.catch(() => setError('Could not save your answers. Try again.'));
    return p;
  };
  useEffect(() => {
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = useRef(false);
  const act = useTapGuard(async () => {
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
      clearDraft();
      if (!plan) {
        const s = await startWorkout(gym.id);
        go(`/workout/${s.id}`, { kind: 'push', replace: true });
        return;
      }
      await choosePlan(plan.id);
      const s = await startPlanDay(gym.id, plan.id, 0);
      go(`/workout/${s.id}`, { kind: 'push', replace: true });
    } catch {
      setError(redo ? 'Could not save that. Try again.' : 'Could not start the workout. Try again.');
    } finally {
      busy.current = false;
    }
  });

  const label = redo ? (plan ? 'Use this plan' : 'Done') : plan ? 'Start Day 1' : 'Start a quick workout';
  const rows = plan ? week.length : 0;

  return (
    <div className={styles.screen} data-testid="intake" data-step="reveal">
      <header className={styles.top}>
        <BackButton label="Back" onPress={onBack} />
        <div className={styles.progress} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: '100%' }} />
        </div>
        <span className={styles.topSpacer} aria-hidden="true" />
      </header>
      <main className={styles.body} data-scroller style={{ '--rows': rows } as CSSProperties}>
        <div className={styles.revealHead}>
          <svg className={styles.check} viewBox="0 0 52 52" aria-hidden="true" data-testid="reveal-check">
            <circle className={styles.checkRing} cx="26" cy="26" r="23" pathLength={1} />
            <path className={styles.checkMark} d="M15 27 L23 35 L38 18" pathLength={1} />
          </svg>
          <h1 className={styles.title}>{plan ? 'Your plan' : 'Your start'}</h1>
        </div>
        <section className={styles.planCard} aria-label={plan ? plan.name : 'No plan yet'} data-testid="reveal-card">
          {plan && <p className={styles.planName}>{plan.name}</p>}
          <p className={styles.reason} data-testid="reveal-reason">
            {reason}
          </p>
          {caveat && (
            <p className={styles.caveat} data-testid="reveal-caveat">
              {caveat}
            </p>
          )}
          {plan && (
            <ol className={styles.week} data-testid="reveal-week">
              {week.map((w, i) => (
                <li key={`${w.label}-${i}`} className={styles.weekRow} style={{ '--i': i } as CSSProperties}>
                  <span className={`${styles.weekDay} num`}>{w.label}</span>
                  <span className={styles.weekName}>{w.dayName}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        {fits.length > 1 && (
          <section className={styles.others} aria-labelledby="reveal-others">
            <h2 id="reveal-others" className={styles.othersTitle}>
              Or pick a curated plan
            </h2>
            <div className={styles.cards}>
              {fits.map((p) => (
                <ChoiceCard key={p.id} label={p.name} hint={`${p.daysPerWeek} days a week`} picked={p.id === chosenId} onPress={() => setChosenId(p.id)} testId={`reveal-plan-${p.id}`} />
              ))}
            </div>
          </section>
        )}
      </main>
      <BottomCTA onPress={() => void act()} note={STAYS_HERE} above={error ? <p className={styles.error} role="alert">{error}</p> : null} testId="reveal-cta" className={styles.cta}>
        {label}
      </BottomCTA>
    </div>
  );
}
