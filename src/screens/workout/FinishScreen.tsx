import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { db } from '../../db/schema';
import { finishedDetail, workoutRecords, workoutWins } from '../../db/history';
import { useLive } from '../../hooks/useLive';
import { formatSession, formatSet, sameSets } from '../../lib/setWords';
import { formatTotal, totalLifted } from '../../lib/load';
import { bestSetOf } from '../../lib/records';
import { adjustEntries, dayProgress, dayWorkout, doneCounts, startedCount } from '../../lib/planWorkout';
import { dayIndexOf } from '../../lib/plans';
import { planById } from '../../data/plans';
import { getPlanState, setFinishNextDay } from '../../db/planState';
import { ChangeDaySheet } from '../today/ChangeDaySheet';
import { dayTitle } from '../plans/planWords';
import { FADE, GENTLE, SPRINGS, STAGGER } from '../../ui/motion';
import { BottomCTA } from '../../ui/BottomCTA';
import { Odometer } from '../../ui/Odometer';
import { Skeleton } from '../../ui/Skeleton';
import { TrophyIcon } from '../../ui/icons';
import { holdTransition, transitionRunning, useNav } from '../../ui/nav';
import { LoadError } from '../../components/LoadError';
import { exerciseNamer, setCount, workoutTitle } from '../history/historyWords';
import styles from './Finish.module.css';

/**
 * The finish screen (SPEC 21.1, minimal): how long, how many sets, total lifted (when there is
 * any), each exercise with its best set, and records from real history only. A plan day with
 * exercises left reads "Workout saved · 3 sets" with "1 of 12 lifts finished" under it
 * (working exercises only: no warm ups, stretches or finisher). Finish already moved the plan
 * (60% of the working sets moves on, PLAN 2.0a); one quiet line above Done says what is up next,
 * with Change to pick another day. Done goes back to Today, where "Workout saved" offers Undo.
 */
