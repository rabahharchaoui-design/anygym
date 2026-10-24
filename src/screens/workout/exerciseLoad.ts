// Which load input and equipment ids an exercise uses at a gym (PLAN 1.7). No weight math here.
import type { BarId, Gym, Load } from '../../db/types';

/** Smith exercises use the Smith bar (unknown until answered); every other bar exercise the olympic bar. */
export function barIdFor(exerciseName: string): BarId {
  return /\bsmith\b/i.test(exerciseName) ? 'smith' : 'olympic';
}

/** Machine id for per machine answers (stack step, starting weight): cables share the cable station. */
export function machineIdFor(exerciseId: string, exerciseName: string): string {
  return /\bcable\b/i.test(exerciseName) ? 'cable_station' : exerciseId;
}

/** A logged load can prefill the next set only if it is the same kind and unit as now. */
export function reusable(load: Load | undefined, kind: Load['kind'], gym: Pick<Gym, 'unit'>): Load | null {
  return load && load.kind === kind && load.unit === gym.unit ? load : null;
}

export const LOAD_TYPE_CHOICES: Array<{ kind: Load['kind']; label: string; hint: string }> = [
  { kind: 'barbell', label: 'Plates on a bar', hint: 'Barbell' },
  { kind: 'dumbbell_each', label: 'Dumbbells', hint: 'Each hand' },
  { kind: 'single', label: 'One weight', hint: 'Kettlebell, goblet' },
  { kind: 'stack', label: 'Stack with a pin', hint: 'Cable or machine' },
  { kind: 'plate_machine', label: 'Plates on a machine', hint: 'Leg press, hack squat' },
  { kind: 'bodyweight', label: 'Bodyweight', hint: 'Just you' },
  { kind: 'timed', label: 'Timed', hint: 'Hold or stretch' },
];
