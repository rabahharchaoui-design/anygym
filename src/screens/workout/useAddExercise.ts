import { useRef, useState } from 'react';
import { WorkoutFinishedError, addExercise, addSuggested } from '../../db/workouts';
import { TAP_GUARD_MS } from '../../hooks/useTapGuard';
import type { Workout } from './useWorkout';

type Deps = {
  w: Workout;
  sessionId: string;
  exerciseId: string | null;
  notice: (text: string) => void;
  openExercise: (id: string, instant?: boolean) => void;
};

/** Adding exercises mid workout: the picker, Up next's one tap add, and the quick workout's auto open picker. */
export function useAddExercise({ w, sessionId, exerciseId, notice, openExercise }: Deps) {
  const [picking, setPicking] = useState(false);

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
    } catch (err) {
      notice(err instanceof WorkoutFinishedError ? 'That workout is already finished' : 'Could not add that. Try again.');
    }
  };

  // PLAN 3.4a: Up next adds one exercise with its suggested rest and opens it. One tap, one
  // navigation: a second tap while it is adding (or right after) does nothing (SPEC 13.3).
  const suggesting = useRef(false);
  const addSuggestion = async (id: string, restSec: number) => {
    if (suggesting.current) return;
    suggesting.current = true;
    try {
      await addSuggested(sessionId, id, restSec);
      justAdded.current.add(id);
      openExercise(id, true);
    } catch (err) {
      notice(err instanceof WorkoutFinishedError ? 'That workout is already finished' : 'Could not add that. Try again.');
    } finally {
      window.setTimeout(() => (suggesting.current = false), TAP_GUARD_MS);
    }
  };
  return { picking, setPicking, autoOpen, closePicker, justAdded, add, addSuggestion };
}