export function FinishScreen() {
  const { sessionId = '' } = useParams();
  const go = useNav();
  const reduce = useReducedMotion();
  // Arriving inside a view transition (the push from the workout, critic B2 round 3): the page is
  // drawn whole before the snapshot (the transition waits for the read), never empty and then
  // filled; it does not cascade its own cards (the push is the motion). Its win card glows once it
  // has landed.
  const [sliding] = useState(transitionRunning);
  const release = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (sliding) release.current = holdTransition();
    return () => release.current?.();
  }, [sliding]);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const detail = useLive(async () => {
    const d = await finishedDetail(sessionId);
    if (!d) return { d: null, unit: 'lb' as const, records: [], win: null };
    const gym = await db.gyms.get(d.session.gymId);
    const records = await workoutRecords(sessionId, exerciseNamer(d.session));
    // PLAN 2.2e: the one biggest real win leads (the same rule as the live PR badge), or nothing.
    const { win } = await workoutWins(sessionId, exerciseNamer(d.session));
    // New bests lists only what the lead does not already say (critic B4): other exercises' records.
    const others = win ? records.filter((r) => r.exerciseId !== win.exerciseId) : records;
    return { d, unit: gym?.unit ?? d.sets.find((s) => s.load)?.load?.unit ?? 'lb', records: others, win };
  }, [sessionId]);
  // The plan as Finish left it (read, never written on mount): the next up line shows this, live.
  const planLive = useLive(() => getPlanState(), []);

  if (detail.ready && !detail.error && !detail.data?.d) return <Navigate to="/" replace />;
  const v = detail.data;
  const d = v?.d;

  const minutes = d ? Math.round(((d.session.endedAt ?? d.session.startedAt) - d.session.startedAt) / 60000) : 0;
  // Warm ups never count toward Total lifted (SPEC 21.1).
  const lifted = d && v ? totalLifted(d.sets.filter((s) => s.kind !== 'warmup'), v.unit) : 0;
  // The workout is saved whether or not this screen could read it back: Done always works, and
  // only claims a set count it actually read (PLAN 1.7f).
  // A plan day: "1 of 12 lifts finished", working exercises only (PLAN 2.0a).
  const plan = d ? planById(d.session.planId) : undefined;
  const dayIndex = plan && d ? dayIndexOf(plan, d.session.dayId) : -1;
  // The rows the lifter really had (PLAN 2.2d round 2: rows added or removed, kept on the session).
  const dayEntries = plan && d && dayIndex >= 0 ? adjustEntries(dayWorkout(plan, dayIndex, d.session.weekIndex ?? 0), d.session.rowAdjust) : [];
  const counted = d ? doneCounts(dayEntries, d.sets) : {};
  const progress = plan && d && dayIndex >= 0 ? dayProgress(dayEntries, (id) => counted[id] ?? 0) : undefined;
  // Working exercises with a set logged (a warm up too) that are not finished yet.
  const started = progress && d ? startedCount(dayEntries, counted, (id) => d.sets.some((x) => x.exerciseId === id)) : 0;
  const plannedOf = (id: string) => dayEntries.find((e) => e.exerciseId === id && !e.warmup)?.sets;
  const partialDay = !!progress && !progress.complete;
  // What is up next: only while this workout's plan is still the active one (never another plan).
  const state = planLive.data;
  const nextDay = plan && state && state.planId === plan.id && dayIndex >= 0 ? plan.days[state.nextDayIndex] : undefined;
  const pickNext = async (i: number) => {
    setChanging(false);
    try {
      await setFinishNextDay(sessionId, i);
      setChangeFailed(false);
    } catch {
      setChangeFailed(true);
    }
  };
  const done = () => {
    if (saving) return;
    setSaving(true);
    go('/', { kind: 'fade', replace: true, state: d ? { toast: `Workout saved · ${setCount(d.sets.length)}`, undo: { sessionId } } : null });
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

  // The lead card first, right after the title (critic P7); then the numbers and lists.
  useEffect(() => {
    if (detail.ready || detail.error) release.current?.();
  }, [detail.ready, detail.error]);
  const still = { initial: false } as const;
  const lead = sliding
    ? still
    : reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE }
    : { initial: { opacity: 0, y: 12, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...SPRINGS.sheet, delay: 0.04 } };
  const item = (i: number) =>
    sliding
      ? still
      : reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE }
      : { initial: { opacity: 0, y: 18, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...GENTLE, delay: (v?.win ? 0.08 : 0) + STAGGER * i } };

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
              {/* Saved first, always (ux-critic): "0 of 16 done" is never the headline. */}
              <h1 className={styles.title} data-testid="finish-title">
                {partialDay ? `Workout saved · ${setCount(d.sets.length)}` : 'Workout saved'}
              </h1>
              {progress && progress.total > 0 ? (
                <p className={`${styles.subtitle} num`} data-testid="finish-progress">
                  {progress.done} of {progress.total} {progress.total === 1 ? 'lift' : 'lifts'} finished
                  {started > 0 ? ` · ${started} started` : ''}
                </p>
              ) : null}
            </motion.div>
            {v.win && (
              <motion.p className={`${styles.win} ${sliding && !reduce ? styles.winLand : ''}`} data-testid="finish-win" aria-label={v.win.text} {...lead}>
                <span className={styles.winIcon} aria-hidden="true">
                  <TrophyIcon width={18} height={18} strokeWidth={2.2} />
                </span>
                <span className={styles.winText}>
                  <span className={styles.winName}>{v.win.name}</span>
                  <span className={styles.winDetail}>{v.win.detail}</span>
                </span>
              </motion.p>
            )}
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
                    const work = d.sets.filter((x) => x.exerciseId === r.id && x.kind !== 'warmup');
                    const count = work.length;
                    const loaded = work.flatMap((x) => (x.load ? [{ reps: x.reps, seconds: x.seconds, load: x.load }] : []));
                    // Every set the same (gate B1): the one session wording, "4 sets × 8 at 45 lb".
                    const uniform = loaded.length === count && sameSets(loaded) && !(planned && count < planned);
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
                        <span className={`${styles.exerciseBest} num`}>
                          {/* "4 sets × 8 at 45 lb" when every set matched; else "2 sets · 185 lb × 6" (round 3, critic P6): the count, then the best set. A plan
                              exercise with sets left already says "1 of 4 sets" under its name. */}
                          {uniform ? (
                            formatSession(loaded)
                          ) : (
                            <>
                              {count === 0 || (planned && count < planned) ? '' : `${setCount(count)} · `}
                              {formatSet(r.best)}
                            </>
                          )}
                        </span>
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
      </main>
      {/* Pinned under the scroller (never over it): the summary scrolls above it, every row reachable. */}
      <BottomCTA
        className={sliding ? undefined : styles.cta}
        onPress={done}
        disabled={loading || saving}
        above={
          <>
            {nextDay && d && (
              <motion.div
                className={styles.next}
                {...(sliding ? still : reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { ...GENTLE, delay: 0.12 } })}
              >
                <div className={styles.nextCopy}>
                  <p className={styles.nextText} data-testid="finish-next" aria-live="polite">
                    Next up: <span className={styles.nextDay}>{dayTitle(nextDay.n, nextDay.name)}</span>
                  </p>
                  {/* Why (gate P3): the same day again because not enough of it was done; real counts. */}
                  {progress && state && state.nextDayIndex === dayIndex && progress.planned > 0 && (
                    <p className={styles.nextWhy} data-testid="finish-next-why">
                      Day {nextDay.n} again · you did {progress.logged} of {progress.planned} sets
                    </p>
                  )}
                </div>
                <button type="button" className={`${styles.change} pressable`} onClick={() => setChanging(true)} aria-label={`Change the next day, now Day ${nextDay.n}`} data-testid="finish-change">
                  Change
                </button>
              </motion.div>
            )}
            {changeFailed && (
              <p className={styles.nextError} role="status">
                Could not change the day. Try again.
              </p>
            )}
          </>
        }
      >
        Done
      </BottomCTA>
      {plan && state && nextDay && (
        <ChangeDaySheet open={changing} onClose={() => setChanging(false)} plan={plan} state={state} onPick={(i) => void pickNext(i)} title="Which day next?" />
      )}
    </div>
  );
}
