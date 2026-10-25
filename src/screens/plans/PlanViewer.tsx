import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Button } from '../../ui/Button';
import { useNav } from '../../ui/nav';
import { planById } from '../../data/plans';
import { choosePlan, getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { LoadError } from '../../components/LoadError';
import { useTapGuard } from '../../hooks/useTapGuard';
import { estimateDayMinutes, finisherText } from '../../lib/plans';
import { PlanDayList } from './PlanDayList';
import { dayTitle, planMeta } from './planWords';
import styles from './Plans.module.css';

/** Plan viewer: every day in plain words, a week picker for week table plans, and "Use this plan". */
export function PlanViewer() {
  const { planId } = useParams();
  const plan = planById(planId);
  const go = useNav();
  const state = useLive(() => getPlanState(), []);
  // Nothing is chosen until the active plan read worked (PLAN 1.7j): a pending or failed read
  // must never make the plan in use look inactive and reset its progress.
  const known = state.ready && !state.error;
  const active = known && state.data?.planId === plan?.id;
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const use = useTapGuard(async () => {
    if (!plan || !known) return;
    setError(false);
    try {
      if (!active) await choosePlan(plan.id);
      go('/', { kind: 'tab' });
    } catch {
      setError(true);
    }
  });

  if (!plan) return <Navigate to="/plans" replace />;
  const weekIndex = week ?? (active ? (state.data?.weekIndex ?? 0) : 0);

  return (
    <div className={styles.viewer}>
      <TopBar title={plan.name} leading={<BackButton to="/plans" label="Back to Plans" />}>
        <p className={styles.viewerMeta}>{planMeta(plan)}</p>
        <p className={styles.viewerSummary}>{plan.summary}</p>
      </TopBar>

      {plan.weeks && (
        <div className={styles.weeks} role="group" aria-label="Week">
          {Array.from({ length: plan.weeks }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.week} pressable`}
              aria-pressed={i === weekIndex}
              aria-label={`Week ${i + 1}`}
              onClick={() => setWeek(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {plan.days.map((d) => (
        <section key={d.n} className={styles.day} aria-label={dayTitle(d.n, d.name)}>
          <header className={styles.dayHead}>
            <h2 className={styles.dayTitle}>{dayTitle(d.n, d.name)}</h2>
            <span className={`${styles.dayTime} num`}>~{estimateDayMinutes(d, weekIndex)} min</span>
          </header>
          {d.addOn && <p className={styles.addOn}>Plus {d.addOn.toLowerCase()}</p>}
          <PlanDayList day={d} weekIndex={weekIndex} />
          {d.finisher && (
            <p className={styles.finisher} data-testid={`finisher-day-${d.n}`}>
              <span className={styles.finisherTag}>Finisher</span> {finisherText(d.finisher)}
            </p>
          )}
        </section>
      ))}

      <div className={styles.useBar} data-testid="action-bar">
        {state.error ? (
          <LoadError text="Could not check your current plan" onRetry={state.retry} />
        ) : (
          <p className={styles.error} role="status">
            {error ? 'Could not save that. Try again.' : ''}
          </p>
        )}
        <Button onClick={() => void use()} disabled={!known}>
          {active ? 'Go to Today' : 'Use this plan'}
        </Button>
      </div>
    </div>
  );
}
