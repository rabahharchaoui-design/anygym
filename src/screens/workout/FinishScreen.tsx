import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { PlanState } from '../../db/types';
import { motion, useReducedMotion } from 'motion/react';
import { db } from '../../db/schema';
import { finishedDetail, workoutRecords } from '../../db/history';
import { useLive } from '../../hooks/useLive';
import { formatSetLine, formatTotal, totalLifted } from '../../lib/load';
import { bestSetOf } from '../../lib/records';
import { dayProgress, dayWorkout } from '../../lib/planWorkout';
import { dayIndexOf } from '../../lib/plans';
import { planById } from '../../data/plans';
import { moveOnFrom } from '../../db/planState';
import { FADE, GENTLE, STAGGER } from '../../ui/motion';
import { Button } from '../../ui/Button';
import { Odometer } from '../../ui/Odometer';
import { Skeleton } from '../../ui/Skeleton';
import { TrophyIcon } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import { LoadError } from '../../components/LoadError';
import { exerciseNamer, setCount, workoutTitle } from '../history/historyWords';
import styles from './Finish.module.css';

/**
 * The finish screen (SPEC 21.1, minimal): how long, how many sets, total lifted (when there is
 * any), each exercise with its best set, and records from real history only. A plan day with
 * exercises left reads "Saved · 1 of 16 done" and asks what is up next (keep the day, or move on). Done goes back to Today, where "Workout saved" offers Undo.
 */
