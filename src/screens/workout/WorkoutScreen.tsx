import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from 'motion/react';
import type { Load, WorkoutSet } from '../../db/types';
import {
  WorkoutFinishedError,
  addExercise,
  deleteSet,
  finishWorkout,
  removeExercise,
  restoreExercise,
  restoreSet,
  setExerciseOrder,
  updateSet,
} from '../../db/workouts';
import { saveExerciseNote, saveExerciseRest, saveLoadType } from '../../db/exerciseSettings';
import { moveInOrder, nextCurrent, restAfter, upNext } from '../../lib/planWorkout';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Toast, type ToastMessage } from '../../components/Toast';
import { FADE, SHEET_SPRING } from '../../components/motion';
import { createDeleteUndo } from '../../lib/deleteUndo';
import { DRAFTS_NOT_SAVED, clearSessionDrafts, onDraftStorageFail } from '../../lib/drafts';
import { logQueue } from '../../lib/logQueue';
import { clearExtraSets } from '../../lib/extraSets';
import { hints } from '../../lib/hints';
import { extendRest, loadRest, saveRest, shortenRest, startRest, type Rest } from '../../lib/rest';
import { formatElapsed } from '../../lib/timer';
import { formatTotal, totalLifted } from '../../lib/load';
import { DayList } from './DayList';
import { EditSetSheet } from './EditSetSheet';
import { ExerciseMenu, type MenuAction } from './ExerciseMenu';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseView } from './ExerciseView';
import { LoadTypeSheet } from './LoadTypeSheet';
import { RestDock } from './RestDock';
import { ChevronLeft } from './icons';
import { useWorkout } from './useWorkout';
import { LOAD_TYPE_CHOICES } from './exerciseLoad';
import styles from './Workout.module.css';

let toastSeq = 0;
const toastOf = (text: string, action?: ToastMessage['action']): ToastMessage => ({ id: ++toastSeq, text, action });

