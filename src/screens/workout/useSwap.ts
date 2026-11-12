import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { WorkoutFinishedError } from '../../db/workouts';
import { SwapPendingError, SwapUndoStaleError, swapExercise, undoSwap } from '../../db/swaps';
import { logQueue } from '../../lib/logQueue';
import type { ToastMessage } from '../../ui/Toast';
import type { Workout } from './useWorkout';
import { toastOf } from './workoutToast';

type Deps = {
  w: Workout;
  sessionId: string;
  exerciseId: string | null;
  routeRef: MutableRefObject<string | null>;
  finishing: MutableRefObject<boolean>;
  justAdded: MutableRefObject<Set<string>>;
  switchExercise: (id: string) => void;
  setToast: Dispatch<SetStateAction<ToastMessage | null>>;
  notice: (text: string, retry?: () => void) => void;
};

/** Swapping one exercise for another (PLAN 3.4), with its Undo. */
export function useSwap({ w, sessionId, exerciseId, routeRef, finishing, justAdded, switchExercise, setToast, notice }: Deps) {
  const [swapFor, setSwapFor] = useState<string | null>(null);

  /** One tracked write Finish waits for (logQueue.mutate). The view on screen follows the exercise. */
  const swapBusy = useRef(false);
  // The screen is on this exercise and on its way off it: a navigation waits for a closing sheet's
  // step back (sheetHistory.whenSettled), so the list must not take over before it lands.
  const moving = useRef<string | null>(null);
  useEffect(() => {
    if (moving.current !== exerciseId) moving.current = null;
  }, [exerciseId]);
  const doSwap = async (from: string, to: string, always = false) => {
    setSwapFor(null);
    if (swapBusy.current || finishing.current) return;
    swapBusy.current = true;
    if (routeRef.current === from) moving.current = from;
    justAdded.current.add(to);
    try {
      const write = logQueue.mutate(sessionId, () => swapExercise(sessionId, from, to, { always }));
      if (!write) throw new WorkoutFinishedError();
      const receipt = await write;
      if (routeRef.current === from) switchExercise(to);
      justAdded.current.delete(from);
      const shown = toastOf(
        '',
        {
          label: 'Undo',
          onPress: () => {
            setToast((cur) => (cur?.id === shown.id ? null : cur));
            if (routeRef.current === to) moving.current = to;
            justAdded.current.add(from);
            const back = logQueue.mutate(sessionId, () => undoSwap(sessionId, receipt));
            if (!back) {
              moving.current = null;
              return notice('That workout is already finished');
            }
            back.then(
              () => {
                if (routeRef.current === to) switchExercise(from);
                justAdded.current.delete(to);
              },
              (err: unknown) => {
                moving.current = null;
                notice(err instanceof SwapUndoStaleError ? 'You logged a set on it, so it stays' : err instanceof WorkoutFinishedError ? 'That workout is already finished' : 'Could not put it back');
              },
            );
          },
        },
        w.nameOf(to),
        'Swapped ·',
      );
      setToast(shown);
    } catch (err) {
      moving.current = null;
      justAdded.current.delete(to);
      notice(err instanceof WorkoutFinishedError ? 'That workout is already finished' : err instanceof SwapPendingError ? 'A set is still saving. Try again in a moment.' : 'Could not swap that. Try again.');
    } finally {
      swapBusy.current = false;
    }
  };
  return { swapFor, setSwapFor, doSwap, moving };
}
