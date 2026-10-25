import type { PlanState } from '../../db/types';
import { estimateDayMinutes, type Plan } from '../../lib/plans';
import { dayTitle } from '../plans/planWords';
import { Button } from '../../ui/Button';
import { Ring } from '../../ui/Ring';
import styles from '../TodayScreen.module.css';

type Props = {
  plan: Plan;
  state: PlanState;
  onStart: () => void;
  /** Change day, optionally with the day whose pip was tapped picked. */
  onChangeDay: (dayIndex?: number) => void;
  /** This day's workout is in progress: the card says so and Start becomes Resume. */
  active?: { dayIndex: number; sets: number };
};

/**
 * SPEC 8.1 day card: "Day 3 · Back and biceps · ~55 min", a big Start, the week as small progress
 * pips (done, part done as a ring, up next) and Change day. While the day is in progress it is the
 * one card on Today: "Day 1 · in progress · 2 sets" with Resume.
 */
export function DayCard({ plan, state, onStart, onChangeDay, active }: Props) {
  const dayIndex = Math.min(active?.dayIndex ?? state.nextDayIndex, plan.days.length - 1);
  const day = plan.days[dayIndex]!;
  const weekIndex = plan.progressionMode === 'weekly_table' ? state.weekIndex : 0;
  const done = new Set(state.doneDays);
  return (
    <section className={styles.dayCard} aria-label="Today's plan day" data-active={active ? 'true' : undefined}>
      <p className={styles.planName}>{plan.name}</p>
      <h2 className={styles.dayTitle} data-testid="day-card-title">
        {active ? dayTitle(day.n, day.name) : `${dayTitle(day.n, day.name)} · ~${estimateDayMinutes(day, weekIndex)} min`}
      </h2>
      {active && (
        <p className={`${styles.inProgress} num`} data-testid="day-card-progress">
          In progress · {active.sets} {active.sets === 1 ? 'set' : 'sets'}
        </p>
      )}
      <Button className={styles.dayStart} onClick={onStart}>
        {active ? 'Resume' : 'Start'}
      </Button>

      <div className={styles.strip}>
        <p className={styles.stripLabel} data-testid="week-label">
          {plan.weeks ? `Week ${weekIndex + 1} of ${plan.weeks}` : 'This week'}
        </p>
        <ol className={styles.days} aria-label="Days">
          {plan.days.map((d, i) => {
            const share = state.partial?.[i];
            const status = i === dayIndex ? 'next' : done.has(i) ? 'done' : share !== undefined ? 'partial' : 'todo';
            const words = status === 'next' ? (active ? ', in progress' : ', up next') : status === 'done' ? ', done' : status === 'partial' ? ', part done' : '';
            const face = (
              <>
                <span className={styles.pipMark} aria-hidden="true">
                  {status === 'partial' ? (
                    // Part done: at least a quarter of the ring shows, so it never reads as empty.
                    <Ring fraction={Math.max(0.25, share ?? 0)} size={14} stroke={7} glideMs={0} className={styles.pipRing} />
                  ) : (
                    <span className={styles.pip} />
                  )}
                </span>
                <span className={`${styles.pipLabel} num`} aria-hidden="true">
                  {d.n}
                </span>
              </>
            );
            return (
              <li key={d.n} className={styles.dayDot} data-state={status} data-testid={`week-day-${d.n}`} aria-current={status === 'next' ? 'step' : undefined}>
                {active ? (
                  // While a workout runs the day cannot change: plain progress marks.
                  <span className={styles.pipBox} aria-label={`${dayTitle(d.n, d.name)}${words}`} role="img">
                    {face}
                  </span>
                ) : (
                  <button type="button" className={`${styles.pipBox} pressable`} aria-label={`${dayTitle(d.n, d.name)}${words}. Pick this day`} onClick={() => onChangeDay(i)}>
                    {face}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {/* The card says "In progress" while a workout runs: no Change day then (it could not apply). */}
        {!active && (
          <Button variant="tertiary" className={styles.changeDay} onClick={() => onChangeDay()}>
            Change day
          </Button>
        )}
      </div>
    </section>
  );
}
