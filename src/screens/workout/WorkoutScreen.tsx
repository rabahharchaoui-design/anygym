import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from 'motion/react';
import type { Load, SetKind, WorkoutSet } from '../../db/types';
import { WorkoutFinishedError, addExercise, finishWorkout, removeExercise, restoreExercise, setExerciseOrder, updateSet } from '../../db/workouts';
import { saveExerciseNote, saveExerciseRest, saveLoadType } from '../../db/exerciseSettings';
import { getPlanState } from '../../db/planState';
import { countsToward, moveInOrder, nextCurrent, restAfter, upNext } from '../../lib/planWorkout';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { FADE, SHEET_SPRING } from '../../ui/motion';
import { BackButton } from '../../ui/BackButton';
import { IconButton } from '../../ui/IconButton';
import { ChevronDown } from '../../ui/icons';
import { EdgeSwipe } from '../../ui/EdgeSwipe';
import { Odometer } from '../../ui/Odometer';
import { Skeleton } from '../../ui/Skeleton';
import { Sheet } from '../../ui/Sheet';
import { LoadError } from '../../components/LoadError';
import { supportsViewTransitions, useNav } from '../../ui/nav';
import { UndoUnresolvedError } from '../../lib/deleteUndo';
import { deletesFor, disposeDeletes, recoverSession } from './sessionRecovery';
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
import { useWorkout } from './useWorkout';
import { discardFailed, prepareFinish, retryFailed } from './rowLog';
import { LOAD_TYPE_CHOICES } from './exerciseLoad';
import styles from './Workout.module.css';

/**
 * Push and pop without the View Transitions API (older iOS, SPEC 13.2 and 23.1): the same iOS
 * motion with Motion. dir 1 push: the new view slides in from the right over the old one, which
 * moves 30% left and dims. dir -1 pop: the reverse, the leaving view on top. dir 0: no movement
 * (the edge swipe or a sheet already covered the change).
 */
