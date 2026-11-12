import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { db } from '../../db/schema';
import { finishedDetail } from '../../db/history';
import { workoutMoments } from '../../db/celebrations';
import { useLive } from '../../hooks/useLive';
import { formatSession, formatSet, sameSets } from '../../lib/setWords';
import { workSetCount } from '../../lib/workSets';
import { formatTotalCompact, totalLifted } from '../../lib/load';
import { bestSetOf } from '../../lib/records';
import { adjustEntries, dayProgress, dayWorkout, doneCounts, startedCount } from '../../lib/planWorkout';
import { dayIndexOf } from '../../lib/plans';
import { planById } from '../../data/plans';
import { getPlanState, setFinishNextDay } from '../../db/planState';
import { ChangeDaySheet } from '../today/ChangeDaySheet';
import { dayTitle } from '../plans/planWords';
import { FADE, GENTLE, STAGGER } from '../../ui/motion';
import { BigMoment, Effect, MomentCard } from '../../ui/celebrate';
import { preloadArt } from '../../ui/art/lazy';
import { BottomCTA } from '../../ui/BottomCTA';
import { Odometer } from '../../ui/Odometer';
import { Skeleton } from '../../ui/Skeleton';
import { holdTransition, transitionRunning, useNav } from '../../ui/nav';
import { LoadError } from '../../components/LoadError';
import { exerciseNamer, setCount, workoutTitle } from '../history/historyWords';
import { finishRows, slotProgress } from '../../lib/swap';
import styles from './Finish.module.css';
import { trimmedPlan } from '../../lib/timeBudget';
import { useFinishCelebration } from './useFinishCelebration';

