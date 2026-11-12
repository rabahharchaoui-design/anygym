// The 10 minute finisher and the cardio warm up.
import type { EquipmentId } from '../../db/types';
import { cardioFor } from '../cardio';
import type { CardioFavoriteId, GoalId } from '../intake/options';
import type { PlanBlock } from '../plans';
import type { Requires } from '../swap';
import { FAMILY_OF, FINISHER_MINUTES, type GoalFamily } from '../generatorRules';
import type { Ctx, RawFinisher } from './types';

type CardioPick = { name: string; requires: Requires };

const MACHINE_CARDIO: Array<{ fav?: CardioFavoriteId; gear: EquipmentId; name: string; sprint: string }> = [
  { fav: 'treadmill', gear: 'treadmill', name: 'Treadmill', sprint: 'Treadmill intervals' },
  // PLAN 3.5j: no favourite names it (SPEC 14 step 9), so it comes after the ones that can be loved.
  { fav: 'bike', gear: 'bike', name: 'Bike', sprint: 'Bike sprints' },
  { fav: 'rower', gear: 'rower', name: 'Rower', sprint: 'Rower sprints' },
  { fav: 'stairs', gear: 'stair_climber', name: 'Stair climber', sprint: 'Stair climber intervals' },
  { fav: 'jump_rope', gear: 'jump_rope', name: 'Jump rope', sprint: 'Jump rope intervals' },
  { gear: 'elliptical', name: 'Elliptical', sprint: 'Elliptical intervals' },
];

/**
 * The 10 minute finisher (SPEC 7.3): fat loss a circuit or cardio, athletic a conditioning one, an
 * easy cardio block for a health or race Also goal. Only gear the gym has; the favorites first.
 */
export function finisherFor(ctx: Ctx): RawFinisher | undefined {
  const goals = [ctx.main, ctx.also].filter((g): g is GoalId => !!g);
  const wants = (fam: GoalFamily) => goals.some((g) => FAMILY_OF[g] === fam);
  const fat = wants('fat_loss');
  const athletic = wants('athletic');
  // Health and race as the Also goal add easy cardio; as Main they train like stay fit, no finisher.
  const easy = !!ctx.also && (ctx.also === 'health' || ctx.also === 'race') && FAMILY_OF[ctx.main] !== 'health';
  if (!fat && !athletic && !easy) return undefined;
  const noCardio = ctx.input.cardio === 'none';
  const gear = ctx.input.gym.equipment;
  const favs = ctx.input.cardioFavorites ?? [];
  const machines = MACHINE_CARDIO.filter((m) => gear.includes(m.gear));
  const machine = machines.find((m) => m.fav !== undefined && favs.includes(m.fav)) ?? machines[0];
  let pick: CardioPick;
  if (athletic && !fat) pick = machine && !noCardio ? { name: machine.sprint, requires: [[machine.gear]] } : { name: 'Bodyweight circuit', requires: [] };
  else if (fat) pick = machine && !noCardio ? { name: machine.name, requires: [[machine.gear]] } : { name: 'Bodyweight circuit', requires: [] };
  else if (noCardio) return undefined;
  else if (machine) pick = { name: machine.name, requires: [[machine.gear]] };
  else pick = { name: favs.includes('running') ? 'Easy run' : 'Brisk walk', requires: [] };
  return { name: pick.name, minutes: FINISHER_MINUTES, requires: pick.requires };
}

/** PLAN 3.5j: a sure cardio warm up opens a day this long (5 min, one exercise change). */
export const WARM_UP_SEC = 300;
/** Shorter days keep their minutes for the lifts (a 30 min day still holds 5 moves). */
export const WARM_UP_MIN_MINUTES = 45;

/**
 * PLAN 3.5j: the day's cardio warm up, only from a sure move (approved on this phone) on a machine
 * this gym has, never with "no cardio" answered, never on a day that already ends with cardio.
 */
export function warmUpFor(ctx: Ctx, finisher: RawFinisher | undefined): string | undefined {
  if (finisher || ctx.input.cardio === 'none') return undefined;
  if (ctx.input.minutes !== undefined && ctx.input.minutes < WARM_UP_MIN_MINUTES) return undefined;
  return cardioFor(ctx.deps.cardio?.() ?? [], ctx.input.gym, ctx.input.cardio)?.id;
}

export const warmUpBlock = (id: string): PlanBlock => ({ kind: 'single', warmup: true, items: [{ exerciseId: id, name: id, seconds: [WARM_UP_SEC, WARM_UP_SEC] }], sets: 1, restSec: 0 });
