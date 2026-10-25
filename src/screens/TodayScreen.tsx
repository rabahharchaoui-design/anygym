import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TopBar } from '../ui/TopBar';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { SettingsIcon } from '../ui/icons';
import { useNav } from '../ui/nav';
import { GymPill } from '../components/GymPill';
import { LoadError } from '../components/LoadError';
import { Toast, type ToastMessage } from '../ui/Toast';
import { planById } from '../data/plans';
import { dayIndexOf } from '../lib/plans';
import { db } from '../db/schema';
import { setCount, workoutTitle } from './history/historyWords';
import { startDb } from '../db/bootstrap';
import { getPlanState, setNextDay } from '../db/planState';
import { getActiveSession, reopenWorkout, startPlanDay, startWorkout } from '../db/workouts';
import { logQueue } from '../lib/logQueue';
import type { PlanState } from '../db/types';
import { useLive } from '../hooks/useLive';
import { useTapGuard } from '../hooks/useTapGuard';
import { applyUpdate, isUpdateReady, onUpdateReady } from '../lib/pwaUpdate';
import { registerTap } from '../lib/secretTaps';
import { DayCard } from './today/DayCard';
import { ChangeDaySheet } from './today/ChangeDaySheet';
import { BackupReminder } from './today/BackupReminder';
import { useBackup } from './settings/useBackup';
import { snoozeBackupReminder } from '../db/backup';
import { onlyOnPhone, reminderReason, shouldRemind, SNOOZE_MS } from '../lib/backup';
import styles from './TodayScreen.module.css';

