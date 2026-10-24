import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { IconLink } from '../components/IconButton';
import { GymPill } from '../components/GymPill';
import { ProfileIcon } from '../components/icons';
import { Toast, type ToastMessage } from '../components/Toast';
import { planById } from '../data/plans';
import { startDb } from '../db/bootstrap';
import { getPlanState, setNextDay } from '../db/planState';
import { getActiveSession, startPlanDay, startWorkout } from '../db/workouts';
import { useLive } from '../hooks/useLive';
import { useTapGuard } from '../hooks/useTapGuard';
import { applyUpdate, isUpdateReady, onUpdateReady } from '../lib/pwaUpdate';
import { registerTap } from '../lib/secretTaps';
import { DayCard } from './today/DayCard';
import { ChangeDaySheet } from './today/ChangeDaySheet';
import styles from './TodayScreen.module.css';

export function TodayScreen() {
  const navigate = useNavigate();
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
    return { active: active ?? null, planState: planState ?? null };
  }, [dbOpen]);
  const data = { ready: dbOpen && live.ready && live.value !== null, value: live.value ?? undefined };
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [updateReady, setUpdateReady] = useState(isUpdateReady);
  const [error, setError] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => onUpdateReady(setUpdateReady), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // A message from the workout screen ("Workout saved · 6 sets"), shown once.
  useEffect(() => {
    const text = (location.state as { toast?: string } | null)?.toast;
    if (!text) return;
    setToast({ id: Date.now(), text });
    navigate('.', { replace: true, state: null });
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [location.state, navigate]);

  const active = data.value?.active ?? null;
  const planState = data.value?.planState ?? null;
  const plan = planById(planState?.planId);

  const quick = useTapGuard(async () => {
    setError(false);
    try {
      const session = active ?? (await startWorkout((await startDb()).id));
      navigate(`/workout/${session.id}`);
    } catch {
      setError(true);
    }
  });

  const startDay = useTapGuard(async () => {
    if (!plan || !planState) return;
    setError(false);
    try {
      const session = await startPlanDay((await startDb()).id, plan.id, planState.nextDayIndex);
      navigate(`/workout/${session.id}`, { viewTransition: true });
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
      <ScreenHeader
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
            <IconLink to="/settings" label="Settings">
              <ProfileIcon />
            </IconLink>
          </div>
        }
      />
      <div className={styles.stack}>
        {!data.ready ? (
          <div className={styles.startSkeleton} aria-hidden="true" />
        ) : active ? (
          <button type="button" className={`${styles.start} pressable`} data-continue onClick={() => void quick()}>
            <span className={styles.startLabel}>Continue workout</span>
            <span className={styles.startSub}>Pick up where you left off</span>
          </button>
        ) : plan && planState ? (
          <DayCard plan={plan} state={planState} onStart={() => void startDay()} onChangeDay={() => setChanging(true)} />
        ) : (
          <section className={styles.pick} aria-label="Pick a plan">
            <h2 className={styles.pickTitle}>Pick a plan</h2>
            <p className={styles.pickSub}>Follow a plan and every day is lined up for you: exercises, sets and rest.</p>
            <button type="button" className={`${styles.pickButton} pressable`} onClick={() => navigate('/plans')}>
              See plans
            </button>
          </section>
        )}
        {data.ready && !active && (
          <button type="button" className={`${styles.quick} pressable`} onClick={() => void quick()}>
            <span className={styles.quickLabel}>Quick workout</span>
            <span className={styles.quickSub}>Start empty, add exercises as you go</span>
          </button>
        )}
        <p className={styles.error} role="status">
          {error ? 'Could not start a workout. Try again.' : ''}
        </p>
      </div>
      {plan && planState && (
        <ChangeDaySheet open={changing} onClose={() => setChanging(false)} plan={plan} state={planState} onPick={(i) => void pickDay(i)} />
      )}
      <Toast toast={toast} bottom="var(--tabbar-height)" />
    </>
  );
}
