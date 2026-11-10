// 3.5d (10): the next member of a pair or circuit, once this exercise's set of the round is done.
// Pure: the exercise view hides its row lights with it and the bottom action bar shows its button.
// PLAN 3.5g: plan pairs too (every group is back to back now), and once the round is done (the rest
// running) the bar leads back to the first member with sets left for the next round, as the old pair
// chip did, so the person never has to go back to the list between rounds.
import type { WorkoutEntry } from '../../lib/planWorkout';

export function groupNextOf(entries: readonly WorkoutEntry[], done: Readonly<Record<string, number>>, exerciseId: string): WorkoutEntry | undefined {
  const entry = entries.find((e) => e.exerciseId === exerciseId);
  if (!entry || !entry.roundRest || entry.kind !== 'pair') return undefined;
  const mine = done[exerciseId] ?? 0;
  const group = entries.filter((x) => x.kind === 'pair' && x.block === entry.block);
  const open = (x: WorkoutEntry) => (done[x.exerciseId] ?? 0) < x.sets;
  const behind = group.find((x) => x !== entry && (done[x.exerciseId] ?? 0) < mine && open(x));
  if (behind) return behind;
  // The round is done here: the first member with sets left starts the next one (never this one).
  if (mine === 0) return undefined;
  const first = group.find(open);
  return first && first !== entry && first.pairIndex < entry.pairIndex ? first : undefined;
}
