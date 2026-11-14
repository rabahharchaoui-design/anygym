import { Fragment, type ReactNode } from 'react';
import type { PlanState } from '../../db/types';
import { estimateDayMinutes, type Plan } from '../../lib/plans';
import { dayTitle } from '../plans/planWords';
import { Button } from '../../ui/Button';
import { Ring } from '../../ui/Ring';
import styles from '../TodayScreen.module.css';
import own from './DayCard.module.css';

type Props = {
  plan: Plan;
  flexible?: boolean;
  state: PlanState;
  onStart: () => void;
  /** Change day, optionally with the day whose pip was tapped picked. */
  onChangeDay: (dayIndex?: number) => void;
  /** This day's workout is in progress: the card says so and Start becomes Resume. */
  active?: { dayIndex: number; sets: number };
  /** PLAN 3.6: the estimate after the time picked for this Start (the plan's own when none). */
  minutes?: number;
  /** PLAN 3.6: the minutes picked for this Start, when one shortens the day. */
  fitsIn?: number;
  /** PLAN 3.6: the estimate opens "How much time today?" (SPEC 7.4: before Start). */
  onTime?: () => void;
  /** PLAN 3.6f: not one of the person's days: the headline is "Rest day · Next: Wed, Day 1", and Start steps back to "Train today anyway". */
  rest?: { title: string; next: string } | null;
  /** PLAN 3.5f: look through the day's lifts as a deck before Start (swap or hide any). */
  onPreview?: () => void;
};

/** "A · B · C": each part carries its own dot, so a line never starts or ends on one (DayCard.module.css). */
const parts = (list: readonly ReactNode[]) =>
  list.map((x, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className={own.part}>
        {i > 0 && <span className={own.dot}>· </span>}
        {x}
      </span>
    </Fragment>
  ));

/**
 * SPEC 8.1 day card: "Day 3 · Back and biceps · ~55 min" ("Next up: Day 3 · …" on a rotation), a big Start, the week as small progress
 * pips (done, part done as a ring, up next) and Change day. While the day is in progress it is the
 * one card on Today: "Day 1 · in progress · 2 sets" with Resume.
 */
export function DayCard({ plan, state, onStart, onChangeDay, active, minutes, fitsIn, onTime, onPreview, flexible, rest }: Props) {
  const dayIndex = Math.max(0, Math.min(active?.dayIndex ?? state.nextDayIndex, plan.days.length - 1));
  const day = plan.days[dayIndex]!;
  const weekIndex = plan.progressionMode === 'weekly_table' ? state.weekIndex : 0;
  // "Extra back work: " and "16 sets every 4 workouts": the amount stays together on one line.
  const line = day.focusWhy?.[0];
  const cut = line ? line.indexOf(': ') : -1;
  const why = line ? (cut === -1 ? { head: line, tail: '' } : { head: line.slice(0, cut + 2), tail: line.slice(cut + 2) }) : null;
  const done = new Set(state.doneDays);
  const resting = active ? null : rest ?? null;
  // A rest day says one thing (truth pass, critic r3 5): no "Extra today" or "… first today" under "Rest day".
  const saysWhy = why && !resting;
  const mins = minutes ?? estimateDayMinutes(day, weekIndex);
  const time = onTime ? (
    <button type="button" className={`${styles.dayTime} num pressable`} data-testid="day-card-time" data-trimmed={fitsIn !== undefined || undefined} aria-label={`~${mins} min, change how long`} onClick={onTime}>
      ~{mins} min
    </button>
  ) : (
    `~${estimateDayMinutes(day, weekIndex)} min`
  );
  const dayParts: ReactNode[] = [`${flexible && !active && !resting ? 'Next up: ' : ''}Day ${day.n}`, day.name, ...(active ? [] : [time])];
  return (
    <section className={styles.dayCard} aria-label="Today's plan day" data-tour="day" data-active={active ? 'true' : undefined} data-rest={resting ? 'true' : undefined}>
      <p className={styles.planName}>{plan.name}</p>
      {/* PLAN 3.6f: the title breaks only between its parts, and a line never starts or ends on a dot.
          Round 3 (critic 9): on a rest day the headline is the rest day, and the day waits in the line under it. */}
      <h2 className={`${styles.dayTitle} ${own.title}`} data-testid="day-card-title">
        {resting ? <span data-testid="day-rest">{parts([resting.title, resting.next])}</span> : parts(dayParts)}
      </h2>
      {resting && (
        <p className={`${own.title} ${own.restDay}`} data-testid="day-rest-day">
          {parts(dayParts)}
        </p>
      )}
      {saysWhy && (
        <p className={styles.dayFits} data-testid="day-focus-why">
          {/* "Extra today:" in the accent says what kind of line this is; the amounts stay together. */}
          <span className={why.tail ? own.whyHead : undefined}>{why.head}</span>
          {why.tail && <span className={own.keep}>{why.tail}</span>}
        </p>
      )}
      {!active && fitsIn !== undefined && (
        <p className={styles.dayFits} data-testid="day-card-fits">
          Shortened to fit {fitsIn} min
        </p>
      )}
      {active && (
        <p className={`${styles.inProgress} num`} data-testid="day-card-progress">
          In progress · {active.sets} {active.sets === 1 ? 'set' : 'sets'}
        </p>
      )}
      {/* PLAN 3.6v: on a short screen the welcome lights the card down to here. */}
      <Button className={`${styles.dayStart} ${resting ? own.restStart : ''}`} variant={resting ? 'secondary' : 'primary'} onClick={onStart} data-tour-core>
        {active ? 'Resume' : resting ? 'Train today anyway' : 'Start'}
      </Button>

      <div className={styles.strip} data-room>
        <p className={styles.stripLabel} data-testid="week-label">
          {/* A plan with a set length says its week on any schedule; a rotation has no calendar week. */}
          {plan.weeks ? `Week ${weekIndex + 1} of ${plan.weeks}` : flexible ? 'This rotation' : 'This week'}
          {/* What a half filled dot means (gate P14): "This week · Day 1 started", from the same part done shares. */}
          {(() => {
            const started = plan.days.filter((_, i) => state.partial?.[i] !== undefined && !done.has(i)).map((d) => d.n);
            if (!started.length) return null;
            return (
              <span className={styles.stripNote} data-testid="week-started">
                {' · '}
                {started.length === 1 ? `Day ${started[0]} started` : `Days ${started.join(', ')} started`}
              </span>
            );
          })()}
        </p>
        <ol className={styles.days} aria-label="Days">
          {plan.days.map((d, i) => {
            const share = state.partial?.[i];
            const status = i === dayIndex ? 'next' : done.has(i) ? 'done' : share !== undefined ? 'partial' : 'todo';
            // A day kept up next after a part done finish (PLAN 2.0a) is both: up next, with its ring.
            const ring = share !== undefined && (status === 'partial' || (status === 'next' && !done.has(i)));
            const words = status === 'next' ? (active ? ', in progress' : ring ? ', up next, part done' : ', up next') : status === 'done' ? ', done' : status === 'partial' ? ', part done' : '';
            const face = (
              <>
                <span className={styles.pipMark} aria-hidden="true" data-share={ring ? share : undefined}>
                  {ring ? (
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
          <div className={own.links}>
            {onPreview && (
              <Button variant="tertiary" className={styles.changeDay} onClick={onPreview} data-testid="day-preview">
                Preview
              </Button>
            )}
            <Button variant="tertiary" className={styles.changeDay} onClick={() => onChangeDay()}>
              Change day
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
