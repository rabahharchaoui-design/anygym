import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Load, WorkoutSet } from '../../db/types';
import { WorkoutFinishedError, SetHasPendingChangesError } from '../../db/workouts';
import { saveMutation } from '../../db/mutations';
import { markDeleted } from '../../lib/extraSets';
import { logQueue } from '../../lib/logQueue';
import { countsToward } from '../../lib/planWorkout';
import type { ToastMessage } from '../../ui/Toast';
import type { DeleteUndo } from '../../lib/deleteUndo';
import type { SaveResult } from './EditSetSheet';
import type { Workout } from './useWorkout';
import { toastOf } from './workoutToast';

type Deps = {
  w: Workout;
  sessionId: string;
  finishing: MutableRefObject<boolean>;
  deletes: DeleteUndo<WorkoutSet>;
  setHidden: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setToast: Dispatch<SetStateAction<ToastMessage | null>>;
  notice: (text: string, retry?: () => void) => void;
};

/** Editing, deleting and undoing a delete of one logged set. */
export function useSetEdits({ w, sessionId, finishing, deletes, setHidden, setToast, notice }: Deps) {
  const [editing, setEditing] = useState<WorkoutSet | null>(null);

  // Finish started: no edit is saved any more, and a save already running is one Finish waits for
  // (logQueue.mutate), so the finished workout's sets and total never change afterwards (PLAN 1.7k).
  // A failed save keeps the sheet open with its values and says so inside it (PLAN 2.0e): the toast
  // behind a sheet is inert, so it could not be heard or tapped there.
  const onSave = async (set: WorkoutSet, change: { reps?: number; seconds?: number; load: Load }): Promise<SaveResult> => {
    if (finishing.current || logQueue.closed(sessionId)) {
      setEditing(null);
      return 'closed';
    }
    // Journaled with its values before the write (PLAN 2.0c): a failure survives a restart and blocks Finish.
    const write = logQueue.mutate(sessionId, () => saveMutation(sessionId, set.exerciseId, { kind: 'edit', setId: set.id, change }));
    if (!write) {
      setEditing(null);
      return 'closed';
    }
    try {
      await write;
      setEditing(null);
      return 'saved';
    } catch (err) {
      if (err instanceof WorkoutFinishedError) {
        setEditing(null);
        notice('That workout is already finished');
        return 'closed';
      }
      if (logQueue.closed(sessionId)) {
        setEditing(null);
        return 'closed';
      }
      return 'failed';
    }
  };
  const openEdit = (set: WorkoutSet) => {
    if (finishing.current || logQueue.closed(sessionId)) return;
    setEditing(set);
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

  const onDelete = async (set: WorkoutSet, removeRow = false): Promise<void> => {
    if (finishing.current) return;
    setEditing(null);
    // PLAN 2.2d round 2: whether its row goes with it is stored with this delete (durably), and holds
    // only while the set is deleted: every Undo path (here, recovery after a restart, Finish's retry)
    // brings the row back with the set. A warm up on a normal lift never used a planned row (1.7j).
    markDeleted(sessionId, set.id, removeRow && countsToward(w.entryOf(set.exerciseId), set.kind) ? set.exerciseId : null);
    setHidden((h) => new Set(h).add(set.id));
    const shown = toastOf('Set deleted', { label: 'Undo', onPress: () => restore(set) });
    setToast(shown);
    await deletes
      .remove(set)
      // Another tab had already deleted it (PLAN 2.0i): nothing here to undo, so no Undo is offered.
      .then(() => {
        if (!deletes.canUndo(set.id)) setToast((cur) => (cur?.id === shown.id ? null : cur));
      })
      .catch((err: unknown) => {
        if (deletes.canUndo(set.id)) return; // an Undo already put it back
        unhide(set.id);
        // Finished meanwhile (another tab, PLAN 2.0e): nothing was deleted, and there is nothing to retry.
        if (err instanceof WorkoutFinishedError) return notice('That workout is already finished');
        // A change to this set has not saved yet (PLAN 2.0f): deleting now would lose it on Undo.
        if (err instanceof SetHasPendingChangesError) return notice('A change to that set is not saved yet. Try again after it saves.');
        setToast(
          toastOf('Could not delete that set', {
            label: 'Try again',
            onPress: () => void onDelete(set, removeRow),
          }),
        );
      });
  };
  return { editing, setEditing, onSave, openEdit, unhide, onDelete };
}
