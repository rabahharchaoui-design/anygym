// The weekly Level up (SPEC 15): after each training week, which lifts earned more weight (every
// working set at the top of its range, every workout that week at one scheme and weight, no missed
// reps) and which hold steady, and why, in one plain line each. It never raises a lift that missed reps, never one done
// since (its Next already moved on), and every new weight comes from load.ts, loadable here.
import { comparableWeight, formatWeight, heaviestHeld, sameResistance, weightChange } from '../load';
import { liftClass, weighted } from './classify';
import { nextTarget } from './increment';
import { learnedScale } from './outcome';
import { allTop, changeWords, lastPicked, missedCount, sameWeight, toWeight } from './sets';
import { weeklyRate } from './strength';
import { lastWeek, weekStartFrom } from './time';
import type { Load } from '../../db/types';
import type { ChangeRecord, Hold, Lift, LiftSession, PlannedChange } from './types';
import { plural } from '../words';

export type LevelUpDecision = {
  /** The training week it is about (its Monday). */
  weekKey: string;
  cardId: string;
  earned: PlannedChange[];
  holding: Hold[];
};

/** The lift has an accepted lighter week or welcome back target still running. */
export function lighterActive(lift: Pick<Lift, 'target'>, now: number): boolean {
  const t = lift.target;
  return !!t && (t.source === 'deload' || t.source === 'welcome_back') && t.until !== undefined && now < t.until;
}

export const levelUpCardId = (weekKey: string): string => `levelup:${weekKey}`;


/** What every workout of a week logged: the set count, the top of the range, one whole weight. */
type Scheme = { sets: number; top: number; load: Load };

/**
 * PLAN R4 (1): the week's scheme, only when every workout that week agrees. 'short': a workout not at
 * the top of its range on every set, or not at one weight; null: no range known, or the workouts
 * logged different set counts, ranges or whole weights (no "you hit N × R" can speak for them all).
 */
function weekScheme(sessions: readonly LiftSession[]): Scheme | 'short' | null {
  const first = sessions[0];
  if (!first || !sessions.every((s) => s.range)) return null;
  if (sessions.some((s) => !sameWeight(s.sets) || !allTop(s.sets, s.range!))) return 'short';
  const load = first.sets[0]!.load;
  const top = first.range![1];
  const agree = sessions.every((s) => s.sets.length === first.sets.length && s.range![1] === top && sameResistance(s.sets[0]!.load, load));
  return agree ? { sets: first.sets.length, top, load } : null;
}

/** PLAN R4 (5): two weeks' schemes are one: the same set count, top of range and whole weight. */
const sameScheme = (a: Scheme, b: Scheme): boolean => a.sets === b.sets && a.top === b.top && sameResistance(a.load, b.load);

/** Every workout marked Easy. */
const allEasy = (sessions: readonly LiftSession[]): boolean => sessions.length > 0 && sessions.every((s) => s.effort === 'easy');

