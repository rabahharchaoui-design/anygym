import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { db } from '../../db/schema';
import type { Load, WorkoutSet } from '../../db/types';
import { addExercise, deleteSet, finishWorkout, logSet, setsOf, updateSet } from '../../db/workouts';
import { getPastSessions } from '../../db/history';
import { pickLoadType, saveLoadType } from '../../db/exerciseSettings';
import { planExercise } from '../../data/planExercises';
import { planById } from '../../data/plans';
import { dayIndexOf } from '../../lib/plans';
import { dayWorkout, firstOpen, nextCurrent, repRangeOf, restAfter, type DoneCounts } from '../../lib/planWorkout';
import { dayTitle } from '../plans/planWords';
import { useLive } from '../../hooks/useLive';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Toast, type ToastMessage } from '../../components/Toast';
import { createUndoQueue } from '../../lib/undoQueue';
import { hints } from '../../lib/hints';
import { extendRest, loadRest, saveRest, startRest, type Rest } from '../../lib/rest';
import { formatElapsed } from '../../lib/timer';
import { progress, type PastSession, type Progression } from '../../lib/progression';
import { unlockAudio } from '../../lib/tone';
import { AddExerciseSheet } from './AddExerciseSheet';
import { EditSetSheet } from './EditSetSheet';
import { ExerciseCard } from './ExerciseCard';
import { LoadTypeSheet } from './LoadTypeSheet';
import { RestDock } from './RestDock';
import type { SetDraft } from './SetCard';
import { loadCurrent, saveCurrent } from './currentExercise';
import { barIdFor, loadSetupFor } from './exerciseLoad';
import styles from './Workout.module.css';

