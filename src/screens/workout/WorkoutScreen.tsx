import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { db } from '../../db/schema';
import type { Load, WorkoutSet } from '../../db/types';
import { addExercise, deleteSet, finishWorkout, lastSetBefore, logSet, setsOf, updateSet } from '../../db/workouts';
import { pickLoadType, saveLoadType } from '../../db/exerciseSettings';
import { planExercise } from '../../data/planExercises';
import { useLive } from '../../hooks/useLive';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Toast, type ToastMessage } from '../../components/Toast';
import { createUndoQueue } from '../../lib/undoQueue';
import { hints } from '../../lib/hints';
import { extendRest, loadRest, saveRest, startRest, type Rest } from '../../lib/rest';
import { formatElapsed } from '../../lib/timer';
import { unlockAudio } from '../../lib/tone';
import { AddExerciseSheet } from './AddExerciseSheet';
import { EditSetSheet } from './EditSetSheet';
import { ExerciseCard } from './ExerciseCard';
import { LoadTypeSheet } from './LoadTypeSheet';
import { RestDock } from './RestDock';
import type { SetDraft } from './SetCard';
import { loadCurrent, saveCurrent } from './currentExercise';
import styles from './Workout.module.css';

let toastSeq = 0;
const toastOf = (text: string, action?: ToastMessage['action']): ToastMessage => ({ id: ++toastSeq, text, action });
const nameOf = (id: string) => planExercise(id)?.name ?? id;

