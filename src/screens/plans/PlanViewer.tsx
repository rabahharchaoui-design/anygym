import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ScreenHeader } from '../../components/ScreenHeader';
import { IconLink } from '../../components/IconButton';
import { BackIcon } from '../../components/icons';
import { planById } from '../../data/plans';
import { choosePlan, getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { useTapGuard } from '../../hooks/useTapGuard';
import { estimateDayMinutes, finisherText } from '../../lib/plans';
import { PlanDayList } from './PlanDayList';
import { dayTitle, planMeta } from './planWords';
import styles from './Plans.module.css';

/** Plan viewer: every day in plain words, a week picker for week table plans, and "Use this plan". */
export function PlanViewer() {
  const { planId } = useParams();
  const plan = planById(planId);
  const navigate = useNavigate();
  const state = useLive(() => getPlanState(), []);
  const active = state.data?.planId === plan?.id;
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const use = useTapGuard(async () => {
    if (!plan) return;
    setError(false);
    try {
      if (!active) await choosePlan(plan.id);
      navigate('/');
    } catch {
      setError(true);
    }
  });

  if (!plan) return <Navigate to="/plans" replace />;
  const weekIndex = week ?? (active ? (state.data?.weekIndex ?? 0) : 0);

  return (
    <div className={styles.viewer}>
      <ScreenHeader
        title={plan.name}
        leading={
          <IconLink to="/plans" label="Back to Plans">
            <BackIcon />
          </IconLink>
        }
      />
      <p className={styles.viewerMeta}>{planMeta(plan)}</p>
      <p className={styles.viewerSummary}>{plan.summary}</p>

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

      <div className={styles.useBar}>
        <p className={styles.error} role="status">
          {error ? 'Could not save that. Try again.' : ''}
        </p>
        <button type="button" className={`${styles.useButton} pressable`} onClick={() => void use()}>
          {active ? 'Go to Today' : 'Use this plan'}
        </button>
      </div>
    </div>
  );
}
