// Which load input and equipment ids an exercise uses at a gym (PLAN 1.7). No weight math here:
// every Load is built by load.ts.
import { machineStartFor, stackStepFor } from '../../db/gyms';
import type { BarId, Gym, Load, Unit } from '../../db/types';
import {
  barbellLoad,
  bodyweightLoad,
  dumbbellLoad,
  dumbbellsInRange,
  enabledPlates,
  heldWeightOf,
  plateMachineLoad,
  singleLoad,
  stackLoad,
  isStackPin,
  timedLoad,
  type LoadSetup,
} from '../../lib/load';
import { barForName } from '../../lib/loadTypeRule';
import type { PromptKind } from '../../lib/equipmentPrompt';

/**
 * The bar a barbell exercise uses: the one picked for it at this gym (PLAN 1.10d), else EZ, trap,
 * Smith or olympic by the name rule in loadTypeRule.ts.
 */
export function barIdFor(exerciseName: string, chosen?: BarId): BarId {
  return chosen ?? barForName(exerciseName);
}

/** Plain names for the bar picker ("Bar: Olympic 45 lb · Change"). */
export const BAR_NAMES: Record<BarId, string> = {
  olympic: 'Olympic',
  womens: "Women's",
  ez_curl: 'EZ curl',
  trap: 'Trap',
  smith: 'Smith',
};

/** Bars this gym has a known weight for, in picker order (Olympic, women's, then answered EZ, trap, Smith). */
export function knownBars(gym: Pick<Gym, 'bars'>): BarId[] {
  return (Object.keys(BAR_NAMES) as BarId[]).filter((id) => gym.bars[id] !== null);
}

/** Bars whose weight varies by brand: asked once per gym through the first use prompt (SPEC 5.3). */
export const BAR_PROMPTS: Partial<Record<BarId, { machineId: string; kind: PromptKind; info: string }>> = {
  smith: { machineId: 'smith_machine', kind: 'smith', info: 'smith-machine' },
  ez_curl: { machineId: 'ez_curl_bar', kind: 'ez_curl', info: 'ez-curl-bar' },
  trap: { machineId: 'trap_bar', kind: 'trap', info: 'trap-bar' },
};

/** Machine id for per machine answers (stack step, starting weight): cables share the cable station. */
export function machineIdFor(exerciseId: string, exerciseName: string): string {
  return /\bcable\b/i.test(exerciseName) ? 'cable_station' : exerciseId;
}

/** A logged load can prefill the next set only if it is the same kind and unit as now. */
export function reusable(load: Load | undefined, kind: Load['kind'], gym: Pick<Gym, 'unit'>): Load | null {
  return load && load.kind === kind && load.unit === gym.unit ? load : null;
}

/**
 * The load to prefill from an earlier set (this workout or the last one), rebuilt on this gym's
 * equipment today (SPEC 13.5: logging a repeat is one tap). Returns null when the earlier load
 * cannot be set up here exactly (other unit, a plate this gym lacks, a dumbbell out of range, an
 * unknown bar): the card then starts from the honest empty state instead of a guess.
 */
export function prefillLoad(
  prev: Load | undefined,
  kind: Load['kind'],
  gym: Gym,
  exerciseId: string,
  exerciseName: string,
  bar?: BarId,
): Load | null {
  const load = reusable(prev, kind, gym);
  if (!load) return null;
  const platesOk = (perSide: readonly number[] | undefined): perSide is number[] => {
    if (!perSide) return false;
    const have = enabledPlates(gym.plateInventory);
    return perSide.every((w) => have.includes(w));
  };
  switch (kind) {
    case 'barbell':
      return platesOk(load.perSide) ? barbellLoad(gym.bars[barIdFor(exerciseName, bar)], load.perSide, gym.collars, gym.unit, barIdFor(exerciseName, bar)) : null;
    case 'plate_machine':
      return platesOk(load.perSide)
        ? plateMachineLoad(machineStartFor(gym, machineIdFor(exerciseId, exerciseName)), load.perSide, gym.unit)
        : null;
    case 'dumbbell_each':
    case 'single': {
      const w = heldWeightOf(load);
      if (w === null || !gym.dumbbellRange || !dumbbellsInRange(gym.dumbbellRange).includes(w)) return null;
      return kind === 'single' ? singleLoad(w, gym.unit) : dumbbellLoad(w, gym.unit);
    }
    case 'stack': {
      const step = stackStepFor(gym, machineIdFor(exerciseId, exerciseName));
      const pin = load.stackValue;
      if (pin === undefined || !isStackPin(pin, step)) return null;
      return stackLoad(pin, gym.unit, load.added ?? 0);
    }
    case 'bodyweight':
      return bodyweightLoad(gym.unit, load.added ?? 0);
    case 'timed':
      return timedLoad(gym.unit);
  }
}