/** One lift's verdict for the week, or null when the week says nothing about it. */
export function liftVerdict(lift: Lift, changes: readonly ChangeRecord[], now: number, week = lastWeek(now)): { raise: PlannedChange } | { hold: Hold } | null {
  const setup = lift.setup;
  const cls = liftClass(lift.pattern);
  if (!setup || !cls || !weighted(lift.loadKind)) return null;
  // Codex 3.8 #1: a lift in an accepted lighter week (or welcome back) is never raised over it.
  if (lighterActive(lift, now)) return null;
  const inWeek = lift.sessions.filter((s) => s.date >= week.start && s.date < week.end);
  const latest = inWeek[0];
  if (!latest || !latest.range) return null;
  // Done again since that week: its Next already moved on from what that week showed.
  if (lift.sessions.some((s) => s.date >= week.end)) return null;
  const at = lastPicked(latest);
  if (!at || at.unit !== setup.unit) return null;
  const base = { key: lift.key, exerciseId: lift.exerciseId, name: lift.name };
  const hold = (why: string) => ({ hold: { ...base, reason: `Holding steady: ${why}` } });
  const missed = inWeek.reduce((n, s) => n + missedCount(s.sets, s.range), 0);
  const range = latest.range;
  if (missed > 0) return hold(`${plural(missed, 'set', 'sets')} fell short of ${range[0]} reps`);
  const scheme = weekScheme(inWeek);
  if (scheme === 'short') return hold(`aim for ${range[1]} reps on every set first`);
  if (!scheme) return null;
  if (latest.effort === 'hard') return hold('it felt hard, so one more week at this weight');
  const easy = latest.effort === 'easy';
  // PLAN 3.6h2: a stack's add-on stays on top of the raised pin (the card shows the whole total).
  const pick = nextTarget(lift.loadKind, at.value, { cls, rate: weeklyRate(lift.sessions, setup.unit, now), sessions: lift.sessions.length, scale: learnedScale(lift, changes), easy }, setup, at.load.added ?? 0);
  if (pick === null) {
    // PLAN 3.5j: at the heaviest dumbbell (or held weight) this gym has, say so by name: the lift is not silently missing.
    const top = lift.loadKind === 'dumbbell_each' || lift.loadKind === 'single' ? heaviestHeld(lift.loadKind, setup) : null;
    if (top !== null) return hold(`${lift.loadKind === 'dumbbell_each' ? 'Heaviest dumbbell' : 'Heaviest weight'} here is ${formatWeight(top, setup.unit)}: add reps`);
    return hold('no heavier weight here yet. Add a rep to each set instead');
  }
  // PLAN R4 (5): "two weeks in a row" only when every workout of the week before logged this same
  // scheme at the same whole weight; "with reps to spare" only with Easy on every workout it speaks for.
  const weekBefore = lift.sessions.filter((s) => s.date >= week.start - 7 * 24 * 60 * 60 * 1000 && s.date < week.start);
  const prior = weekScheme(weekBefore);
  const twice = !!prior && prior !== 'short' && sameScheme(scheme, prior);
  const spare = allEasy(inWeek) && (!twice || allEasy(weekBefore));
  const top = `${scheme.sets} × ${scheme.top}`;
  const fromTotal = comparableWeight(at.load, at.unit);
  const reason = `${changeWords(lift.loadKind, weightChange(fromTotal, toWeight({ to: pick.value, toAdded: pick.added })), setup.unit)}: you hit ${top}${twice ? ' two weeks in a row' : ' last week'}${spare ? ', with reps to spare' : ''}`;
  return {
    raise: { ...base, loadKind: lift.loadKind, unit: setup.unit, from: at.value, fromTotal, to: pick.value, ...(pick.added ? { toAdded: pick.added } : {}), reason, source: 'level_up', reps: 'low' },
  };
}

/** Last week's Level up: the lifts that earned it and the ones holding steady. null when no lift was trained. */
export function weeklyLevelUp(lifts: readonly Lift[], changes: readonly ChangeRecord[], now: number): LevelUpDecision | null {
  const week = lastWeek(now);
  const earned: PlannedChange[] = [];
  const holding: Hold[] = [];
  for (const lift of lifts) {
    const v = liftVerdict(lift, changes, now, week);
    if (!v) continue;
    if ('raise' in v) earned.push(v.raise);
    else holding.push(v.hold);
  }
  if (!earned.length && !holding.length) return null;
  return { weekKey: week.key, cardId: levelUpCardId(week.key), earned, holding };
}

/** The exercise's Next line after Not now on the Level up card (PLAN 3.5g). */
export const HOLD_REASON = 'Same as last time, you chose not to add weight';

/**
 * PLAN 3.5g: Not now on the Level up card is a decision too. Each lift that earned a raise keeps last
 * week's weight for this whole week (to the next Monday), aiming for the top of its range again, so the
 * card is the only place a raise happens. Stored like any change (db/coach.ts), Undo takes it back.
 * PLAN 3.6h2: a stack's add-on stays too. The raise kept last week's add-on on top of its pin
 * (levelUpTarget), so its `toAdded` is that add-on, and the hold is last week's pin plus it.
 */
export function holdChanges(decision: Pick<LevelUpDecision, 'earned'>, now: number): PlannedChange[] {
  const until = weekStartFrom(now, 1);
  return decision.earned.map((c) => ({ key: c.key, exerciseId: c.exerciseId, name: c.name, loadKind: c.loadKind, unit: c.unit, from: c.from, ...(c.fromTotal !== undefined ? { fromTotal: c.fromTotal } : {}), to: c.from, ...(c.toAdded ? { toAdded: c.toAdded } : {}), reason: HOLD_REASON, source: 'hold' as const, until, reps: 'high' as const }));
}

/** "You hit all your reps on 5 lifts last week. Add weight?" */
export function levelUpTitle(n: number): string {
  return `You hit all your reps on ${plural(n, 'lift', 'lifts')} last week. Add weight?`;
}

/** "Leveled up 3 lifts for this week" */
export function leveledUpTitle(n: number): string {
  return `Leveled up ${plural(n, 'lift', 'lifts')} for this week`;
}
