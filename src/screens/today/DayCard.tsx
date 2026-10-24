import type { PlanState } from '../../db/types';
import { estimateDayMinutes, type Plan } from '../../lib/plans';
import { dayTitle } from '../plans/planWords';
import styles from '../TodayScreen.module.css';

type Props = { plan: Plan; state: PlanState; onStart: () => void; onChangeDay: () => void };

/** SPEC 8.1 day card: "Day 3 · Back and biceps · ~55 min", a big Start, the week strip and Change day. */
export function DayCard({ plan, state, onStart, onChangeDay }: Props) {
  const dayIndex = Math.min(state.nextDayIndex, plan.days.length - 1);
  const day = plan.days[dayIndex]!;
  const weekIndex = plan.progressionMode === 'weekly_table' ? state.weekIndex : 0;
  const done = new Set(state.doneDays);
  return (
    <section className={styles.dayCard} aria-label="Today's plan day">
      <p className={styles.planName}>{plan.name}</p>
      <h2 className={styles.dayTitle} data-testid="day-card-title">
        {dayTitle(day.n, day.name)} · ~{estimateDayMinutes(day, weekIndex)} min
      </h2>
      <button type="button" className={`${styles.start} ${styles.dayStart} pressable`} onClick={onStart}>
        <span className={styles.startLabel}>Start</span>
      </button>

      <div className={styles.strip}>
        <p className={styles.stripLabel} data-testid="week-label">
          {plan.weeks ? `Week ${weekIndex + 1} of ${plan.weeks}` : 'This week'}
        </p>
        <ol className={styles.days} aria-label="Days">
          {plan.days.map((d, i) => {
            const status = i === dayIndex ? 'next' : done.has(i) ? 'done' : 'todo';
            return (
              <li
                key={d.n}
                className={styles.dayDot}
                data-state={status}
                data-testid={`week-day-${d.n}`}
                aria-label={`${dayTitle(d.n, d.name)}${status === 'next' ? ', up next' : status === 'done' ? ', done' : ''}`}
                aria-current={status === 'next' ? 'step' : undefined}
              >
                <span className={styles.dotCircle} aria-hidden="true">
                  {status === 'done' ? (
                    <svg viewBox="0 0 16 16" width="16" height="16">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    d.n
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <button type="button" className={`${styles.changeDay} pressable`} onClick={onChangeDay}>
          Change day
        </button>
      </div>
    </section>
  );
}