export function FinishScreen() {
  const { sessionId = '' } = useParams();
  const go = useNav();
  // Where the plan stood just before Finish, for Undo on Today.
  const planBefore = (useLocation().state as { planBefore?: PlanState } | null)?.planBefore;
  const reduce = useReducedMotion();
  const [moveOn, setMoveOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const detail = useLive(async () => {
    const d = await finishedDetail(sessionId);
    if (!d) return { d: null, unit: 'lb' as const, records: [] };
    const gym = await db.gyms.get(d.session.gymId);
    const records = await workoutRecords(sessionId, exerciseNamer(d.session));
    return { d, unit: gym?.unit ?? d.sets.find((s) => s.load)?.load?.unit ?? 'lb', records };
  }, [sessionId]);

  if (detail.ready && !detail.error && !detail.data?.d) return <Navigate to="/" replace />;
  const v = detail.data;
  const d = v?.d;

  const minutes = d ? Math.round(((d.session.endedAt ?? d.session.startedAt) - d.session.startedAt) / 60000) : 0;
  const lifted = d && v ? totalLifted(d.sets, v.unit) : 0;
  // The workout is saved whether or not this screen could read it back: Done always works, and
  // only claims a set count it actually read (PLAN 1.7f).
  // A plan day with exercises left (1.7e): "Saved · 1 of 16 done", and the choice of what is up
  // next. Keep is the default (Finish already left the day up next); Move on goes to the next day.
  const plan = d ? planById(d.session.planId) : undefined;
  const dayIndex = plan && d ? dayIndexOf(plan, d.session.dayId) : -1;
  const progress =
    plan && d && dayIndex >= 0 ? dayProgress(dayWorkout(plan, dayIndex, d.session.weekIndex ?? 0), (id) => d.sets.filter((x) => x.exerciseId === id && x.kind !== 'warmup').length) : undefined;
  const dayEntries = plan && d && dayIndex >= 0 ? dayWorkout(plan, dayIndex, d.session.weekIndex ?? 0) : [];
  const plannedOf = (id: string) => dayEntries.find((e) => e.exerciseId === id && !e.warmup)?.sets;
  const partialDay = !!progress && !progress.complete && planBefore?.planId === plan?.id;
  const thisDay = plan && dayIndex >= 0 ? plan.days[dayIndex]!.n : 0;
  const nextDay = plan && dayIndex >= 0 ? plan.days[(dayIndex + 1) % plan.days.length]!.n : 0;
  const done = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (partialDay && moveOn) await moveOnFrom(sessionId);
    } catch {
      // The workout is saved either way; the day stays up next (the safe default).
    }
    go('/', { kind: 'fade', replace: true, state: d ? { toast: `Workout saved · ${setCount(d.sets.length)}`, undo: { sessionId, planBefore } } : null });
  };
  const loading = !detail.error && (!d || !v);
  // Each exercise of the workout with its best set; "3 of 5 exercises done" when some were skipped.
  const name = d ? exerciseNamer(d.session) : (id: string) => id;
  const ids = d ? [...new Set([...(d.session.exerciseIds ?? []), ...d.sets.map((x) => x.exerciseId)])] : [];
  const rows = d
    ? ids.flatMap((id) => {
        const best = bestSetOf(d.sets.filter((x) => x.exerciseId === id));
        return best ? [{ id, best }] : [];
      })
    : [];

  const item = (i: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE }
      : { initial: { opacity: 0, y: 18, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...GENTLE, delay: STAGGER * 1.4 * i } };

  return (
    <div className={styles.screen}>
      <main className={styles.main} aria-label="Workout done">
        {detail.error ? <LoadError text="Could not load this workout" onRetry={detail.retry} /> : null}
        {!d || !v ? (
          !detail.error && <Skeleton height={240} radius={22} />
        ) : (
          <>
            <motion.div className={styles.head} {...item(0)}>
              <p className={styles.kicker}>{workoutTitle(d.session)}</p>
              <h1 className={styles.title} data-testid="finish-title">
                {partialDay && progress ? `Saved · ${progress.done} of ${progress.total} done` : 'Workout done'}
              </h1>
            </motion.div>
            <div className={styles.stats}>
              <motion.div className={styles.stat} {...item(1)}>
                <span className={`${styles.value} num`} data-testid="finish-duration">
                  {minutes < 1 ? '<1 min' : <Odometer value={`${minutes} min`} countUp={!reduce} />}
                </span>
                <span className={styles.label}>Time</span>
              </motion.div>
              <motion.div className={styles.stat} {...item(2)}>
                <span className={`${styles.value} num`} data-testid="finish-sets">
                  <Odometer value={d.sets.length} countUp={!reduce} />
                </span>
                <span className={styles.label}>{d.sets.length === 1 ? 'Set' : 'Sets'}</span>
              </motion.div>
              {lifted > 0 && (
                <motion.div className={`${styles.stat} ${styles.wide}`} {...item(3)}>
                  <span className={`${styles.value} num`} data-testid="finish-total">
                    <Odometer value={formatTotal(lifted, v.unit)} countUp={!reduce} />
                  </span>
                  <span className={styles.label}>Total lifted</span>
                </motion.div>
              )}
            </div>
            {rows.length > 0 && (
              <motion.section className={styles.exercises} aria-label="Exercises" {...item(4)}>
                <h2 className={styles.recordsTitle}>Exercises</h2>
                <ul className={styles.exerciseList}>
                  {rows.map((r) => {
                    // A plan exercise with sets left says so ("1 of 4 sets"): done means every set.
                    const planned = plannedOf(r.id);
                    const count = d.sets.filter((x) => x.exerciseId === r.id && x.kind !== 'warmup').length;
                    return (
                      <li key={r.id} className={styles.exerciseRow} data-testid="finish-exercise">
                        <span className={styles.exerciseName}>
                          {name(r.id)}
                          {planned && count < planned ? (
                            <span className={`${styles.exerciseLeft} num`} data-testid="finish-sets-left">
                              {count} of {planned} sets
                            </span>
                          ) : null}
                        </span>
                        <span className={`${styles.exerciseBest} num`}>{formatSetLine(r.best)}</span>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            )}
            {v.records.length > 0 && (
              <motion.section className={styles.records} aria-label="New bests" {...item(5)}>
                <h2 className={styles.recordsTitle}>New bests</h2>
                <ul className={styles.recordList}>
                  {v.records.map((r, i) => (
                    <motion.li
                      key={`${r.exerciseId}-${r.kind}-${i}`}
                      className={styles.record}
                      data-testid="pr-chip"
                      {...(reduce ? {} : { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1 }, transition: { ...GENTLE, delay: 0.5 + STAGGER * i } })}
                    >
                      {!reduce && <span className={styles.burst} style={{ animationDelay: `${500 + 60 * i}ms` }} aria-hidden="true" />}
                      <span className={styles.trophy}>
                        <TrophyIcon width={20} height={20} strokeWidth={2} aria-hidden="true" />
                      </span>
                      <span className={styles.recordText}>{r.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.section>
            )}
          </>
        )}
        {/* Inside the scroller, stuck to the bottom: the summary scrolls under it, never hidden for good. */}
        <div className={styles.footer}>
          {partialDay && (
            <motion.div className={styles.choices} role="radiogroup" aria-label="What is up next" {...item(6)}>
              <button type="button" role="radio" aria-checked={!moveOn} className={`${styles.choice} pressable`} onClick={() => setMoveOn(false)}>
                <span className={styles.dot} aria-hidden="true" />
                Keep Day {thisDay}
              </button>
              <button type="button" role="radio" aria-checked={moveOn} className={`${styles.choice} pressable`} onClick={() => setMoveOn(true)}>
                <span className={styles.dot} aria-hidden="true" />
                Go to Day {nextDay}
              </button>
            </motion.div>
          )}
          <Button onClick={() => void done()} disabled={loading || saving}>
            Done
          </Button>
        </div>
      </main>
    </div>
  );
}
