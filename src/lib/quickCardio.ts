// The cardio slot of a Quick workout card (PLAN 3.5j, G's hotel gym: "a cardio warm up or finisher
// on the treadmill, elliptical or stairs"). Pure. It holds only sure moves: the cardio moves G
// approved on this phone (QuickDeps.cardio, src/data/candidateGate.ts approvedCardio) on a machine
// this gym has. With none approved it returns nothing and every card is exactly what it was.
import { machineOf, rankCardio, type CardioMove } from './cardio';
import { WARM_UP_SEC } from './generator';
import type { QuickDeps, QuickInput, QuickItem } from './quick';
import type { StyleId } from './quickStyles';
import { supports } from './swap';
import type { EquipmentId } from '../db/types';

/** Which cards get cardio: a warm up first, and Cardio and core also ends on cardio (its name says so). */
const SLOTS: Partial<Record<StyleId, 'warmUp' | 'both'>> = { circuit: 'warmUp', pump: 'warmUp', easy: 'warmUp', cardioCore: 'both' };
/** The order cards take the machines in, so the cards on screen use different ones when the gym has them. */
const TURN: readonly StyleId[] = ['circuit', 'pump', 'easy', 'cardioCore'];
/** Below this, the minutes go to the lifts (Cardio and core still gets its cardio). */
export const CARDIO_MIN_MINUTES = 30;
/** What one cardio item costs on the one estimate: its 5 minutes and one exercise change. */
export const CARDIO_ITEM_MINUTES = WARM_UP_SEC / 60 + 1;

/** The sure cardio moves of this gym for this person, best first (none for "no cardio"). */
export function gymCardio(input: Pick<QuickInput, 'base'>, deps: Pick<QuickDeps, 'cardio' | 'usable'>): CardioMove[] {
  if (input.base.cardio === 'none') return [];
  return rankCardio(deps.cardio?.() ?? []).filter((m) => supports(m.requires, input.base.gym) && deps.usable(m.id));
}

/** The cardio a style card holds at these minutes: [] (none), [warm up], or [warm up, finisher]. */
export function cardioSlots(style: StyleId, minutes: number, input: Pick<QuickInput, 'base'>, deps: Pick<QuickDeps, 'cardio' | 'usable'>): CardioMove[] {
  const slot = SLOTS[style];
  const moves = gymCardio(input, deps);
  if (!slot || !moves.length || (slot === 'warmUp' && minutes < CARDIO_MIN_MINUTES)) return [];
  const turn = Math.max(0, TURN.indexOf(style));
  const warm = moves[turn % moves.length]!;
  if (slot === 'warmUp') return [warm];
  return [warm, moves[(turn + 1) % moves.length]!];
}

/** One cardio item: 5 minutes at an easy pace, no rest after it. */
export function cardioItem(move: CardioMove, deps: Pick<QuickDeps, 'name'>): QuickItem {
  return { id: move.id, slot: move.id, origin: move.id, name: deps.name(move.id), pattern: null, sets: 1, seconds: WARM_UP_SEC, restSec: 0, why: '' };
}

/** The machines the cardio uses (for the card's gear line). */
export const cardioGear = (moves: readonly CardioMove[]): EquipmentId[] => [...new Set(moves.map(machineOf).filter((m): m is EquipmentId => m !== undefined))];
