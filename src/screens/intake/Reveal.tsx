// The plan reveal (SPEC 14 step 14, PLAN 3.3, 3.5): the week builds in, one plain line on why it
// fits, then an accent check draws itself. PLAN 3.5u: "Looks good" saves the plan and lands on Today
// (with its short welcome); the intake never starts a workout. A curated plan that truly matches the
// answers shows as it is; otherwise the generator builds "Your plan" from the answers (PLAN 3.5),
// saved on the phone when it is chosen, with the curated plans that fit as other choices. When even
// the generator cannot build a week here it says why; Today has the quick workout.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { useNav } from '../../ui/nav';
import { useTapGuard } from '../../hooks/useTapGuard';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import { explainPick, noPlanWords, pickPlan, weekOf } from '../../lib/intake/planPick';
import { generatorInputOf } from '../../lib/intake/yourPlan';
import { persistAnswers } from './persist';
import { useMoreBelow } from './useMoreBelow';
import { PLANS, definitionPlan, planById } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { generate } from '../../data/generator';
import { planFit } from '../../lib/intake/planFit';
import { clearIntakeDraft } from '../../db/intake';
import { startDb } from '../../db/bootstrap';
import { armWelcomeTour } from '../../db/welcomeTour';
import { choosePlan, choosePlanUndoable } from '../../db/planState';
import { saveGeneratedPlan } from '../../db/savedPlans';
import { STAYS_HERE } from './copy';
import styles from './Intake.module.css';

type Props = { answers: IntakeAnswers; redo: boolean; onBack: () => void; baseline: MutableRefObject<IntakeAnswers | undefined> };

export function Reveal({ answers, redo, onBack, baseline }: Props) {
  const go = useNav();
  const pick = useMemo(() => pickPlan(PLANS, SWAP_DATA, answers), [answers]);
  // A curated plan that truly matches (the accent check) needs nothing built.
  const exact = useMemo(() => {
    if (pick.kind !== 'plan') return false;
    return explainPick(pick.plan, answers, pick.fit.swapped, pick.fit.noFit.length).check;
  }, [pick, answers]);
  // PLAN 3.5: otherwise "Your plan" from the answers, when the generator can build one here.
  const built = useMemo(() => (exact ? null : generate(generatorInputOf(answers))), [exact, answers]);
  const mine = useMemo(() => (built?.ok ? definitionPlan(built.plan) : undefined), [built]);
  const [chosenId, setChosenId] = useState(mine ? mine.id : pick.kind === 'plan' ? pick.plan.id : null);
  const isMine = !!mine && chosenId === mine.id;
  const plan = isMine ? mine : planById(chosenId ?? undefined);
  const fits = pick.kind === 'plan' ? [pick.plan, ...pick.others] : [];
  const week = plan ? weekOf(plan, answers) : [];
  // B1: the moves the day list will swap at this gym are said, never hidden.
  const fit = useMemo(() => (plan && !isMine ? planFit(SWAP_DATA, plan, answers) : null), [plan, isMine, answers]);
  const words = plan ? explainPick(plan, answers, fit?.swapped ?? 0, fit?.noFit.length ?? 0, isMine && built?.ok ? built.applied : undefined) : null;
  const none = noPlanWords(answers.place);
  // Why the generator could not build a week here, in its own words (never a padded plan).
  const failure = built && !built.ok ? built.reason : null;

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
  const act = useTapGuard(async () => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      await (saved.current ?? save()).catch(() => save());
      await startDb();
      if (redo) {
        if (!plan) {
          go('/settings', { kind: 'pop', replace: true });
          return;
        }
        if (isMine && built?.ok) await saveGeneratedPlan(built.plan as unknown as Record<string, unknown>);
        const r = await choosePlanUndoable(plan.id);
        go('/', { kind: 'pop', replace: true, state: r.changed ? { toast: 'Plan saved', planUndo: { chosen: r.state, previous: r.previous ?? null } } : { toast: 'Answers saved' } });
        return;
      }
      // PLAN 3.5u: a first run ends on Today, plan chosen, nothing started. With no plan Today
      // offers the quick workout and Plans.
      if (plan) {
        if (isMine && built?.ok) await saveGeneratedPlan(built.plan as unknown as Record<string, unknown>);
        await choosePlan(plan.id);
      }
      // The welcome is a nicety: a failed write never keeps anyone in the funnel.
      await armWelcomeTour().catch(() => undefined);
      await clearIntakeDraft();
      go('/', { kind: 'fade', replace: true });
    } catch {
      setError('Could not save that. Try again.');
    } finally {
      busy.current = false;
    }
  });

  // B2: the plan already shown is not offered again; "Your plan" comes back as a choice once another is picked.
  const others = [...(mine && !isMine ? [mine] : []), ...fits.filter((p) => p.id !== chosenId)];
  const label = redo ? (plan ? 'Use this plan' : 'Done') : plan ? 'Looks good' : 'Go to Today';

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
          {plan && <p className={styles.planName}>{plan.name}</p>}
          {words?.summary ? (
            <>
              {/* Round 3 (B2): one honest line up front; the fit details one tap away, every fact kept. */}
              <p className={styles.reason} data-testid="reveal-summary">
                {words.summary}
                {words.goals && (
                  <>
                    {' '}
                    <span data-testid="reveal-goals">{words.goals}</span>
                  </>
                )}
              </p>
              <details className={styles.why} data-testid="reveal-why">
                <summary className={`${styles.whySummary} pressable`}>Why this plan</summary>
                <p className={styles.caveat} data-testid="reveal-reason">
                  {words.reason}
                </p>
                {words.warning && (
                  <p className={styles.caveat} data-testid="reveal-warning">
                    {words.warning}
                  </p>
                )}
              </details>
            </>
          ) : (
            <>
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
            </>
          )}
          {!plan && failure && (
            <p className={styles.caveat} data-testid="reveal-failure">
              {failure}
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
        {others.length > 0 && (
          <section className={styles.others} aria-labelledby="reveal-others">
            <h2 id="reveal-others" className={styles.othersTitle}>
              {mine && !isMine ? 'Or go back to your plan' : 'Or pick a curated plan'}
            </h2>
            <div className={styles.cards}>
              {mine && !isMine && <ChoiceCard label="Your plan" hint={`Built from your answers · ${mine.daysPerWeek} days a week`} picked={false} onPress={() => setChosenId(mine.id)} testId="reveal-plan-mine" />}
              {fits.filter((p) => p.id !== chosenId).map((p) => (
                <ChoiceCard key={p.id} label={p.name} hint={`${p.daysPerWeek} days a week`} picked={p.id === chosenId} onPress={() => setChosenId(p.id)} testId={`reveal-plan-${p.id}`} />
              ))}
            </div>
          </section>
        )}
      </main>
      <BottomCTA
        onPress={() => void act()}
        reasonAndNote
        note={STAYS_HERE}
        above={
          error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null
        }
        testId="reveal-cta"
        className={styles.cta}
      >
        {label}
      </BottomCTA>
    </div>
  );
}
