import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { saveExerciseNote, saveExerciseRest, saveExerciseRestOff } from '../../db/exerciseSettings';
import { stopAlways } from '../../db/swaps';
import { moveInOrder } from '../../lib/planWorkout';
import { swapLine } from '../../lib/swap';
import { useNow } from '../../hooks/useNow';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Toast } from '../../ui/Toast';
import { useNav } from '../../ui/nav';
import { deletesFor, recoverSession } from './sessionRecovery';
import { DayList } from './DayList';
import { EditSetSheet } from './EditSetSheet';
import { ExerciseMenu } from './ExerciseMenu';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseView } from './ExerciseView';
import { LoadTypeSheet } from './LoadTypeSheet';
import { SwapSheet } from './SwapSheet';
import { TimeBudgetSheet } from './TimeBudgetSheet';
import { useTimeBudget } from './useTimeBudget';
import { WorkoutDock } from './WorkoutDock';
import { groupNextOf } from './groupNext';
import { useWorkout } from './useWorkout';
import { LOAD_TYPE_CHOICES } from './exerciseLoad';
import { UndoStuckSheet, UnsavedSheet } from './FinishSheets';
import { WorkoutHeader } from './WorkoutHeader';
import { WorkoutStage } from './WorkoutStage';
import { useAddExercise } from './useAddExercise';
import { useAfterSet } from './useAfterSet';
import { useExerciseMenu } from './useExerciseMenu';
import { useExerciseNav } from './useExerciseNav';
import { useFinish } from './useFinish';
import { useLoadTypeAsk } from './useLoadTypeAsk';
import { useNiceChip } from './useNiceChip';
import { useRest } from './useRest';
import { useSetEdits } from './useSetEdits';
import { useSwap } from './useSwap';
import { useWorkoutToast } from './useWorkoutToast';
import { toastOf } from './workoutToast';
import styles from './Workout.module.css';

/**
 * The workout (SPEC 20, 21.1): the day list at #/workout/:id and one exercise at
 * #/workout/:id/:exerciseId (a reload lands on the same screen). The live header, the rest bar
 * and the sheets are shared, so the rest keeps counting while moving between them.
 */