const FALLBACK_PUSH: Variants = {
  enter: (dir: number) => (dir === 0 ? { x: 0, opacity: 1 } : dir > 0 ? { x: '100%', opacity: 1, zIndex: 2 } : { x: '-30%', opacity: 0.6, zIndex: 1 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => (dir === 0 ? { opacity: 0, transition: { duration: 0 } } : dir > 0 ? { x: '-30%', opacity: 0.6, zIndex: 1 } : { x: '100%', opacity: 1, zIndex: 2 }),
};
const FALLBACK_FADE: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Which way the last go() moved, as nav.ts records it when it has to fall back. */
const fallbackDir = (): number => {
  const k = document.documentElement.dataset.navFallback;
  return k === 'push' ? 1 : k === 'pop' ? -1 : 0;
};

/** A view on its way out is hidden from screen readers and takes no taps. */
function Present({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div className={styles.present} aria-hidden={present ? undefined : true} {...(present ? {} : { inert: '' })}>
      {children}
    </div>
  );
}

let toastSeq = 0;
const toastOf = (text: string, action?: ToastMessage['action']): ToastMessage => ({ id: ++toastSeq, text, action });

/** How long "Nice. Next" stays before the list comes back (SPEC 20.2). */
const CHIP_MS = 2500;

/** `open`: the chip is a button that opens this exercise. */
type Chip = { id: number; text: string; open?: string };

/**
 * The workout (SPEC 20, 21.1): the day list at #/workout/:id and one exercise at
 * #/workout/:id/:exerciseId (a reload lands on the same screen). The live header, the rest bar
 * and the sheets are shared, so the rest keeps counting while moving between them.
 */
export function WorkoutScreen() {
  const { sessionId = '', '*': sub = '' } = useParams();
  const exerciseId = sub ? decodeURIComponent(sub.split('/')[0]!) : null;
  const go = useNav();
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

  // Owned by the workout, not this screen (PLAN 1.7j): minimize and resume keep an unresolved Undo.
  const deletes = useMemo(() => deletesFor(sessionId), [sessionId]);
  // Opening the workout (also after an app kill): an accepted Undo that never landed is retried,
  // and deletes whose Undo window is over are cleared (PLAN 1.7h), never one still unresolved.
  useEffect(() => {
    recoverSession(sessionId).catch(() => undefined);
  }, [sessionId]);
  /** Sets whose Log set write failed, when Finish was refused because of them (PLAN 1.7h). */
  const [unsaved, setUnsaved] = useState<number | null>(null);
  /** Deleted sets whose Undo failed, when Finish was refused because of them (PLAN 1.7i). */
  const [undoStuck, setUndoStuck] = useState<string[] | null>(null);

  useEffect(() => onDraftStorageFail(() => setToast(toastOf(DRAFTS_NOT_SAVED))), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // No first time hints while the rest timer counts (SPEC 13.5).
  useEffect(() => hints.setBlocked(rest !== null), [rest]);
  useEffect(() => () => hints.setBlocked(false), []);

  const setRest = useCallback((r: Rest | null) => {
    setRestState(r);
    saveRest(r);
  }, []);
  const notice = (text: string, retry?: () => void) => setToast(toastOf(text, retry ? { label: 'Try again', onPress: retry } : undefined));

  // ---------------------------------------------------------------- navigation

  // Screen changes are iOS push and pop view transitions (src/ui/nav.ts): the header and the rest
  // bar have their own names so they stay put, and the tapped row's tile grows into the hero.
  const navState = location.state as {
    fromList?: boolean;
    instant?: boolean;
    expand?: boolean;
  } | null;
  const fromList = navState?.fromList === true;
  const order = w.entries.map((e) => e.exerciseId);
  // The exercise the list was last left from: its tile is the one the hero shrinks back into.
  const [lastViewed, setLastViewed] = useState<string | null>(exerciseId);
  useEffect(() => {
    if (exerciseId) setLastViewed(exerciseId);
  }, [exerciseId]);
  // Arriving from Today's Start: the day card expands into this screen (named for that one transition).
  const [expanding, setExpanding] = useState(navState?.expand === true);
  useEffect(() => {
    if (!expanding) return;
    const t = window.setTimeout(() => setExpanding(false), 600);
    return () => window.clearTimeout(t);
  }, [expanding]);

  const openExercise = (id: string, instant = false) =>
    go(`/workout/${sessionId}/${encodeURIComponent(id)}`, {
      kind: instant ? 'none' : 'push',
      state: { fromList: true, ...(instant ? { instant: true } : {}) },
    });
  const switchExercise = (id: string) =>
    go(`/workout/${sessionId}/${encodeURIComponent(id)}`, {
      kind: 'push',
      replace: true,
      state: { fromList },
    });
  const goList = (kind: 'pop' | 'none' = 'pop') => {
    if (fromList) go(-1, { kind });
    else go(`/workout/${sessionId}`, { kind, replace: true });
  };
  const viewRef = useRef<HTMLDivElement | null>(null);
  // No View Transitions here: the views move with Motion instead (read once; it never changes).
  const [fallback] = useState(() => !supportsViewTransitions());
  const dir = fallback ? fallbackDir() : 0;

  const chipTimer = useRef<number | undefined>(undefined);
  /** "Nice. Next: Romanian deadlift" for a moment, then `then` if the user is still on that exercise. */
  const chipArm = useRef<((ms: number) => void) | null>(null);
  const showChip = (text: string, ms: number, from: string, then: () => void, open?: string) => {
    window.clearTimeout(chipTimer.current);
    const c: Chip = { id: ++toastSeq, text, ...(open ? { open } : {}) };
    setChip(c);
    const arm = (wait: number) => {
      window.clearTimeout(chipTimer.current);
      chipTimer.current = window.setTimeout(() => {
        setChip((cur) => (cur?.id === c.id ? null : cur));
        if (routeRef.current === from) then();
      }, wait);
    };
    chipArm.current = arm;
    arm(ms);
  };
  // A finger on the chip holds the automatic return; lifted without a tap, it carries on.
  const holdChip = () => window.clearTimeout(chipTimer.current);
  const releaseChip = () => chipArm.current?.(900);
  useEffect(() => () => window.clearTimeout(chipTimer.current), []);
  useEffect(() => {
    // Leaving the exercise by hand ends its chip.
    setChip(null);
    window.clearTimeout(chipTimer.current);
  }, [exerciseId]);

  // ---------------------------------------------------------------- after a set

  const onLogged = (id: string, kind: SetKind) => {
    const entries = w.entries;
    // A warm up on a normal lift uses up no planned set (PLAN 1.7j).
    const counts = countsToward(entries.find((x) => x.exerciseId === id), kind);
    const done = counts ? { ...w.done, [id]: (w.done[id] ?? 0) + 1 } : w.done;
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
      // The chip is a button straight into the next exercise; untouched, it returns to the list (SPEC 20.2).
      showChip(after ? `Nice. Next: ${w.nameOf(after)}` : 'Nice. Every set is done', CHIP_MS, id, () => goList(), after ?? undefined);
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
            : toastOf('Could not bring that set back', {
                label: 'Try again',
                onPress: () => restore(set),
              }),
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
      setToast(
        toastOf('Could not delete that set', {
          label: 'Try again',
          onPress: () => void onDelete(set),
        }),
      );
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

  const finishNow = async () => {
    if (finishing.current) return;
    // Nothing is counted while a required read failed or is still loading (PLAN 1.7h).
    if (!w.ready) {
      notice(w.error ? 'Could not load this workout. Try again.' : 'Still loading. Try again in a moment.');
      return;
    }
    finishing.current = true;
    // From this moment no new Log set starts (synchronous), so nothing lands after the count.
    logQueue.close(sessionId);
    const reopen = () => {
      finishing.current = false;
      logQueue.reopen(sessionId);
      deletes.reopen();
    };
    try {
      // No new delete or Undo from here; every write still running lands before the sets are counted.
      await deletes.close();
      // A set whose write failed is never dropped: Finish stops and asks (the drafts and the workout stay).
      const failed = await prepareFinish(sessionId);
      if (failed.length) {
        reopen();
        setUnsaved(failed.length);
        return;
      }
      // The plan pointer as it is now, so Undo on Today can put it back exactly.
      const planBefore = await getPlanState();
      const result = await finishWorkout(sessionId);
      disposeDeletes(sessionId);
      setRest(null);
      clearSessionDrafts(sessionId);
      clearExtraSets();
      if (result.saved) go(`/workout/${sessionId}/done`, { kind: 'fade', replace: true, state: { planBefore } });
      else
        go('/', {
          kind: 'pop',
          replace: true,
          state: { toast: 'Nothing logged · Workout discarded' },
        });
    } catch (err) {
      reopen();
      // An Undo the user asked for never landed: Finish waits until it does or they cancel it.
      if (err instanceof UndoUnresolvedError) setUndoStuck(err.ids);
      else notice('Could not finish. Try again.');
    }
  };
  const finish = useTapGuard(() => void finishNow());

  /** The Undo sheet: Try again puts the sets back (then finishes), or keep them deleted. */
  const retryUndos = async () => {
    const ids = undoStuck ?? [];
    setUndoStuck(null);
    const back = await Promise.all(
      ids.map((id) =>
        deletes.undo(id).then(
          (item) => {
            if (item) unhide(id);
            return true;
          },
          () => false,
        ),
      ),
    );
    if (back.every(Boolean)) await finishNow();
    else notice('Could not bring that set back. Try again.');
  };
  const keepDeleted = async () => {
    const ids = undoStuck ?? [];
    setUndoStuck(null);
    // Finish only once every cancellation is stored, else it would put those sets back (PLAN 1.7i).
    const done = await Promise.all(ids.map((id) => deletes.cancel(id).then(() => true, () => false)));
    if (done.every(Boolean)) await finishNow();
    else setToast(toastOf('Could not keep that set deleted', { label: 'Try again', onPress: () => void finishNow() }));
  };

  /** The unsaved sets sheet: Try again writes them (then finishes), or finish without them. */
  const unsavedBusy = useRef(false);
  const retryUnsaved = async () => {
    if (unsavedBusy.current) return;
    unsavedBusy.current = true;
    setUnsaved(null);
    try {
      if (await retryFailed(sessionId)) await finishNow();
      else notice('Could not save that set. Try again.');
    } finally {
      unsavedBusy.current = false;
    }
  };
  const finishWithout = async () => {
    if (unsavedBusy.current) return;
    unsavedBusy.current = true;
    setUnsaved(null);
    try {
      await discardFailed(sessionId);
      await finishNow();
    } catch {
      notice('Could not finish. Try again.');
    } finally {
      unsavedBusy.current = false;
    }
  };

  const now = useNow(1000);

  // Home only when a read that worked says the workout is gone, never after a failed read.
  if (w.sessionMissing && !finishing.current) {
    return <Navigate to="/" replace />;
  }
  // An exercise that is not in this workout (removed, or a stale link): the list.
  if (w.ready && exerciseId && !order.includes(exerciseId) && !justAdded.current.has(exerciseId)) {
    return <Navigate to={`/workout/${sessionId}`} replace />;
  }

  const startedAt = w.session?.startedAt;
  const unit = w.gym?.unit ?? 'lb';
  // Warm ups never count toward Total lifted (SPEC 21.1).
  const lifted = totalLifted(w.sets.filter((s) => s.kind !== 'warmup'), unit);
  const editList = editing ? w.setsOfExercise(editing.exerciseId) : [];
  const editIndex = editing ? editList.findIndex((s) => s.id === editing.id) : 0;
  const menuId = menuFor;
  const menuEntry = menuId ? w.entryOf(menuId) : undefined;
  const ids = w.session?.exerciseIds ?? [];

  const view = exerciseId ? (
    <ExerciseView
      w={w}
      sessionId={sessionId}
      exerciseId={exerciseId}
      onLogged={onLogged}
      onEditSet={setEditing}
      onAskLoadType={() => setAsking(exerciseId)}
      onMenu={() => setMenuFor(exerciseId)}
      onSwipeNext={swipeNext}
      onNotice={notice}
    />
  ) : (
    <DayList w={w} heroId={lastViewed} onOpen={openExercise} onAdd={() => setPicking(true)} />
  );

  return (
    <div className={styles.screen} data-resting={(rest && !w.error) || undefined}>
      <header className={styles.topBar}>
        {exerciseId ? (
          <BackButton onPress={() => goList()} label="Back to the list" />
        ) : (
          // Back to the tabs; the workout keeps going (the resume bar brings it back).
          <IconButton label="Minimize workout" onPress={() => go('/', { kind: 'down' })}>
            <ChevronDown strokeWidth={2.4} />
          </IconButton>
        )}
        <div className={styles.stats}>
          <span className={`${styles.clock} num`} data-testid="elapsed" role="timer" aria-live="off">
            {startedAt ? formatElapsed((now - startedAt) / 1000) : w.error ? '' : '0:00'}
          </span>
          <span className={`${styles.statLine} num`} data-testid="live-stats">
            {/* No count the app is not sure of while a read failed (PLAN 1.7h). */}
            {w.error ? null : (
              <>
                <Odometer value={w.sets.length} /> {w.sets.length === 1 ? 'set' : 'sets'}
                {lifted > 0 ? ` · Total lifted ${formatTotal(lifted, unit)}` : ''}
              </>
            )}
          </span>
        </div>
        <button type="button" className={`${styles.finish} pressable`} onClick={() => finish()}>
          Finish
        </button>
      </header>

      <div className={styles.stage} data-expand={expanding || undefined}>
        {w.error ? (
          <div className={styles.view}>
            <LoadError text="Could not load this workout" onRetry={w.retry} />
          </div>
        ) : !w.ready ? (
          <Skeleton height={220} className={styles.skeleton} />
        ) : (
          <>
            {fallback ? (
              <AnimatePresence initial={false} custom={dir}>
                <motion.div
                  key={exerciseId ?? 'list'}
                  ref={(el: HTMLDivElement | null) => {
                    // Only the arriving view: the leaving one must never take the edge swipe layer away.
                    if (el) viewRef.current = el;
                  }}
                  className={styles.view}
                  data-motion-view="true"
                  custom={dir}
                  variants={reduce ? FALLBACK_FADE : FALLBACK_PUSH}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={reduce ? FADE : SHEET_SPRING}
                >
                  <Present>{view}</Present>
                </motion.div>
              </AnimatePresence>
            ) : (
              <div key={exerciseId ?? 'list'} ref={viewRef} className={styles.view}>
                {view}
              </div>
            )}
            {exerciseId && (
              <EdgeSwipe
                key={`swipe-${exerciseId}`}
                layerRef={viewRef}
                onBack={() => goList('none')}
                under={() => (
                  <div className={styles.view}>
                    <DayList w={w} heroId={null} onOpen={() => undefined} onAdd={() => undefined} still />
                  </div>
                )}
              />
            )}
          </>
        )}
      </div>

      {/* The bottom of the frame: the rest bar floats over space every screen keeps free, so it
          never covers a heading or a row, and nothing moves when it comes or goes. */}
      <div className={styles.dockWrap}>
        <AnimatePresence>
          {chip && (
            <motion.div
              key={chip.id}
              className={styles.nextChipWrap}
              role="status"
              data-testid="next-chip"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={reduce ? FADE : SHEET_SPRING}
            >
              {chip.open ? (
                <button
                  type="button"
                  className={`${styles.nextChip} pressable`}
                  onPointerDown={holdChip}
                  onPointerCancel={releaseChip}
                  onPointerLeave={(e) => e.buttons && releaseChip()}
                  onClick={() => {
                    window.clearTimeout(chipTimer.current);
                    const next = chip.open!;
                    // It fades out first, so it never rides along with the view that slides in.
                    setChip(null);
                    window.setTimeout(() => switchExercise(next), 160);
                  }}
                >
                  {chip.text}
                </button>
              ) : (
                <span className={styles.nextChip}>{chip.text}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {rest && !w.error && (
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

      <Toast toast={toast} bottom={rest && !w.error ? 'calc(var(--rest-height) + 8px)' : '8px'} />

      <ExercisePicker open={picking || autoOpen} onClose={closePicker} gym={w.gym} added={ids} onAdd={(list) => void add(list)} />
      <LoadTypeSheet
        open={askingNow !== null}
        onClose={closeAsk}
        exerciseName={askingNow ? w.nameOf(askingNow) : ''}
        current={askingNow ? w.loadTypeOf(askingNow) : undefined}
        onPick={(k) => void answer(k)}
      />
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
      <Sheet open={unsaved !== null} onClose={() => setUnsaved(null)} label="Set not saved">
        <div className={styles.sheetBody} data-testid="unsaved-sheet">
          <h2 className={styles.sheetTitle}>{unsaved === 1 || unsaved === null ? '1 set did not save' : `${unsaved} sets did not save`}</h2>
          <p className={styles.sheetSub}>{unsaved === 1 || unsaved === null ? 'It is still on its row.' : 'They are still on their rows.'}</p>
          <button type="button" className={`${styles.logButton} pressable`} onClick={() => void retryUnsaved()}>
            Try again
          </button>
          <button type="button" className={`${styles.secondaryButton} pressable`} onClick={() => void finishWithout()}>
            {unsaved === 1 || unsaved === null ? 'Finish without it' : 'Finish without them'}
          </button>
        </div>
      </Sheet>
      <Sheet open={undoStuck !== null} onClose={() => setUndoStuck(null)} label="Undo did not finish">
        <div className={styles.sheetBody} data-testid="undo-stuck-sheet">
          <h2 className={styles.sheetTitle}>{(undoStuck?.length ?? 1) === 1 ? 'A deleted set did not come back' : `${undoStuck!.length} deleted sets did not come back`}</h2>
          <p className={styles.sheetSub}>You tapped Undo, but it did not save.</p>
          <button type="button" className={`${styles.logButton} pressable`} onClick={() => void retryUndos()}>
            Try again
          </button>
          <button type="button" className={`${styles.secondaryButton} pressable`} onClick={() => void keepDeleted()}>
            {(undoStuck?.length ?? 1) === 1 ? 'Keep it deleted' : 'Keep them deleted'}
          </button>
        </div>
      </Sheet>
      <ExerciseMenu
        open={menuId !== null}
        onClose={() => setMenuFor(null)}
        name={menuId ? w.nameOf(menuId) : ''}
        canUp={!!menuId && moveInOrder(ids, menuId, -1, w.entryOf) !== null}
        canDown={!!menuId && moveInOrder(ids, menuId, 1, w.entryOf) !== null}
        moveNote={menuEntry?.kind === 'pair' ? 'A pair moves together' : undefined}
        removeNote={menuId && w.setsOfExercise(menuId).length > 0 ? 'Delete its sets first' : undefined}
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
