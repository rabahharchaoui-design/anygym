import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { afterPaint } from '../../ui/afterPaint';
import type { SetKind } from '../../db/types';
import { extraSets } from '../../lib/extraSets';
import { advancesAfterLog, countsToward, nextCurrent, restAfter, upNext } from '../../lib/planWorkout';
import { saveRest, startRest, type Rest } from '../../lib/rest';
import type { Chip } from './WorkoutDock';
import type { Workout } from './useWorkout';

/** How long "Nice. Next" stays before the list comes back (SPEC 20.2). */
const CHIP_MS = 2500;

type Deps = {
  w: Workout;
  sessionId: string;
  exerciseId: string | null;
  order: string[];
  setRest: (r: Rest | null) => void;
  setJustDone: Dispatch<SetStateAction<string | null>>;
  showChip: (text: string, ms: number, from: string, then: () => void, open?: string) => void;
  chipTimer: MutableRefObject<number | undefined>;
  setChip: Dispatch<SetStateAction<Chip | null>>;
  goList: () => void;
  switchExercise: (id: string) => void;
};

/** What happens after a set is logged (the rest, the chip, the move on), and the swipe to the next exercise. */
export function useAfterSet({ w, sessionId, exerciseId, order, setRest, setJustDone, showChip, chipTimer, setChip, goList, switchExercise }: Deps) {
  const onLogged = (id: string, kind: SetKind) => {
    const entries = w.entries;
    // A warm up on a normal lift uses up no planned set (PLAN 1.7j).
    const counts = countsToward(entries.find((x) => x.exerciseId === id), kind);
    const done = counts ? { ...w.done, [id]: (w.done[id] ?? 0) + 1 } : w.done;
    const r = restAfter(entries, done, id);
    // 3.5d: a warm up row on a lift (the coach's, or one the person set) starts no rest timer, never the
    // lift's own 1:30. A plan's own warm up exercises keep theirs.
    const seconds = kind === 'warmup' && !counts ? 0 : r === null ? w.restOf(id) : r === 0 ? 0 : (w.userRestOf(id) ?? r);
    // Started now (the countdown is right) and saved now (an app kill right after the set keeps the
    // rest), shown once the check's frame has painted (critic B6).
    const started = seconds > 0 ? startRest(sessionId, Date.now(), seconds) : null;
    saveRest(started);
    afterPaint(() => setRest(started));
    const e = entries.find((x) => x.exerciseId === id);
    if (!e) return;
    // PLAN 2.0g: the screen stays on this exercise for its next set. Only the set that completes its
    // last working set moves on (never a warm up, a stretch, or an extra set after going back).
    if (advancesAfterLog(entries, w.done, id, kind, extraSets(sessionId, id))) {
      const after = upNext(entries, done, id);
      setJustDone(id);
      // The chip is a button straight into the next exercise; untouched, it returns to the list (SPEC 20.2).
      showChip(after ? `Nice. Next: ${w.nameOf(after)}` : 'Nice. Every set is done', CHIP_MS, id, () => goList(), after ?? undefined);
      return;
    }
    // Still here for another set: a "Nice. Next" chip from the last working set never pulls the
    // view away mid action (an extra set checked within its 2.5 s).
    window.clearTimeout(chipTimer.current);
    setChip(null);
    const next = nextCurrent(entries, done, id);
    const partner = entries.find((x) => x.exerciseId === next);
    // 3.5b round 4 (M7): a Quick group's next member is a button under the set table, not a pill over the rows.
    if (next !== id && e.kind === 'pair' && partner?.block === e.block && !e.roundRest) {
      // A pair: its partner is one tap away on the chip, never an automatic jump (PLAN 2.0g).
      showChip(`${e.pairSize > 2 ? 'Circuit' : 'Pair'}: ${w.nameOf(next)} next`, CHIP_MS, id, () => undefined, next);
    }
  };

  const swipeNext = () => {
    if (!exerciseId) return;
    const i = order.indexOf(exerciseId);
    const later = w.entries.slice(i + 1).find((e) => (w.done[e.exerciseId] ?? 0) < e.sets && !e.noFit) ?? w.entries[i + 1];
    if (later) switchExercise(later.exerciseId);
  };
  return { onLogged, swipeNext };
}