let toastSeq = 0;
const toastOf = (text: string, action?: ToastMessage['action']): ToastMessage => ({ id: ++toastSeq, text, action });
const exerciseName = (id: string) => planExercise(id)?.name ?? id;

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
  const exerciseIds = session.value?.exerciseIds ?? [];

  // Plan day (PLAN 1.10): targets, rest, notes and pairs for each exercise, in day order.
  const plan = planById(session.value?.planId);
  const dayIndex = plan ? dayIndexOf(plan, session.value?.dayId) : -1;
  const weekIndex = session.value?.weekIndex ?? 0;
  const entries = useMemo(() => (plan && dayIndex >= 0 ? dayWorkout(plan, dayIndex, weekIndex) : []), [plan, dayIndex, weekIndex]);
  const entryOf = useMemo(() => new Map(entries.map((e) => [e.exerciseId, e])), [entries]);
  const day = plan && dayIndex >= 0 ? plan.days[dayIndex] : undefined;
  const nameOf = (id: string) => entryOf.get(id)?.name ?? exerciseName(id);

  const loadTypeOf = (id: string): Load['kind'] | undefined => {
    // A plan hold ("45 sec") is timed, whatever the name says.
    const entry = entryOf.get(id);
    if (entry && (entry.finisher || (entry.seconds !== undefined && entry.reps === undefined))) return 'timed';
    const fixed = planExercise(id)?.loadType;
    if (fixed && fixed !== 'unknown') return fixed;
    return gym.value ? pickLoadType(settings.value ?? [], id, gym.value.id) : undefined;
  };

  // Earlier workouts of each exercise whose load type is known (SPEC 6): "Last time" and "Next".
  const historyKey = gymId ? exerciseIds.map((id) => `${id}:${loadTypeOf(id) ?? ''}`).join('|') : '';
  const history = useLive(async () => {
    const out = new Map<string, PastSession[]>();
    if (!gymId || !historyKey) return out;
    for (const pair of historyKey.split('|')) {
      const [id, kind] = pair.split(':') as [string, Load['kind'] | ''];
      if (kind) out.set(id, await getPastSessions(id, gymId, kind, 6, { smith: barIdFor(nameOf(id)) === 'smith' }));
    }
    return out;
  }, [historyKey, gymId]);

  const progressionOf = (id: string): Progression | undefined => {
    const kind = loadTypeOf(id);
    const past = history.value?.get(id);
    if (!kind || !past || !gym.value) return undefined;
    // Plan: the plan's rep range, and the week's prescription for a weekly table (SPEC 6 rule 6).
    // Quick workout: no rep range yet, so the engine aims to beat last time's reps (SPEC 6, 20.3).
    const entry = entryOf.get(id);
    return progress({
      exerciseId: id,
      loadKind: kind,
      unit: gym.value.unit,
      gym: loadSetupFor(gym.value, kind, id, nameOf(id)),
      repRange: entry && kind !== 'timed' ? repRangeOf(entry) : null,
      history: past,
      ...(entry?.prescription && kind !== 'timed' ? { prescription: entry.prescription } : {}),
    });
  };

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

  const sets = (allSets.value ?? []).filter((s) => !hidden.has(s.id));
  const doneCounts = (list: WorkoutSet[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const s of list) out[s.exerciseId] = (out[s.exerciseId] ?? 0) + 1;
    return out;
  };
  // Plan: the first exercise with sets left; quick workout: the newest one.
  const fallback = entries.length ? (firstOpen(entries, doneCounts(sets)) ?? entries[0]!.exerciseId) : (exerciseIds[exerciseIds.length - 1] ?? null);
  const expanded = current && exerciseIds.includes(current) ? current : fallback;

  const mainRef = useRef<HTMLElement>(null);
  const scrollMode = useRef<'instant' | 'smooth' | null>('instant');
  const expand = (id: string) => {
    setCurrent(id);
    saveCurrent(sessionId, id);
  };
  const advance = (id: string) => {
    scrollMode.current = 'smooth';
    expand(id);
  };

  // Current card first (PLAN 1.10): on open and after each advance, the current card sits at the
  // top of the list (a pair's label stays visible above its first card).
  const ready = !!(session.value && gym.value && allSets.ready && settings.ready && history.ready);
  useLayoutEffect(() => {
    const main = mainRef.current;
    const mode = scrollMode.current;
    if (!ready || !main || !expanded || !mode || entries.length === 0) return;
    const card = main.querySelector<HTMLElement>(`[data-exercise="${CSS.escape(expanded)}"]`);
    if (!card) return;
    scrollMode.current = null;
    const group = card.parentElement?.dataset.group !== undefined && card.previousElementSibling?.tagName === 'P' ? card.parentElement : card;
    const pad = 6;
    const top = group.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - pad;
    const smooth = mode === 'smooth' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    main.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }, [ready, expanded, entries.length]);

  // Plan exercises whose load type is not known yet ask once, when they come up.
  const asked = useRef(new Set<string>());
  const expandedNeedsType = ready && !!expanded && entryOf.has(expanded) && !loadTypeOf(expanded);
  useEffect(() => {
    if (!expandedNeedsType || !expanded || asked.current.has(expanded)) return;
    asked.current.add(expanded);
    setAsking(expanded);
  }, [expandedNeedsType, expanded]);

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
      // Warm up block sets are stored as warm ups, so progression ignores them (SPEC 6 rule 1).
      await logSet({ ...draft, sessionId, exerciseId, ...(entryOf.get(exerciseId)?.warmup ? { kind: 'warmup' as const } : {}) });
      const done: DoneCounts = doneCounts([...sets, { exerciseId } as WorkoutSet]);
      const restSec = restAfter(entries, done, exerciseId);
      if (restSec === null) setRest(startRest(sessionId, Date.now()));
      else setRest(restSec > 0 ? startRest(sessionId, Date.now(), restSec) : null);
      // Plan: on to the next set, the pair partner or the next exercise (SPEC 13.5).
      if (entryOf.has(exerciseId)) {
        const next = nextCurrent(entries, done, exerciseId);
        if (next !== exerciseId) advance(next);
      }
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

  const card = (id: string) => (
    <ExerciseCard
      key={id}
      exerciseId={id}
      name={nameOf(id)}
      loadType={loadTypeOf(id)}
      gym={gym.value!}
      sets={sets.filter((s) => s.exerciseId === id)}
      progression={progressionOf(id)}
      expanded={id === expanded}
      onExpand={() => expand(id)}
      onAskLoadType={() => setAsking(id)}
      onLog={(d) => onLog(d, id)}
      onEditSet={setEditing}
      actionSlot={actionSlot}
      entry={entryOf.get(id)}
    />
  );

  // Cards in order; a pair's cards share one rail with "Pair: back to back" (SPEC 8.2, 13.1).
  const cards: ReactNode[] = [];
  for (let i = 0; i < exerciseIds.length; ) {
    const id = exerciseIds[i]!;
    const entry = entryOf.get(id);
    if (entry?.kind === 'pair') {
      const group: string[] = [];
      while (i < exerciseIds.length && entryOf.get(exerciseIds[i]!)?.block === entry.block) group.push(exerciseIds[i++]!);
      cards.push(
        <div key={`pair-${entry.block}`} className={styles.pairGroup} data-group="" data-warmup={entry.warmup || undefined} data-testid="pair-group">
          <p className={styles.pairLabel}>{entry.warmup ? 'Warm up · Pair: back to back' : 'Pair: back to back'}</p>
          {group.map(card)}
        </div>,
      );
    } else {
      cards.push(
        entry?.finisher ? (
          <Fragment key={id}>
            <p className={styles.finisherLabel}>Finisher</p>
            {card(id)}
          </Fragment>
        ) : entry?.warmup ? (
          <Fragment key={id}>
            <p className={styles.warmLabel}>Warm up</p>
            {card(id)}
          </Fragment>
        ) : (
          card(id)
        ),
      );
      i++;
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <div className={styles.clockBox}>
          <span className={styles.clockLabel} data-testid="workout-title">
            {day ? dayTitle(day.n, day.name) : 'Workout'}
          </span>
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

      <main className={styles.body} ref={mainRef}>
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
            {cards}
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