/**
 * The finish screen (SPEC 21.1, minimal): how long, how many sets, total lifted (when there is
 * any), each exercise with its best set, and records from real history only. A plan day with
 * exercises left reads "Workout saved · 3 sets" with "1 of 12 lifts finished" under it
 * (working exercises only: no warm ups, stretches or finisher). Finish already moved the plan
 * (60% of the working sets moves on, PLAN 2.0a); one quiet line above Done says what is up next,
 * with Change to pick another day. Done goes back to Today, where "Workout saved" offers Undo.
 * Celebrations (PLAN 3.6b, src/ui/celebrate): a rare moment (the first workout, the heaviest ever
 * on a main lift) takes the whole screen once and settles into its card or tile; every other real
 * record is a card.
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
    if (!d) return { d: null, unit: 'lb' as const, moments: [] };
    const gym = await db.gyms.get(d.session.gymId);
    const unit = gym?.unit ?? d.sets.find((s) => s.load)?.load?.unit ?? 'lb';
    // PLAN 3.6b: every real record of the workout (the same rule as the live "New best" chip), one
    // per lift, and the first workout: the moments the screen celebrates, or none.
    return { d, unit, moments: await workoutMoments(sessionId, exerciseNamer(d.session), unit) };
  }, [sessionId]);
  const cele = useFinishCelebration(sessionId, detail.ready && !detail.error ? detail.data?.moments : undefined, sliding);
  // PLAN 3.6h: the medals and effects are a lazy chunk; ask for it now so it is here when the screen shows.
  useEffect(preloadArt, []);
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
  const planDay = plan && d && dayIndex >= 0 ? dayWorkout(trimmedPlan(plan, dayIndex, d.session.trim, d.session.weekIndex ?? 0), dayIndex, d.session.weekIndex ?? 0) : [];
  const swaps = d?.session.swaps;
  // A changed workout (PLAN 3.4): the rows it really had, and one slot per plan exercise in the count.
  const dayEntries = d && swaps?.length ? finishRows(planDay, d.session, d.sets, exerciseNamer(d.session)) : adjustEntries(planDay, d?.session.rowAdjust);
  const counted = d ? doneCounts(dayEntries, d.sets) : {};
  const progress = !(plan && d && dayIndex >= 0) ? undefined : swaps?.length ? slotProgress(planDay, swaps, d.session.rowAdjust, d.sets) : dayProgress(dayEntries, (id) => counted[id] ?? 0);
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
    go('/', { kind: 'fade', replace: true, state: d ? { toast: `Workout saved · ${setCount(workSetCount(d.sets))}`, undo: { sessionId } } : null });
  };
  const loading = !detail.error && (!d || !v || !cele.settled);
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
    if ((detail.ready && cele.settled) || detail.error) release.current?.();
  }, [detail.ready, detail.error, cele.settled]);
  const still = { initial: false } as const;
  // The first workout has no card: its number is a stat tile, and the full screen moment settles into it.
  const firstId = v?.moments.find((m) => m.kind === 'first_workout')?.id;
  const item = (i: number) =>
    sliding
      ? still
      : reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE }
      : { initial: { opacity: 0, y: 18, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...GENTLE, delay: (cele.lead ? 0.08 : 0) + STAGGER * i } };

  return (
    <div className={styles.screen}>
      <main className={styles.main} aria-label="Workout done">
        {detail.error ? <LoadError text="Could not load this workout" onRetry={detail.retry} /> : null}
        {!d || !v || !cele.settled ? (
          !detail.error && <Skeleton height={240} radius={22} />
        ) : (
          <>
            <motion.div className={styles.head} {...item(0)}>
              <p className={styles.kicker}>{workoutTitle(d.session)}</p>
              {/* Saved first, always (ux-critic): "0 of 16 done" is never the headline. */}
              <h1 className={styles.title} data-testid="finish-title">
                {partialDay ? (
                  <>
                    Workout saved · <span className={styles.nowrap}>{setCount(workSetCount(d.sets))}</span>
                  </>
                ) : (
                  'Workout saved'
                )}
              </h1>
              {progress && progress.total > 0 ? (
                <p className={`${styles.subtitle} num`} data-testid="finish-progress">
                  {progress.done} of {progress.total} {progress.total === 1 ? 'lift' : 'lifts'} finished
                  {started > 0 ? ` · ${started} started` : ''}
                </p>
              ) : null}
            </motion.div>
            {cele.lead && <MomentCard moment={cele.lead} arrival={cele.leadArrival} delay={0.04} reduce={reduce} testId="finish-win" />}
            <div className={styles.stats}>
              <motion.div className={styles.stat} {...item(1)}>
                <span className={`${styles.value} num`} data-testid="finish-duration">
                  {minutes < 1 ? '<1 min' : <Odometer value={`${minutes} min`} countUp={!reduce} />}
                </span>
                <span className={styles.label}>Time</span>
              </motion.div>
              <motion.div className={styles.stat} data-celebrate-home={lifted > 0 ? undefined : firstId} {...item(2)}>
                <span className={`${styles.value} num`} data-testid="finish-sets">
                  <Odometer value={workSetCount(d.sets)} countUp={!reduce} />
                </span>
                <span className={styles.label}>{workSetCount(d.sets) === 1 ? 'Set' : 'Sets'}</span>
              </motion.div>
              {lifted > 0 && (
                <motion.div className={`${styles.stat} ${styles.wide}`} data-celebrate-home={firstId} {...item(3)}>
                  <span className={`${styles.value} num`} data-testid="finish-total">
                    <Odometer value={formatTotalCompact(lifted, v.unit)} countUp={!reduce} />
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
            {cele.others.length > 0 && (
              <motion.section className={styles.records} aria-label="New bests" {...item(5)}>
                <h2 className={styles.recordsTitle}>New bests</h2>
                <ul className={styles.recordList}>
                  {cele.others.map((m, i) => (
                    <MomentCard key={m.id} moment={m} arrival={cele.otherArrival} size="row" as="li" delay={0.5 + STAGGER * i} reduce={reduce} testId="pr-chip" />
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
      {/* PLAN 3.6h: calm drifting glass behind the summary, once any full screen moment is over. */}
      {cele.settled && !cele.big && <Effect variant="ambient" reduce={reduce} />}
      {cele.big && <BigMoment moment={cele.big} reduce={reduce} onSettle={cele.onSettle} onDone={cele.onDone} />}
      {plan && state && nextDay && (
        <ChangeDaySheet open={changing} onClose={() => setChanging(false)} plan={plan} state={state} onPick={(i) => void pickNext(i)} title="Which day next?" />
      )}
    </div>
  );
}