export function TodayScreen() {
  const navigate = useNavigate();
  const go = useNav();
  // Hidden: 7 taps on the title within 3 s opens the viewport diagnostics (PLAN 1.10b).
  const titleTaps = useRef<number[]>([]);
  const onTitleTap = () => {
    const r = registerTap(titleTaps.current, Date.now());
    titleTaps.current = r.taps;
    if (r.fired) navigate('/dev/viewport');
  };
  const location = useLocation();
  // Open the database first, outside the live query: awaiting a non Dexie promise inside it would
  // stop it from tracking, and Today would never see a later Change day or finish.
  const [dbOpen, setDbOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setDbOpen(true);
    startDb().then(done, done);
    return () => {
      alive = false;
    };
  }, []);
  const live = useLive(async () => {
    if (!dbOpen) return null;
    const active = await getActiveSession();
    const planState = await getPlanState();
    const activeSets = active ? await db.sets.where('sessionId').equals(active.id).count() : 0;
    // The backup reminder (SPEC 9.1): finished workouts and when the last backup was.
    const profile = await db.profile.toCollection().first();
    const done = await db.sessions.filter((s) => s.endedAt !== undefined || s.imported).toArray();
    const last = profile?.lastBackupAt;
    // Only on this phone: finished workouts the last successful backup did not hold, by id (never
    // guessed from dates or from being imported).
    const onlyHere = onlyOnPhone(done.map((s) => s.id), profile?.backedUpSessionIds);
    return { active: active ?? null, planState: planState ?? null, activeSets, finished: done.length, onlyHere, lastBackupAt: last, snoozeUntil: profile?.backupSnoozeUntil };
  }, [dbOpen]);
  // A failed read shows "Could not load workouts · Try again", never a false "Pick a plan"; the last
  // good result stays on screen (PLAN 1.7f).
  const data = { ready: dbOpen && live.ready && live.data != null, value: live.data ?? undefined };
  const failed = dbOpen && live.error !== null && !data.ready;
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [updateReady, setUpdateReady] = useState(isUpdateReady);
  const [error, setError] = useState(false);
  // false: closed; true: open; a number: open with that day picked (a tapped pip).
  const [changing, setChanging] = useState<boolean | number>(false);

  useEffect(() => onUpdateReady(setUpdateReady), []);

  // The toast sits just above the tab bar (gate 3), opaque, never over the cards' buttons.
  const quickRef = useRef<HTMLButtonElement>(null);
  const toastBottom = 'calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom) - 4px)';
  // When the cards reach down to it, the page makes room and scrolls them clear of the toast.
  useEffect(() => {
    if (!toast || !data.ready) return;
    const frame = requestAnimationFrame(() => {
      const card = quickRef.current;
      const anchor = document.querySelector<HTMLElement>('[data-toast-anchor]');
      const scroller = card?.closest<HTMLElement>('[data-scroller]');
      if (!card || !anchor || !scroller) return;
      const overlap = card.getBoundingClientRect().bottom + 8 - anchor.getBoundingClientRect().top;
      if (overlap > 0) scroller.scrollBy({ top: overlap, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [toast, data.ready]);

  // Back from Finish (a toast in the state): the whole page fades in together, once it has its data.
  const [arrived] = useState(() => !!(location.state as { toast?: string } | null)?.toast);
  useEffect(() => {
    if (!toast) return;
    // An Undo stays for 5 s (SPEC 13.1), a plain message 3 s.
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // A message from the workout screen ("Workout saved · 6 sets"), shown once. After Finish it
  // carries Undo: the workout opens again and the plan goes back to where it was (SPEC 13.1).
  const undoing = useRef(false);
  useEffect(() => {
    const st = location.state as { toast?: string; undo?: { sessionId: string; planBefore?: PlanState } } | null;
    const text = st?.toast;
    if (!text) return;
    const undo = st?.undo;
    const id = Date.now();
    setToast({
      id,
      text,
      ...(undo
        ? {
            action: {
              label: 'Undo',
              onPress: () => {
                if (undoing.current) return;
                undoing.current = true;
                setToast(null);
                reopenWorkout(undo.sessionId, undo.planBefore)
                  .then((ok) => {
                    if (ok) {
                      // Finish closed its log queue; the workout is active again, so ✓ logs again (PLAN 1.7h).
                      logQueue.reopen(undo.sessionId);
                      go(`/workout/${undo.sessionId}`, { kind: 'push' });
                    }
                    else setToast({ id: Date.now(), text: 'Could not undo. The workout is saved.' });
                  })
                  .catch(() => setToast({ id: Date.now(), text: 'Could not undo. The workout is saved.' }))
                  .finally(() => (undoing.current = false));
              },
            },
          }
        : {}),
    });
    navigate('.', { replace: true, state: null });
  }, [location.state, navigate, go]);

  const backUp = useBackup(setToast);
  const active = data.value?.active ?? null;
  const remind =
    data.ready &&
    shouldRemind({ sessions: data.value?.finished ?? 0, lastBackupAt: data.value?.lastBackupAt, snoozeUntil: data.value?.snoozeUntil, activeWorkout: active !== null, now: Date.now() });
  const later = () => void snoozeBackupReminder(Date.now() + SNOOZE_MS).catch(() => setToast({ id: Date.now(), text: 'Could not save that. Try again.' }));
  const planState = data.value?.planState ?? null;
  const plan = planById(planState?.planId);

  const quick = useTapGuard(async () => {
    setError(false);
    try {
      const session = active ?? (await startWorkout((await startDb()).id));
      go(`/workout/${session.id}`, { kind: 'push' });
    } catch {
      setError(true);
    }
  });

  const startDay = useTapGuard(async () => {
    if (!plan || !planState) return;
    setError(false);
    try {
      const session = await startPlanDay((await startDb()).id, plan.id, planState.nextDayIndex);
      // The day card expands into the workout and Start becomes its header (SPEC 13.2).
      go(`/workout/${session.id}`, { kind: 'expand', state: { expand: true } });
    } catch {
      setError(true);
    }
  });

  const pickDay = async (dayIndex: number) => {
    setChanging(false);
    try {
      await setNextDay(dayIndex);
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <TopBar
        title="Today"
        onTitleTap={onTitleTap}
        trailing={
          <div className={styles.trailing}>
            {updateReady && (
              <button
                type="button"
                className={`${styles.update} pressable`}
                onClick={() =>
                  void applyUpdate().then((applied) => {
                    if (!applied) setToast({ id: Date.now(), text: 'Finish your workout first, then update.' });
                  })
                }
              >
                Update ready
              </button>
            )}
            <GymPill />
            <IconButton to="/settings" label="Settings">
              <SettingsIcon strokeWidth={2} />
            </IconButton>
          </div>
        }
      />
      <div className={styles.stack} data-arrive={arrived || undefined} data-ready={data.ready || failed || undefined}>
        {live.error && dbOpen ? (
          <LoadError text={failed ? "We couldn't read your saved workouts. Try again, or start a quick workout." : 'Could not load workouts'} onRetry={live.retry} />
        ) : null}
        {failed ? null : !data.ready ? (
          <Skeleton height={248} radius={28} />
        ) : active && plan && planState && active.planId === plan.id && dayIndexOf(plan, active.dayId) >= 0 ? (
          // The plan day in progress: the day card stays, as the one card, with Resume (1.7e).
          <DayCard
            plan={plan}
            state={planState}
            active={{ dayIndex: dayIndexOf(plan, active.dayId), sets: data.value?.activeSets ?? 0 }}
            onStart={() => void quick()}
            onChangeDay={() => undefined}
          />
        ) : active ? (
          <button type="button" className={`${styles.start} pressable`} data-continue onClick={() => void quick()}>
            <span className={styles.startLabel}>Resume</span>
            <span className={`${styles.startSub} num`}>
              {workoutTitle(active)} · in progress · {setCount(data.value?.activeSets ?? 0)}
            </span>
          </button>
        ) : plan && planState ? (
          <DayCard plan={plan} state={planState} onStart={() => void startDay()} onChangeDay={(i) => setChanging(i ?? true)} />
        ) : (
          <section className={styles.pick} aria-label="Pick a plan">
            <h2 className={styles.pickTitle}>Pick a plan</h2>
            <p className={styles.pickSub}>Follow a plan and every day is lined up for you: exercises, sets and rest.</p>
            <Button onClick={() => go('/plans', { kind: 'tab' })}>See plans</Button>
          </section>
        )}
        {/* Also when the saved workouts could not be read: a quick workout still works (no dead end). */}
        {((data.ready && !active) || failed) && (
          <button type="button" ref={quickRef} className={`${styles.quick} pressable`} onClick={() => void quick()} data-testid="quick-card">
            <span className={styles.quickLabel}>Quick workout</span>
            <span className={styles.quickSub}>Start empty, add exercises as you go</span>
          </button>
        )}
        <BackupReminder
          show={remind}
          reason={reminderReason({ onlyHere: data.value?.onlyHere ?? 0, lastBackupAt: data.value?.lastBackupAt, now: Date.now() })}
          onBackUp={() => void backUp()}
          onLater={later}
        />
        <p className={styles.error} role="status">
          {error ? 'Could not start a workout. Try again.' : ''}
        </p>
      </div>
      {plan && planState && (
        <ChangeDaySheet
          open={changing !== false}
          picked={typeof changing === 'number' ? changing : undefined}
          onClose={() => setChanging(false)}
          plan={plan}
          state={planState}
          onPick={(i) => void pickDay(i)}
        />
      )}
      <Toast toast={toast} bottom={toastBottom} />
    </>
  );
}
