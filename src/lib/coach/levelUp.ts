// The weekly Level up (SPEC 15): after each training week, which lifts earned more weight (every
// working set at the top of its range, every workout that week, no missed reps) and which hold
// steady, and why, in one plain line each. It never raises a lift that missed reps, never one done
// since (its Next already moved on), and every new weight comes from load.ts, loadable here.
import { weightChange } from '../load';
import { liftClass, weighted } from './classify';
import { nextWeight } from './increment';
import { learnedScale } from './outcome';
import { allTop, changeWords, lastPicked, missedCount, sameWeight } from './sets';
import { weeklyRate } from './strength';
import { lastWeek } from './time';
import type { ChangeRecord, Hold, Lift, LiftSession, PlannedChange } from './types';

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Both workouts at the top of the range at the same weight. */
const sameTop = (a: LiftSession, b: LiftSession): boolean => {
  const pa = lastPicked(a);
  const pb = lastPicked(b);
  return !!a.range && !!b.range && !!pa && !!pb && pa.unit === pb.unit && Math.abs(weightChange(pa.value, pb.value)) < 0.01 && allTop(b.sets, b.range) && sameWeight(b.sets);
};

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
  if (!sameWeight(latest.sets) || !allTop(latest.sets, range)) return hold(`aim for ${range[1]} reps on every set first`);
  if (latest.effort === 'hard') return hold('it felt hard, so one more week at this weight');
  const easy = latest.effort === 'easy';
  const to = nextWeight(lift.loadKind, at.value, { cls, rate: weeklyRate(lift.sessions, setup.unit, now), sessions: lift.sessions.length, scale: learnedScale(lift, changes), easy }, setup);
  if (to === null) return hold('no heavier weight here yet. Add a rep to each set instead');
  const before = lift.sessions.find((s) => s.date < week.start);
  const twice = !!before && before.date >= week.start - 7 * 24 * 60 * 60 * 1000 && sameTop(latest, before);
  const top = `${latest.sets.length} × ${range[1]}`;
  const reason = `${changeWords(lift.loadKind, weightChange(at.value, to), setup.unit)}: you hit ${top}${twice ? ' two weeks in a row' : ' last week'}${easy ? ', with reps to spare' : ''}`;
  return {
    raise: { ...base, loadKind: lift.loadKind, unit: setup.unit, from: at.value, to, reason, source: 'level_up', reps: 'low' },
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

/** "You hit all your reps on 5 lifts last week. Add weight?" */
export function levelUpTitle(n: number): string {
  return `You hit all your reps on ${plural(n, 'lift', 'lifts')} last week. Add weight?`;
}

/** "Leveled up 3 lifts for this week" */
export function leveledUpTitle(n: number): string {
  return `Leveled up ${plural(n, 'lift', 'lifts')} for this week`;
}