/** iOS push (SPEC 13.2, 23.1): the new screen slides in from the right, the old one moves 30% left and dims. */
/** dir 0: no movement (the picker sheet already covers the change). */
const PUSH: Variants = {
  enter: (dir: number) => (dir === 0 ? { x: 0, opacity: 1 } : { x: dir > 0 ? '100%' : '-30%', opacity: dir > 0 ? 1 : 0.6 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => (dir === 0 ? { opacity: 0, transition: { duration: 0 } } : { x: dir > 0 ? '-30%' : '100%', opacity: dir > 0 ? 0.6 : 1 }),
};
const CROSSFADE: Variants = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

type Chip = { id: number; text: string };

/**
 * The workout (SPEC 20, 21.1): the day list at #/workout/:id and one exercise at
 * #/workout/:id/:exerciseId (a reload lands on the same screen). The live header, the rest bar
 * and the sheets are shared, so the rest keeps counting while moving between them.
 */
export function WorkoutScreen() {
  const { sessionId = '', '*': sub = '' } = useParams();
  const exerciseId = sub ? decodeURIComponent(sub.split('/')[0]!) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  useWakeLock(true);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const w = useWorkout(sessionId, hidden);
  const [rest, setRestState] = useState<Rest | null>(() => loadRest(sessionId));
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const finishing = useRef(false);
  const routeRef = useRef(exerciseId);
  routeRef.current = exerciseId;

  const deletes = useMemo(() => createDeleteUndo<WorkoutSet>({ remove: (s) => deleteSet(s.id), restore: restoreSet }), []);

  useEffect(() => onDraftStorageFail(() => setToast(toastOf(DRAFTS_NOT_SAVED))), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // No first time hints while the rest timer counts (SPEC 13.5).
  useEffect(() => hints.setBlocked(rest !== null), [rest]);
  useEffect(() => () => hints.setBlocked(false), []);

  const setRest = useCallback(
    (r: Rest | null) => {
      setRestState(r);
      saveRest(r);
    },
    [],
  );
  const notice = (text: string, retry?: () => void) => setToast(toastOf(text, retry ? { label: 'Try again', onPress: retry } : undefined));

  // ---------------------------------------------------------------- navigation

  const navState = location.state as { fromList?: boolean; instant?: boolean } | null;
  const fromList = navState?.fromList === true;
  const prevView = useRef<string | null>(exerciseId);
  const order = w.entries.map((e) => e.exerciseId);
  const dir = (() => {
    const before = prevView.current;
    if (navState?.instant && before !== exerciseId) return 0;
    if (before === exerciseId) return 1;
    if (exerciseId === null) return -1;
    if (before === null) return 1;
    return order.indexOf(exerciseId) >= order.indexOf(before) ? 1 : -1;
  })();
  useEffect(() => {
    prevView.current = exerciseId;
  }, [exerciseId]);

  const openExercise = (id: string, instant = false) =>
    navigate(`/workout/${sessionId}/${encodeURIComponent(id)}`, { state: { fromList: true, ...(instant ? { instant: true } : {}) } });
  const switchExercise = (id: string) => navigate(`/workout/${sessionId}/${encodeURIComponent(id)}`, { replace: true, state: { fromList } });
  const goList = () => {
    if (fromList) navigate(-1);
    else navigate(`/workout/${sessionId}`, { replace: true });
  };

  const chipTimer = useRef<number | undefined>(undefined);
  /** "Nice. Next: Romanian deadlift" for a moment, then `then` if the user is still on that exercise. */
  const showChip = (text: string, ms: number, from: string, then: () => void) => {
    window.clearTimeout(chipTimer.current);
    const c = { id: ++toastSeq, text };
    setChip(c);
    chipTimer.current = window.setTimeout(() => {
      setChip((cur) => (cur?.id === c.id ? null : cur));
      if (routeRef.current === from) then();
    }, ms);
  };
  useEffect(() => () => window.clearTimeout(chipTimer.current), []);
  useEffect(() => {
    // Leaving the exercise by hand ends its chip.
    setChip(null);
    window.clearTimeout(chipTimer.current);
  }, [exerciseId]);

  // ---------------------------------------------------------------- after a set

  const onLogged = (id: string) => {
    const done = { ...w.done, [id]: (w.done[id] ?? 0) + 1 };
    const entries = w.entries;
    const r = restAfter(entries, done, id);
    const seconds = r === null ? w.restOf(id) : r === 0 ? 0 : (w.userRestOf(id) ?? r);
    setRest(seconds > 0 ? startRest(sessionId, Date.now(), seconds) : null);
    const e = entries.find((x) => x.exerciseId === id);
    if (!e) return;
    const next = nextCurrent(entries, done, id);
    const partner = entries.find((x) => x.exerciseId === next);
    if (next !== id && e.kind === 'pair' && partner?.block === e.block) {
      // A pair: straight on to the other exercise of the round (SPEC 13.1: back to back).
      showChip(`Next: ${w.nameOf(next)}`, 900, id, () => switchExercise(next));
    } else if ((done[id] ?? 0) >= e.sets) {
      const after = upNext(entries, done, id);
      showChip(after ? `Nice. Next: ${w.nameOf(after)}` : 'Nice. Every set is done', 1500, id, goList);
    }
  };

  const swipeNext = () => {
    if (!exerciseId) return;
    const i = order.indexOf(exerciseId);
    const later = w.entries.slice(i + 1).find((e) => (w.done[e.exerciseId] ?? 0) < e.sets) ?? w.entries[i + 1];
    if (later) switchExercise(later.exerciseId);
  };

  // ---------------------------------------------------------------- quick workout: the picker

  // An empty quick workout opens straight into the picker (SPEC 20.3), in the same frame as the
  // list, so there is never a moment where "+ Add exercise" shows and then goes inert.
  const autoPicked = useRef(false);
  const autoOpen = w.ready && !autoPicked.current && !exerciseId && w.isQuick && w.entries.length === 0;
  const closePicker = () => {
    autoPicked.current = true;
    setPicking(false);
  };

  // Just added: their view may open before the live session lists them.
  const justAdded = useRef(new Set<string>());
  const add = async (ids: string[]) => {
    closePicker();
    try {
      for (const id of ids) {
        await addExercise(sessionId, id);
        justAdded.current.add(id);
      }
      // One exercise: straight into it, ready to log (SPEC 20.4 tap count).
      if (ids.length === 1) openExercise(ids[0]!, true);
    } catch {
      notice('Could not add that. Try again.');
    }
  };

  // Exercises whose load type is not known yet ask once, when they open (PLAN 1.7), in the same
  // frame as the exercise view.
  const asked = useRef(new Set<string>());
  const needsType = w.ready && !!exerciseId && !w.loadTypeOf(exerciseId) && order.includes(exerciseId);
  const askingNow = asking ?? (needsType && exerciseId && !asked.current.has(exerciseId) ? exerciseId : null);
  const closeAsk = () => {
    if (askingNow) asked.current.add(askingNow);
    setAsking(null);
  };

  const answer = async (kind: Load['kind']) => {
    const id = askingNow;
    closeAsk();
    if (!id || !w.gym) return;
    try {
      await saveLoadType(id, w.gym.id, kind);
    } catch {
      notice('Could not save that. Try again.');
    }
  };

  // ---------------------------------------------------------------- edit, delete, undo

  const onSave = async (set: WorkoutSet, change: { reps?: number; seconds?: number; load: Load }) => {
    try {
      await updateSet(set.id, change);
      setEditing(null);
    } catch {
      notice('Could not save that. Try again.');
    }
  };

  const unhide = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });

  /** Undo, and Try again after a failed Undo: writes back that exact record (same id and order). */
  const restore = (set: WorkoutSet) => {
    if (finishing.current) return;
    setToast(null);
    deletes.undo(set.id).then(
      (item) => item && unhide(set.id),
      (err: unknown) =>
        setToast(
          err instanceof WorkoutFinishedError
            ? toastOf('That workout is already finished')
            : toastOf('Could not bring that set back', { label: 'Try again', onPress: () => restore(set) }),
        ),
    );
  };

  const onDelete = async (set: WorkoutSet): Promise<void> => {
    if (finishing.current) return;
    setEditing(null);
    setHidden((h) => new Set(h).add(set.id));
    setToast(toastOf('Set deleted', { label: 'Undo', onPress: () => restore(set) }));
    await deletes.remove(set).catch(() => {
      if (deletes.canUndo(set.id)) return; // an Undo already put it back
      unhide(set.id);
      setToast(toastOf('Could not delete that set', { label: 'Try again', onPress: () => void onDelete(set) }));
    });
  };

  // ---------------------------------------------------------------- the ⋯ menu

  const menuAction = async (id: string, a: MenuAction) => {
    setMenuFor(null);
    if (a === 'loadType') {
      setAsking(id);
      return;
    }
    const ids = w.session?.exerciseIds ?? [];
    try {
      if (a === 'remove') {
        const at = await removeExercise(sessionId, id);
        justAdded.current.delete(id);
        if (routeRef.current === id) goList();
        const name = w.nameOf(id);
        setToast(
          toastOf(`${name} removed`, {
            label: 'Undo',
            onPress: () => {
              setToast(null);
              restoreExercise(sessionId, id, at).catch(() => notice('Could not put it back'));
            },
          }),
        );
        return;
      }
      const next = moveInOrder(ids, id, a === 'up' ? -1 : 1, w.entryOf);
      if (next) await setExerciseOrder(sessionId, next);
    } catch {
      notice('Could not change that. Try again.');
    }
  };

  // ---------------------------------------------------------------- finish

  const finish = useTapGuard(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      // No new delete or Undo from here; every write still running lands before the sets are counted.
      await deletes.close();
      await logQueue.settle(sessionId);
      const result = await finishWorkout(sessionId);
      setRest(null);
      clearSessionDrafts(sessionId);
      logQueue.clearSession(sessionId);
      clearExtraSets();
      if (result.saved) navigate(`/workout/${sessionId}/done`, { replace: true });
      else navigate('/', { replace: true, state: { toast: 'Nothing logged · Workout discarded' } });
    } catch {
      finishing.current = false;
      deletes.reopen();
      notice('Could not finish. Try again.');
    }
  });

  const now = useNow(1000);

  if (w.sessionReady && (!w.session || w.session.endedAt !== undefined) && !finishing.current) {
    return <Navigate to="/" replace />;
  }
  // An exercise that is not in this workout (removed, or a stale link): the list.
  if (w.ready && exerciseId && !order.includes(exerciseId) && !justAdded.current.has(exerciseId)) {
    return <Navigate to={`/workout/${sessionId}`} replace />;
  }

  const startedAt = w.session?.startedAt;
  const unit = w.gym?.unit ?? 'lb';
  const lifted = totalLifted(w.sets, unit);
  const editList = editing ? w.setsOfExercise(editing.exerciseId) : [];
  const editIndex = editing ? editList.findIndex((s) => s.id === editing.id) : 0;
  const menuId = menuFor;
  const menuEntry = menuId ? w.entryOf(menuId) : undefined;
  const ids = w.session?.exerciseIds ?? [];
  const variants = reduce ? CROSSFADE : PUSH;

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        {exerciseId ? (
          <button type="button" className={`${styles.back} pressable`} onClick={goList} aria-label="Back to the list">
            <ChevronLeft />
          </button>
        ) : null}
        <div className={styles.stats}>
          <span className={`${styles.clock} num`} data-testid="elapsed" role="timer" aria-live="off">
            {startedAt ? formatElapsed((now - startedAt) / 1000) : '0:00'}
          </span>
          <span className={`${styles.statLine} num`} data-testid="live-stats">
            {w.sets.length} {w.sets.length === 1 ? 'set' : 'sets'}
            {lifted > 0 ? ` · Total lifted ${formatTotal(lifted, unit)}` : ''}
          </span>
        </div>
        <button type="button" className={`${styles.finish} pressable`} onClick={() => void finish()}>
          Finish
        </button>
      </header>

      <div className={styles.stage}>
        {!w.ready ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : (
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={exerciseId ?? 'list'}
              className={styles.view}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reduce ? FADE : SHEET_SPRING}
            >
              <Present>
                {exerciseId ? (
                  <ExerciseView
                    w={w}
                    sessionId={sessionId}
                    exerciseId={exerciseId}
                    onLogged={onLogged}
                    onEditSet={setEditing}
                    onAskLoadType={() => setAsking(exerciseId)}
                    onMenu={() => setMenuFor(exerciseId)}
                    onSwipeNext={swipeNext}
                    onBack={goList}
                    onNotice={notice}
                  />
                ) : (
                  <DayList w={w} onOpen={openExercise} onAdd={() => setPicking(true)} />
                )}
              </Present>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* The bottom of the frame: the rest bar floats over space every screen keeps free, so it
          never covers a heading or a row, and nothing moves when it comes or goes. */}
      <div className={styles.dockWrap}>
        <AnimatePresence>
          {chip && (
            <motion.p
              key={chip.id}
              className={styles.nextChip}
              role="status"
              data-testid="next-chip"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={reduce ? FADE : SHEET_SPRING}
            >
              {chip.text}
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {rest && (
            <RestDock
              key="rest"
              rest={rest}
              onExtend={() => setRest(extendRest(rest, Date.now()))}
              onShorten={() => setRest(shortenRest(rest, Date.now()))}
              onSkip={() => setRest(null)}
              onDone={() => setRest(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <Toast toast={toast} bottom={rest ? 'calc(var(--rest-height) + 8px)' : '8px'} />

      <ExercisePicker open={picking || autoOpen} onClose={closePicker} gym={w.gym} added={ids} onAdd={(list) => void add(list)} />
      <LoadTypeSheet open={askingNow !== null} onClose={closeAsk} exerciseName={askingNow ? w.nameOf(askingNow) : ''} onPick={(k) => void answer(k)} />
      {w.gym && (
        <EditSetSheet
          set={editing}
          index={Math.max(0, editIndex)}
          exerciseName={editing ? w.nameOf(editing.exerciseId) : ''}
          loadType={editing ? w.loadTypeOf(editing.exerciseId) : undefined}
          bar={editing ? w.barOf(editing.exerciseId) : undefined}
          gym={w.gym}
          onClose={() => setEditing(null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
      <ExerciseMenu
        open={menuId !== null}
        onClose={() => setMenuFor(null)}
        name={menuId ? w.nameOf(menuId) : ''}
        canUp={!!menuId && moveInOrder(ids, menuId, -1, w.entryOf) !== null}
        canDown={!!menuId && moveInOrder(ids, menuId, 1, w.entryOf) !== null}
        moveNote={menuEntry?.kind === 'pair' ? 'A pair moves together' : undefined}
        removeNote={menuId && (w.done[menuId] ?? 0) > 0 ? 'Delete its sets first' : undefined}
        rest={menuId ? w.restOf(menuId) : 90}
        note={(menuId && w.noteOf(menuId)) || ''}
        loadedWith={menuId ? LOAD_TYPE_CHOICES.find((c) => c.kind === w.loadTypeOf(menuId))?.label : undefined}
        onAction={(a) => menuId && void menuAction(menuId, a)}
        onRest={(s) => menuId && saveExerciseRest(menuId, s).catch(() => notice('Could not save that. Try again.'))}
        onNote={(n) => menuId && saveExerciseNote(menuId, n).catch(() => notice('Could not save that. Try again.'))}
      />
    </div>
  );
}

/** A screen sliding away is hidden from screen readers and takes no taps (one main at a time). */
function Present({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div className={styles.present} aria-hidden={present ? undefined : true} {...(present ? {} : { inert: '' })}>
      {children}
    </div>
  );
}