/**
 * The load the active card shows and logs, rebuilt through load.ts from what was picked and the
 * gym's equipment right now (bar weight, starting resistance, stack step, dumbbell range). So when
 * any of those change, the diagram, the Log set label and the saved set agree. null = nothing
 * loadable is picked (a pin the new step lacks, an unknown bar weight).
 */
export function currentLoad(
  picked: Load | null,
  plates: readonly number[],
  kind: Load['kind'],
  gym: Gym,
  exerciseId: string,
  exerciseName: string,
  bar?: BarId,
): Load | null {
  // Picked in the other unit, or with a plate this gym has turned off: never rebuilt into a
  // different loggable weight (PLAN 1.7i). It waits for the user to pick again.
  if (pickProblem(picked, plates, undefined, kind, gym)) return null;
  switch (kind) {
    case 'barbell':
      return barbellLoad(gym.bars[barIdFor(exerciseName, bar)], plates, gym.collars, gym.unit, barIdFor(exerciseName, bar));
    case 'plate_machine':
      return plateMachineLoad(machineStartFor(gym, machineIdFor(exerciseId, exerciseName)), plates, gym.unit);
    case 'bodyweight':
      return bodyweightLoad(gym.unit, reusable(picked ?? undefined, kind, gym)?.added ?? 0);
    case 'timed':
      return timedLoad(gym.unit);
    default:
      return prefillLoad(picked ?? undefined, kind, gym, exerciseId, exerciseName, bar);
  }
}

/**
 * Why a pending pick cannot be used as it is at this gym now (PLAN 1.7i), or null when it can:
 * 'unit' when it was picked in the other unit (the gym's unit changed since: plates, a pin or an
 * added weight in lb are not kg), 'plate' when a plate on it is turned off in this gym. `pickUnit`
 * is the draft's own unit when its load is not known yet (plates on a bar of unknown weight).
 * Just you (bodyweight with nothing added) and holds are the same in any unit.
 */
export function pickProblem(picked: Load | null, plates: readonly number[], pickUnit: Unit | undefined, kind: Load['kind'], gym: Pick<Gym, 'unit' | 'plateInventory'>): 'unit' | 'plate' | null {
  if (kind === 'timed') return null;
  const unit = picked?.unit ?? pickUnit;
  if (kind === 'bodyweight') return picked?.kind === 'bodyweight' && (picked.added ?? 0) > 0 && unit !== gym.unit ? 'unit' : null;
  if (unit !== undefined && unit !== gym.unit && (picked !== null || plates.length > 0)) return 'unit';
  if ((kind === 'barbell' || kind === 'plate_machine') && plates.length > 0) {
    const have = enabledPlates(gym.plateInventory);
    if (!plates.every((w) => have.includes(w))) return 'plate';
  }
  return null;
}

/** What this exercise can load at this gym, for the progression engine (SPEC 6). */
export function loadSetupFor(gym: Gym, kind: Load['kind'], exerciseId: string, exerciseName: string, bar?: BarId): Omit<LoadSetup, 'unit'> {
  const machine = machineIdFor(exerciseId, exerciseName);
  return {
    base: kind === 'barbell' ? gym.bars[barIdFor(exerciseName, bar)] : kind === 'plate_machine' ? machineStartFor(gym, machine) : null,
    plates: enabledPlates(gym.plateInventory),
    collars: kind === 'barbell' ? gym.collars : 'none',
    dumbbellRange: gym.dumbbellRange,
    stackStep: stackStepFor(gym, machine),
  };
}

export const LOAD_TYPE_CHOICES: Array<{ kind: Load['kind']; label: string; hint: string }> = [
  { kind: 'barbell', label: 'Plates on a bar', hint: 'Barbell' },
  { kind: 'dumbbell_each', label: 'Dumbbells', hint: 'One in each hand' },
  { kind: 'single', label: 'One weight', hint: 'Kettlebell, goblet' },
  { kind: 'stack', label: 'Machine with a pin', hint: 'Cable or machine' },
  { kind: 'plate_machine', label: 'Plates on a machine', hint: 'Leg press, hack squat' },
  { kind: 'bodyweight', label: 'Bodyweight', hint: 'Just you' },
  { kind: 'timed', label: 'Timed', hint: 'Hold or stretch' },
];
