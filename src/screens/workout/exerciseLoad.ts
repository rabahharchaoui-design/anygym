// Which load input and equipment ids an exercise uses at a gym (PLAN 1.7). No weight math here:
// every Load is built by load.ts.
import { machineStartFor, stackStepFor } from '../../db/gyms';
import type { BarId, Gym, Load, Unit } from '../../db/types';
import {
  barbellLoad,
  bodyweightLoad,
  copyLoad,
  dumbbellLoad,
  enabledPlates,
  formatWeight,
  heldAvailable,
  heldChoices,
  heldWeightOf,
  plateMachineLoad,
  singleLoad,
  stackLoad,
  isStackPin,
  timedLoad,
  type LoadSetup,
} from '../../lib/load';
import { barForName, heldDumbbellName, heldPlateName } from '../../lib/loadTypeRule';
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
      // Dumbbells from the range; a held plate from the enabled plates (PLAN 1.7j); a kettlebell
      // typed exactly, never the dumbbell range (PLAN 1.7k).
      const w = heldWeightOf(load);
      if (w === null || !heldAvailable(kind, w, { unit: gym.unit, ...heldSetup(gym, kind, exerciseName) })) return null;
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
  pickUnit?: Unit,
): Load | null {
  // Picked in the other unit, or with a plate this gym has turned off: never rebuilt into a
  // different loggable weight (PLAN 1.7i). It waits for the user to pick again.
  if (pickProblem(picked, plates, pickUnit, kind, gym)) return null;
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

/** A weight picker's selection, with the unit it was picked in (PLAN 2.0c). */
export type WeightSelection = { load: Load | null; plates: readonly number[]; unit: Unit };

/**
 * What a weight picker may confirm (Done, or a swipe down that keeps a change), or null when it
 * may not (PLAN 2.0c). The selection must be in the gym's unit right now (picked in lb, the gym
 * switched to kg in another tab: never rebuilt as kg) with plates this gym has. Then it is either a
 * loadable weight rebuilt through load.ts, or plates on a bar or machine whose base weight is
 * genuinely not known here yet (an EZ, trap or Smith bar is answered first, never confirmed
 * unknown). A Smith bar answered "plates only" is a known base of 0, not unknown.
 */
export function confirmablePick(pick: WeightSelection, kind: Load['kind'], gym: Gym, exerciseId: string, exerciseName: string, bar?: BarId): { load: Load | null; plates: number[]; unit: Unit } | null {
  if (pick.unit !== gym.unit) return null;
  if (pickProblem(pick.load, pick.plates, pick.unit, kind, gym)) return null;
  const load = currentLoad(pick.load, pick.plates, kind, gym, exerciseId, exerciseName, bar, pick.unit);
  if (load) return { load, plates: [...pick.plates], unit: pick.unit };
  if (pick.plates.length === 0) return null;
  if (kind === 'barbell') {
    const id = barIdFor(exerciseName, bar);
    if (gym.bars[id] !== null || BAR_PROMPTS[id]) return null;
    return { load: null, plates: [...pick.plates], unit: pick.unit };
  }
  if (kind === 'plate_machine') {
    if (machineStartFor(gym, machineIdFor(exerciseId, exerciseName)) !== null) return null;
    return { load: null, plates: [...pick.plates], unit: pick.unit };
  }
  return null;
}

/** True when this exercise's one weight is a plate held in the hands (PLAN 1.7j). */
export function isHeldPlate(kind: Load['kind'], exerciseName: string): boolean {
  return kind === 'single' && heldPlateName(exerciseName);
}

/**
 * True when this exercise's one weight is typed exactly (PLAN 1.7k): a kettlebell, or an implement
 * the name does not tell. Gyms keep no kettlebell list, so it is never the dumbbell range.
 */
export function isExactHeld(kind: Load['kind'], exerciseName: string): boolean {
  return kind === 'single' && !heldPlateName(exerciseName) && !heldDumbbellName(exerciseName);
}

/** The dumbbell range, for a held plate the enabled plates, for a kettlebell exact entry (load.ts heldChoices). */
function heldSetup(gym: Gym, kind: Load['kind'], exerciseName: string): Pick<LoadSetup, 'dumbbellRange' | 'heldPlates' | 'heldExact'> {
  if (isHeldPlate(kind, exerciseName)) return { dumbbellRange: gym.dumbbellRange, heldPlates: enabledPlates(gym.plateInventory) };
  if (isExactHeld(kind, exerciseName)) return { dumbbellRange: gym.dumbbellRange, heldExact: true };
  return { dumbbellRange: gym.dumbbellRange };
}

/** The weights the one weight or dumbbell wheel offers for this exercise at this gym. */
export function wheelWeights(gym: Gym, kind: Load['kind'], exerciseName: string): number[] {
  return heldChoices(kind, heldSetup(gym, kind, exerciseName)) ?? [];
}

/** What this exercise can load at this gym, for the progression engine (SPEC 6). */
export function loadSetupFor(gym: Gym, kind: Load['kind'], exerciseId: string, exerciseName: string, bar?: BarId): Omit<LoadSetup, 'unit'> {
  const machine = machineIdFor(exerciseId, exerciseName);
  return {
    base: kind === 'barbell' ? gym.bars[barIdFor(exerciseName, bar)] : kind === 'plate_machine' ? machineStartFor(gym, machine) : null,
    plates: enabledPlates(gym.plateInventory),
    collars: kind === 'barbell' ? gym.collars : 'none',
    stackStep: stackStepFor(gym, machine),
    ...heldSetup(gym, kind, exerciseName),
  };
}

/**
 * LAST TIME copy (PLAN 1.7j, SPEC 21.1): the earlier set's total on today's equipment (load.ts
 * copyLoad), or why it cannot be copied, in one plain sentence for the toast.
 */
export function copyLastLoad(prev: Load, kind: Load['kind'], gym: Gym, exerciseId: string, exerciseName: string, bar?: BarId): { load: Load } | { load: null; why: string } {
  const barId = kind === 'barbell' ? barIdFor(exerciseName, bar) : undefined;
  const r = copyLoad(prev, kind, { unit: gym.unit, ...loadSetupFor(gym, kind, exerciseId, exerciseName, bar) }, barId);
  if (r.load) return r;
  const weight = prev.kind === 'bodyweight' ? `+${formatWeight(prev.added ?? 0, prev.unit)}` : formatWeight(prev.total, prev.unit);
  switch (r.why) {
    case 'unit':
      return { load: null, why: `Last time was in ${prev.unit}, so the weight was not copied. Reps copied.` };
    case 'kind':
      return { load: null, why: 'Last time was loaded another way, so the weight was not copied. Reps copied.' };
    case 'base':
      return { load: null, why: kind === 'barbell' ? 'Set the bar weight first to copy the weight. Reps copied.' : 'Set the starting weight first to copy the weight. Reps copied.' };
    case 'inexact':
      return { load: null, why: `${weight} cannot be made exactly with today's equipment. Reps copied.` };
  }
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
