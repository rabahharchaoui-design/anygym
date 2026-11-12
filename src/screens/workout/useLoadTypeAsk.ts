import { useRef, useState } from 'react';
import type { Load } from '../../db/types';
import { saveLoadType } from '../../db/exerciseSettings';
import type { Workout } from './useWorkout';

/** The one time question "How is it loaded?", asked when an exercise opens (and again from its menu). */
export function useLoadTypeAsk(w: Workout, exerciseId: string | null, order: string[], notice: (text: string) => void) {
  const [asking, setAsking] = useState<string | null>(null);
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
  return { setAsking, askingNow, closeAsk, answer };
}
