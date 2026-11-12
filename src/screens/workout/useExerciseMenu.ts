import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { WorkoutSet } from '../../db/types';
import { WorkoutFinishedError, removeExercise, restoreExercise, setExerciseOrder } from '../../db/workouts';
import { markDeleted } from '../../lib/extraSets';
import { moveInOrder } from '../../lib/planWorkout';
import { UNDO_MS } from '../../lib/undoQueue';
import type { DeleteUndo } from '../../lib/deleteUndo';
import type { ToastMessage } from '../../ui/Toast';
import type { MenuAction } from './ExerciseMenu';
import type { Workout } from './useWorkout';
import { toastOf } from './workoutToast';

type Deps = {
  w: Workout;
  sessionId: string;
  routeRef: MutableRefObject<string | null>;
  finishing: MutableRefObject<boolean>;
  deletes: DeleteUndo<WorkoutSet>;
  justAdded: MutableRefObject<Set<string>>;
  goList: () => void;
  setAsking: Dispatch<SetStateAction<string | null>>;
  setSwapFor: Dispatch<SetStateAction<string | null>>;
  setHidden: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setToast: Dispatch<SetStateAction<ToastMessage | null>>;
  notice: (text: string, retry?: () => void) => void;
};

/** The ⋯ menu's actions: move up or down, replace, change the load type, and remove (with its sets, with Undo). */
export function useExerciseMenu({ w, sessionId, routeRef, finishing, deletes, justAdded, goList, setAsking, setSwapFor, setHidden, setToast, notice }: Deps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const menuAction = async (id: string, a: MenuAction) => {
    setMenuFor(null);
    if (a === 'loadType') {
      setAsking(id);
      return;
    }
    if (a === 'swap') {
      setSwapFor(id);
      return;
    }
    const ids = w.session?.exerciseIds ?? [];
    try {
      if (a === 'remove') {
        const own = w.setsOfExercise(id);
        if (own.length) return void removeWithSets(id, own);
        const at = await removeExercise(sessionId, id);
        justAdded.current.delete(id);
        if (routeRef.current === id) goList();
        const name = w.nameOf(id);
        setToast(
          // The verb first, so a shortened name still reads: "Removed · Angled Machine Leg Pr…" (gate round 2 P4).
          toastOf(
            '',
            {
              label: 'Undo',
              onPress: () => {
                setToast(null);
                restoreExercise(sessionId, id, at).catch(() => notice('Could not put it back'));
              },
            },
            name,
            'Removed ·',
          ),
        );
        return;
      }
      const next = moveInOrder(ids, id, a === 'up' ? -1 : 1, w.entryOf);
      if (next) await setExerciseOrder(sessionId, next);
    } catch {
      notice('Could not change that. Try again.');
    }
  };

  /**
   * PLAN 2.2d P2 (SPEC 13.1: Undo, never a refusal): an exercise with logged sets is removed with
   * them. Each set goes through the workout's transactional delete (its tombstone and token, so an
   * Undo survives a kill), then the exercise leaves the list; Undo puts the exercise back at its
   * place and every set back exactly (same ids and order). Anything failing midway is put back.
   * PLAN 2.0k: one undoable operation. The sets' Undo windows are held while they are deleted and
   * start together, a little longer than the toast, only when its Undo shows; Undo is offered only
   * while every set can still come back, and all of them are accepted before any is written back.
   */
  const removeWithSets = async (id: string, own: WorkoutSet[]) => {
    if (finishing.current) return;
    const ids = own.map((x) => x.id);
    const unhideAll = () =>
      setHidden((h) => {
        const next = new Set(h);
        for (const x of ids) next.delete(x);
        return next;
      });
    for (const x of own) markDeleted(sessionId, x.id, null);
    setHidden((h) => new Set([...h, ...ids]));
    let gone: WorkoutSet[] = [];
    try {
      // One admitted operation (PLAN 3.2b): Finish waits for it, and a failure rolls every set back.
      let at = -1;
      gone = await deletes.removeAll(own, async () => {
        at = await removeExercise(sessionId, id);
      });
      justAdded.current.delete(id);
      if (routeRef.current === id) goList();
      const n = gone.length;
      const goneIds = gone.map((x) => x.id);
      const shown = toastOf(`· ${n} ${n === 1 ? 'set' : 'sets'}`, {
        label: 'Undo',
        onPress: () => {
          setToast((cur) => (cur?.id === shown.id ? null : cur));
          // Never a partial Undo: only while every set can still come back exactly.
          if (!deletes.canUndoAll(goneIds)) return notice('Too late to undo');
          // One tracked operation from this tap (PLAN 2.0l): the exercise coming back, every set's
          // acceptance and write back. Finish waits for all of it, or refuses with the sets still
          // recoverable, never in between.
          deletes
            .undoAll(goneIds, () => restoreExercise(sessionId, id, at))
            .then((back) => {
              if (!back) throw new Error('Not put back');
              unhideAll();
            })
            .catch(() => notice('Could not put it back'));
        },
      }, w.nameOf(id), 'Removed ·');
      setToast(shown);
      // One shared window from the moment Undo is offered, outlasting the toast (5 s).
      deletes.release(goneIds, UNDO_MS + 1000);
    } catch (err) {
      await deletes.undoAll(gone.map((x) => x.id)).catch(() => undefined);
      deletes.release(gone.map((x) => x.id));
      unhideAll();
      notice(err instanceof WorkoutFinishedError ? 'That workout is already finished' : 'Could not remove that. Try again.');
    }
  };
  return { menuFor, setMenuFor, menuAction };
}
