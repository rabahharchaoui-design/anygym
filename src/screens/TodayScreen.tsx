import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { IconLink } from '../components/IconButton';
import { EmptyState } from '../components/EmptyState';
import { GymPill } from '../components/GymPill';
import { ProfileIcon } from '../components/icons';
import { Toast, type ToastMessage } from '../components/Toast';
import { startDb } from '../db/bootstrap';
import { getActiveSession, startWorkout } from '../db/workouts';
import { useLive } from '../hooks/useLive';
import { useTapGuard } from '../hooks/useTapGuard';
import { applyUpdate, isUpdateReady, onUpdateReady } from '../lib/pwaUpdate';
import styles from './TodayScreen.module.css';

export function TodayScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = useLive(async () => {
    await startDb();
    return (await getActiveSession()) ?? null;
  }, []);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [updateReady, setUpdateReady] = useState(isUpdateReady);
  const [error, setError] = useState(false);

  useEffect(() => onUpdateReady(setUpdateReady), []);

  // A message from the workout screen ("Workout saved · 6 sets"), shown once.
  useEffect(() => {
    const text = (location.state as { toast?: string } | null)?.toast;
    if (!text) return;
    setToast({ id: Date.now(), text });
    navigate('.', { replace: true, state: null });
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [location.state, navigate]);

  const go = useTapGuard(async () => {
    setError(false);
    try {
      const session = active.value ?? (await startWorkout((await startDb()).id));
      navigate(`/workout/${session.id}`);
    } catch {
      setError(true);
    }
  });

  const continuing = !!active.value;

  return (
    <>
      <ScreenHeader
        title="Today"
        trailing={
          <div className={styles.trailing}>
            {updateReady && (
              <button type="button" className={`${styles.update} pressable`} onClick={applyUpdate}>
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
        {active.ready ? (
          <button type="button" className={`${styles.start} pressable`} data-continue={continuing} onClick={() => void go()}>
            <span className={styles.startLabel}>{continuing ? 'Continue workout' : 'Quick workout'}</span>
            <span className={styles.startSub}>{continuing ? 'Pick up where you left off' : 'Start empty, add exercises as you go'}</span>
          </button>
        ) : (
          <div className={styles.startSkeleton} aria-hidden="true" />
        )}
        <p className={styles.error} role="status">
          {error ? 'Could not start a workout. Try again.' : ''}
        </p>
        <EmptyState title="No plan yet" next="Once you pick a plan, today's workout shows up here." />
      </div>
      <Toast toast={toast} bottom="var(--tabbar-height)" />
    </>
  );
}
