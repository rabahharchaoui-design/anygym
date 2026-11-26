import { Link } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { useNav } from '../../ui/nav';
import { PLANS, basePlanOf, isGeneratedId, planById } from '../../data/plans';
import { PLACE_TILES } from '../../data/places';
import { getPlanState } from '../../db/planState';
import { getProfile } from '../../db/intake';
import { useLive } from '../../hooks/useLive';
import { useSchedule } from '../../hooks/useSchedule';
import { PlanCard } from './PlanCard';
import { PlanWeek } from './PlanWeek';
import { nextWord, planLine, planWeekRows } from './weekRows';
import { planLink } from './planWords';
import styles from './Plans.module.css';

const count = (n: number) => `${n} ${n === 1 ? 'plan' : 'plans'}`;

/**
 * The Plan tab (SPEC 8.6, PLAN M6, board 10): "Plan" giant, one small line naming the plan in use,
 * then its days as rows with what is true of each in this pass (the same marks as Today). Under it,
 * where you train and every curated plan, as plain rows. With no plan in use, the lists alone.
 */
export function PlansScreen() {
  const state = useLive(() => getPlanState(), []);
  const profile = useLive(() => getProfile(), []);
  const schedule = useSchedule(true);
  const activeId = state.data?.planId;
  const go = useNav();
  const mine = isGeneratedId(activeId) ? basePlanOf(activeId) : undefined;
  const plan = planById(activeId);
  const sched = schedule.data;
  const flexible = sched?.style !== 'fixed';
  // The week shows once the schedule is read, so a tick or the next mark never appears and moves.
  const rows = plan && state.data && sched ? planWeekRows(plan, state.data, { nextIndex: sched.resolved ? sched.resolved.dayIndex : undefined, flexible, weekDays: sched.weekDays }) : null;
  const viewer = plan ? planLink(`/plans/${basePlanOf(activeId)?.id ?? plan.id}`, activeId) : '/plans';
  return (
    <>
      <TopBar title="Plan" giant>
        <p className={styles.lead} data-testid="plan-line">
          {plan && state.data ? planLine(plan, state.data.weekIndex, sched?.style === 'fixed' ? profile.data?.intake?.weekdays : undefined) : state.ready ? "Pick one. Each day's workout is ready for you." : ' '}
        </p>
      </TopBar>
      {plan && rows && <PlanWeek rows={rows} next={nextWord(flexible, !!sched?.restDay)} to={viewer} label={plan.weeks ? `Week ${(state.data?.weekIndex ?? 0) + 1}` : flexible ? 'This rotation' : 'This week'} />}
      {mine && (
        <section className={styles.section}>
          {/* PLAN 3.5: the plan built from their answers, when it is the one in use. */}
          <h2 className={styles.sectionTitle}>Your plan</h2>
          <ul className={styles.list}>
            <li>
              <PlanCard plan={mine} to={planLink(`/plans/${mine.id}`, activeId)} active />
            </li>
          </ul>
        </section>
      )}
      {PLACE_TILES.length > 0 && (
        <section className={styles.section} aria-labelledby="places-title">
          <h2 id="places-title" className={styles.sectionTitle}>
            Where you train
          </h2>
          <ul className={styles.list}>
            {PLACE_TILES.map(({ place, plans }) => (
              <li key={place.id}>
                <Link
                  to={`/plans/place/${place.id}`}
                  className={`${styles.placeRow} pressable`}
                  data-testid={`place-${place.id}`}
                  aria-label={`${place.label}, ${count(plans.length)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(`/plans/place/${place.id}`);
                  }}
                >
                  <span className={styles.placeLabel}>{place.label}</span>
                  <span className={`${styles.placeCount} num`}>{count(plans.length)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>All plans</h2>
        <ul className={styles.list}>
          {PLANS.map((p) => (
            <li key={p.id}>
              <PlanCard plan={p} to={planLink(`/plans/${p.id}`, basePlanOf(activeId)?.id === p.id ? activeId : undefined)} active={basePlanOf(activeId)?.id === p.id} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