export function WorkoutScreen() {
  const { sessionId = '', '*': sub = '' } = useParams();
  const exerciseId = sub ? decodeURIComponent(sub.split('/')[0]!) : null;
  const go = useNav();
  const reduce = useReducedMotion();
  useWakeLock(true);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const w = useWorkout(sessionId, hidden);
  const { rest, setRest } = useRest(sessionId);
  const { toast, setToast, notice, undoable } = useWorkoutToast(exerciseId);
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

  // PLAN 3.6: "How much time today?" from the day list's estimate (SPEC 7.4).
  const time = useTimeBudget(w, sessionId, { onNotice: (text) => notice(text), onUndoable: undoable });

  const order = w.entries.map((e) => e.exerciseId);
  const { lastViewed, expanding, justDone, setJustDone, openExercise, switchExercise, goList, viewRef, fallback, dir } = useExerciseNav(go, sessionId, exerciseId);
  const { chip, setChip, chipTimer, showChip, holdChip, releaseChip } = useNiceChip(exerciseId, routeRef);
  const { onLogged, swipeNext } = useAfterSet({ w, sessionId, exerciseId, order, setRest, setJustDone, showChip, chipTimer, setChip, goList, switchExercise });
  const { picking, setPicking, autoOpen, closePicker, justAdded, add, addSuggestion } = useAddExercise({ w, sessionId, exerciseId, notice, openExercise });
  const { setAsking, askingNow, closeAsk, answer } = useLoadTypeAsk(w, exerciseId, order, notice);
  const { editing, setEditing, onSave, openEdit, unhide, onDelete } = useSetEdits({ w, sessionId, finishing, deletes, setHidden, setToast, notice });
  const { swapFor, setSwapFor, doSwap, moving } = useSwap({ w, sessionId, exerciseId, routeRef, finishing, justAdded, switchExercise, setToast, notice });
  const { menuFor: menuId, setMenuFor, menuAction } = useExerciseMenu({ w, sessionId, routeRef, finishing, deletes, justAdded, goList, setAsking, setSwapFor, setHidden, setToast, notice });
  const { finish, unsaved, setUnsaved, undoStuck, setUndoStuck, retryUndos, keepDeleted, retryUnsaved, finishWithout } = useFinish({ w, sessionId, go, finishing, deletes, setRest, setToast, notice, unhide });

  const now = useNow(1000);

  // Home only when a read that worked says the workout is gone, never after a failed read.
  if (w.sessionMissing && !finishing.current) {
    return <Navigate to="/" replace />;
  }
  // An exercise that is not in this workout (removed, or a stale link): the list.
  if (w.ready && exerciseId && !order.includes(exerciseId) && !justAdded.current.has(exerciseId) && moving.current !== exerciseId) {
    return <Navigate to={`/workout/${sessionId}`} replace />;
  }

  const editList = editing ? w.setsOfExercise(editing.exerciseId) : [];
  const editIndex = editing ? editList.findIndex((s) => s.id === editing.id) : 0;
  const menuEntry = menuId ? w.entryOf(menuId) : undefined;
  const ids = w.session?.exerciseIds ?? [];

  const pairNext = exerciseId && w.ready && order.includes(exerciseId) ? groupNextOf(w.entries, w.done, exerciseId) : undefined;
  const view = exerciseId ? (
    <ExerciseView
      w={w}
      sessionId={sessionId}
      exerciseId={exerciseId}
      onLogged={onLogged}
      onEditSet={openEdit}
      onAskLoadType={() => setAsking(exerciseId)}
      onMenu={() => setMenuFor(exerciseId)}
      onSwipeNext={swipeNext}
      onOpen={switchExercise}
      onNotice={notice}
      onRemoveSet={(set) => void onDelete(set, true)}
      onUndoable={undoable}
    />
  ) : (
    <DayList
      w={w}
      heroId={lastViewed}
      effortFor={justDone}
      onOpen={openExercise}
      onAdd={() => setPicking(true)}
      onAddOne={(id, rest) => void addSuggestion(id, rest)}
      sessionId={sessionId}
      onChangeSwap={setSwapFor}
      onToast={setToast}
      onTime={time.available ? time.open : undefined}
      timeLine={time.line}
      onRestoreSwap={(id) => {
        const slot = w.swapOf(id)?.slot;
        if (slot) void doSwap(id, slot);
      }}
    />
  );

  return (
    <div className={styles.screen} data-resting={(rest && !w.error) || undefined} data-pair={pairNext ? true : undefined}>
      <WorkoutHeader w={w} now={now} exerciseId={exerciseId} go={go} onBack={() => goList()} onFinish={() => finish()} />

      <WorkoutStage w={w} view={view} exerciseId={exerciseId} expanding={expanding} fallback={fallback} dir={dir} reduce={reduce} viewRef={viewRef} onBack={() => goList('none')} />

      {/* The bottom of the frame: the rest bar floats over space every screen keeps free, so it
          never covers a heading or a row, and nothing moves when it comes or goes. */}
      <WorkoutDock
        chip={chip}
        reduce={!!reduce}
        onChipHold={holdChip}
        onChipRelease={releaseChip}
        onChipOpen={(next) => {
          window.clearTimeout(chipTimer.current);
          // It fades out first, so it never rides along with the view that slides in.
          setChip(null);
          window.setTimeout(() => switchExercise(next), 160);
        }}
        pairNext={pairNext ? { exerciseId: pairNext.exerciseId, name: pairNext.name, circuit: (w.entryOf(exerciseId!)?.pairSize ?? 2) > 2 } : null}
        onPairNext={() => pairNext && switchExercise(pairNext.exerciseId)}
        rest={rest && !w.error ? rest : null}
        onRest={setRest}
      />

      {/* On the day list the toast stacks above the floating Start pill, never over it (round 3, P3;
          the pill rides var(--rest-height) + 2 × 8 px above the bottom and is 52 px tall). */}
      <Toast
        toast={toast}
        bottom={!exerciseId && !w.isQuick && !!w.nextId && !w.error ? 'calc(var(--rest-height) + 2 * var(--space-2) + 52px + 8px)' : (rest && !w.error) || pairNext ? `calc(var(--rest-height) * ${rest && !w.error && pairNext ? 2 : 1} + 8px)` : '8px'}
      />

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
      <UnsavedSheet unsaved={unsaved} onClose={() => setUnsaved(null)} onRetry={() => void retryUnsaved()} onFinishWithout={() => void finishWithout()} />
      <UndoStuckSheet sessionId={sessionId} undoStuck={undoStuck} onClose={() => setUndoStuck(null)} onRetry={() => void retryUndos()} onKeep={() => void keepDeleted()} />
      {time.sheet && <TimeBudgetSheet {...time.sheet} />}
      {w.ready && (
        <SwapSheet
          open={swapFor !== null}
          onClose={() => setSwapFor(null)}
          name={swapFor ? w.nameOf(swapFor) : ''}
          options={swapFor ? w.swapChoices(swapFor) : { choices: [], noPattern: false }}
          canAlways={!w.isQuick}
          onPick={(to, always) => swapFor && void doSwap(swapFor, to, always)}
          onStopAlways={(slot) => {
            setSwapFor(null);
            const planId = w.session?.planId;
            if (planId) stopAlways(slot, planId).then(() => setToast(toastOf('Back to the plan from next time')), () => notice('Could not save that. Try again.'));
          }}
        />
      )}
      <ExerciseMenu
        open={menuId !== null}
        onClose={() => setMenuFor(null)}
        name={menuId ? w.nameOf(menuId) : ''}
        canUp={!!menuId && moveInOrder(ids, menuId, -1, w.entryOf) !== null}
        canDown={!!menuId && moveInOrder(ids, menuId, 1, w.entryOf) !== null}
        moveNote={menuEntry?.kind === 'pair' ? 'A pair moves together' : undefined}
        replaceOff={!!menuId && !!menuEntry && (w.done[menuId] ?? 0) >= menuEntry.sets}
        replaceNote={menuId ? (swapLine(w.swapOf(menuId)) ?? undefined) : undefined}
        removeNote={menuId && w.setsOfExercise(menuId).length > 0 ? `With its ${w.setsOfExercise(menuId).length} ${w.setsOfExercise(menuId).length === 1 ? 'set' : 'sets'}, Undo puts them back` : undefined}
        rest={menuId ? w.restTimeOf(menuId) : 90}
        restOff={menuId ? w.restOffOf(menuId) : false}
        note={(menuId && w.noteOf(menuId)) || ''}
        loadedWith={menuId ? LOAD_TYPE_CHOICES.find((c) => c.kind === w.loadTypeOf(menuId))?.label : undefined}
        onAction={(a) => menuId && void menuAction(menuId, a)}
        onRest={(s) => menuId && saveExerciseRest(menuId, s).catch(() => notice('Could not save that. Try again.'))}
        onRestOff={(off) => menuId && saveExerciseRestOff(menuId, off).catch(() => notice('Could not save that. Try again.'))}
        onRestSaved={(text) => setToast(toastOf(text))}
        onNote={(n) => menuId && saveExerciseNote(menuId, n).catch(() => notice('Could not save that. Try again.'))}
      />
    </div>
  );
}
