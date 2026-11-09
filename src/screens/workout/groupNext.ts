// 3.5d (10): the next member of a Quick pair or circuit, once this exercise's set of the round is done.
// Pure: the exercise view hides its row lights with it and the bottom action bar shows its button.
import type { WorkoutEntry } from '../../lib/planWorkout';

export function groupNextOf(entries: readonly WorkoutEntry[], done: Readonly<Record<string, number>>, exerciseId: string): WorkoutEntry | undefined {
  const entry = entries.find((e) => e.exerciseId === exerciseId);
  if (!entry || !entry.roundRest || entry.kind !== 'pair') return undefined;
  const mine = done[exerciseId] ?? 0;
  return entries.find((x) => x !== entry && x.kind === 'pair' && x.block === entry.block && (done[x.exerciseId] ?? 0) < mine && (done[x.exerciseId] ?? 0) < x.sets);
}