/** Workout screen (SPEC 8.2): top bar, exercise cards, the set card, rest timer. No tab bar. */
export function WorkoutScreen() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  useWakeLock(true);

  const session = useLive(() => db.sessions.get(sessionId), [sessionId]);
  const allSets = useLive(() => setsOf(sessionId), [sessionId]);
  const gymId = session.value?.gymId;
  const gym = useLive(() => (gymId ? db.gyms.get(gymId) : Promise.resolve(undefined)), [gymId]);
  const settings = useLive(() => db.exerciseSettings.toArray(), []);
  const idsKey = (session.value?.exerciseIds ?? []).join('|');
  // Each exercise's last set in the most recent earlier workout: prefill and "Last time".
  const history = useLive(async () => {
    const ids = idsKey ? idsKey.split('|') : [];
    const found = await Promise.all(ids.map((id) => lastSetBefore(id, sessionId)));
    return new Map(ids.map((id, i) => [id, found[i]] as const));
  }, [idsKey, sessionId]);

  const [current, setCurrent] = useState<string | null>(() => loadCurrent(sessionId));
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [rest, setRestState] = useState<Rest | null>(() => loadRest(sessionId));
  const finishing = useRef(false);
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);

  const queue = useMemo(() => createUndoQueue<WorkoutSet>((s) => deleteSet(s.id)), []);
  // Leaving the screen (or the page) commits held deletes right away.
  useEffect(() => {
    const flush = () => void queue.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [queue]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // No first time hints while the rest timer counts (SPEC 13.5).
  useEffect(() => {
    hints.setBlocked(rest !== null);
  }, [rest]);
  useEffect(() => () => hints.setBlocked(false), []);

  const setRest = useCallback((r: Rest | null) => {
    setRestState(r);
    saveRest(r);
  }, []);

  const exerciseIds = session.value?.exerciseIds ?? [];
  const sets = (allSets.value ?? []).filter((s) => !hidden.has(s.id));
  const expanded = current && exerciseIds.includes(current) ? current : (exerciseIds[exerciseIds.length - 1] ?? null);

  const loadTypeOf = (id: string): Load['kind'] | undefined => {
    const fixed = planExercise(id)?.loadType;
    if (fixed && fixed !== 'unknown') return fixed;
    return gym.value ? pickLoadType(settings.value ?? [], id, gym.value.id) : undefined;
  };

  const expand = (id: string) => {
    setCurrent(id);
    saveCurrent(sessionId, id);
  };

  const pick = async (id: string) => {
    setAdding(false);
    try {
      await addExercise(sessionId, id);
      expand(id);
      if (!loadTypeOf(id)) setAsking(id);
    } catch {
      setToast(toastOf('Could not add that. Try again.'));
    }
  };

  const answer = async (kind: Load['kind']) => {
    const id = asking;
    setAsking(null);
    if (!id || !gym.value) return;
    try {
      await saveLoadType(id, gym.value.id, kind);
    } catch {
      setToast(toastOf('Could not save that. Try again.'));
    }
  };

  const onLog = async (draft: SetDraft, exerciseId: string): Promise<boolean> => {
    unlockAudio();
    try {
      await logSet({ ...draft, sessionId, exerciseId });
      setRest(startRest(sessionId, Date.now()));
      return true;
    } catch {
      setToast(toastOf('Could not save that set. Try again.'));
      return false;
    }
  };

  const onSave = async (set: WorkoutSet, change: { reps?: number; seconds?: number; load: Load }) => {
    try {
      await updateSet(set.id, change);
      setEditing(null);
    } catch {
      setToast(toastOf('Could not save that. Try again.'));
    }
  };

  const onDelete = (set: WorkoutSet) => {
    setEditing(null);
    setHidden((h) => new Set(h).add(set.id));
    queue.push(set.id, set);
    setToast(
      toastOf('Set deleted', {
        label: 'Undo',
        onPress: () => {
          queue.undo(set.id);
          setHidden((h) => {
            const next = new Set(h);
            next.delete(set.id);
            return next;
          });
          setToast(null);
        },
      }),
    );
  };

  const finish = useTapGuard(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      await queue.flush();
      const result = await finishWorkout(sessionId);
      setRest(null);
      saveCurrent(sessionId, null);
      const text = result.saved ? `Workout saved · ${result.sets} ${result.sets === 1 ? 'set' : 'sets'}` : 'Nothing logged · Workout discarded';
      navigate('/', { replace: true, state: { toast: text } });
    } catch {
      finishing.current = false;
      setToast(toastOf('Could not finish. Try again.'));
    }
  });

  const now = useNow(1000);

  if (session.ready && (!session.value || session.value.endedAt !== undefined) && !finishing.current) {
    return <Navigate to="/" replace />;
  }

  const startedAt = session.value?.startedAt;
  const editIndex = editing ? sets.filter((s) => s.exerciseId === editing.exerciseId).findIndex((s) => s.id === editing.id) : 0;
  const ready = session.value && gym.value && allSets.ready && settings.ready && history.ready;

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <div className={styles.clockBox}>
          <span className={styles.clockLabel}>Workout</span>
          <span className={`${styles.clock} num`} data-testid="elapsed" role="timer" aria-live="off">
            {startedAt ? formatElapsed((now - startedAt) / 1000) : '0:00'}
          </span>
        </div>
        <nav className={styles.music} aria-label="Music">
          <a className={`${styles.musicButton} pressable`} href="https://open.spotify.com/" target="_blank" rel="noopener" aria-label="Open Spotify">
            Spotify
          </a>
          <a className={`${styles.musicButton} pressable`} href="https://music.apple.com/" target="_blank" rel="noopener" aria-label="Open Apple Music">
            Music
          </a>
        </nav>
        <button type="button" className={`${styles.finish} pressable`} onClick={() => void finish()}>
          Finish
        </button>
      </header>

      <main className={styles.body}>
        {!ready ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : exerciseIds.length === 0 ? (
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>Empty workout</h2>
            <p className={styles.hint}>Add your first exercise to start logging.</p>
            <button type="button" className={`${styles.logButton} pressable`} onClick={() => setAdding(true)}>
              + Add exercise
            </button>
          </div>
        ) : (
          <>
            {exerciseIds.map((id) => (
              <ExerciseCard
                key={id}
                exerciseId={id}
                name={nameOf(id)}
                loadType={loadTypeOf(id)}
                gym={gym.value!}
                sets={sets.filter((s) => s.exerciseId === id)}
                previous={history.value?.get(id)}
                expanded={id === expanded}
                onExpand={() => expand(id)}
                onAskLoadType={() => setAsking(id)}
                onLog={(d) => onLog(d, id)}
                onEditSet={setEditing}
                actionSlot={actionSlot}
              />
            ))}
            <button type="button" className={`${styles.addButton} pressable`} onClick={() => setAdding(true)}>
              + Add exercise
            </button>
          </>
        )}
      </main>

      {/* Sticky bottom bar: Log set for the open card. The rest bar floats just above it over space
          the body always reserves, so nothing moves when rest starts or ends. */}
      <div className={styles.dockWrap}>
        <AnimatePresence>
          {rest && <RestDock key="rest" rest={rest} onExtend={() => setRest(extendRest(rest, Date.now()))} onSkip={() => setRest(null)} onDone={() => setRest(null)} />}
        </AnimatePresence>
        <div ref={setActionSlot} className={styles.dock} data-testid="action-bar" />
      </div>

      <Toast toast={toast} bottom={rest ? '148px' : '76px'} />

      <AddExerciseSheet open={adding} onClose={() => setAdding(false)} added={exerciseIds} onPick={(id) => void pick(id)} />
      <LoadTypeSheet open={asking !== null} onClose={() => setAsking(null)} exerciseName={asking ? nameOf(asking) : ''} onPick={(k) => void answer(k)} />
      {gym.value && (
        <EditSetSheet
          set={editing}
          index={Math.max(0, editIndex)}
          exerciseName={editing ? nameOf(editing.exerciseId) : ''}
          loadType={editing ? loadTypeOf(editing.exerciseId) : undefined}
          gym={gym.value}
          onClose={() => setEditing(null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
