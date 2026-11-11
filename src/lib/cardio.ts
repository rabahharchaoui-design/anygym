// Sure cardio moves (PLAN 3.5j, G's hotel gym: "a cardio warm up or finisher on the treadmill,
// elliptical or stairs"). Pure: no JSON, no Dexie. Today every cardio move is a candidate waiting for
// G's approval (data/catalog-candidates.json); only the ones he approved on this phone are passed in
// (src/data/candidateGate.ts approvedCardio), so with none approved every function here gives nothing.
import type { EquipmentId } from '../db/types';
import type { CardioId } from './intake/options';
import type { GymKit } from './picker';
import { supports, type Requires } from './swap';

/** A sure cardio move: its id (an approved candidate) and the machine it needs. */
export type CardioMove = { id: string; requires: Requires };

/** The machines a warm up or finisher can be on, in the order they are offered. */
export const CARDIO_MACHINES: readonly EquipmentId[] = ['treadmill', 'elliptical', 'stair_climber', 'bike', 'rower'];

/** A move's machine (the first cardio machine it needs), or undefined for one that needs none. */
export const machineOf = (m: CardioMove): EquipmentId | undefined => CARDIO_MACHINES.find((id) => m.requires.some((g) => g.includes(id)));

/** Machine moves only, in CARDIO_MACHINES order, then by id: the same order every time. */
export function rankCardio(moves: readonly CardioMove[]): CardioMove[] {
  const rank = (m: CardioMove) => {
    const id = machineOf(m);
    return id === undefined ? -1 : CARDIO_MACHINES.indexOf(id);
  };
  return moves.filter((m) => rank(m) >= 0).sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The cardio move for this gym and this person, or undefined: a sure machine move the gym has, never
 * with "no cardio" answered.
 */
export function cardioFor(moves: readonly CardioMove[], gym: GymKit, answer?: CardioId): CardioMove | undefined {
  if (answer === 'none') return undefined;
  return rankCardio(moves).find((m) => supports(m.requires, gym));
}
