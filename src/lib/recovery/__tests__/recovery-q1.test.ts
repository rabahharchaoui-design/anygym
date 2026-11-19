// PLAN Q1 (SPEC 20.3): every rule of the recovery logic, on a pinned local clock.
import { describe, expect, it } from 'vitest';
import { MUSCLES, type Muscle } from '../../order';
import {
  MAX_RECOMMENDED,
  RECOVERY_GROUPS,
  RECOVERY_HOURS,
  TRAINED_MIN_SETS,
  groupOf,
  groupsTrained,
  hasHistory,
  isRested,
  lastTrainedGroups,
  targetRecovery,
  trainedFact,
  type LoggedSet,
  type LoggedWorkout,
  type RecoveryTarget,
} from '..';

const H = 3_600_000;
/** Thursday 19 Nov 2026, 6 pm, the phone's local time. */
const NOW = new Date(2026, 10, 19, 18, 0).getTime();

const work = (primary: Muscle[], secondary: Muscle[] = []): LoggedSet => ({ kind: 'work', primary, secondary });
const sets = (n: number, s: LoggedSet): LoggedSet[] => Array.from({ length: n }, () => ({ ...s }));
const workout = (hoursAgo: number, ...s: LoggedSet[][]): LoggedWorkout => ({ at: NOW - hoursAgo * H, sets: s.flat() });
const chestDay = (hoursAgo: number) => workout(hoursAgo, sets(3, work(['chest'], ['triceps', 'front delts'])));
const shoulderDay = (hoursAgo: number) => workout(hoursAgo, sets(3, work(['side delts'])));

const TARGETS: RecoveryTarget[] = [
  { id: 'push', groups: ['chest', 'shoulders'] },
  { id: 'pull', groups: ['back'] },
  { id: 'legs', groups: ['legs'] },
  { id: 'chest', groups: ['chest'] },
  { id: 'back', groups: ['back'] },
  { id: 'abs', groups: ['abs'] },
];
const byId = (log: LoggedWorkout[]) => Object.fromEntries(targetRecovery(TARGETS, lastTrainedGroups(log, NOW), NOW).map((r) => [r.id, r]));

describe('groups and windows', () => {
  it('puts every muscle in exactly one of the six groups', () => {
    for (const m of MUSCLES) expect(RECOVERY_GROUPS).toContain(groupOf(m));
    expect(groupOf('quads')).toBe('legs');
    expect(groupOf('lower back')).toBe('back');
    expect(groupOf('rear delts')).toBe('shoulders');
    expect(groupOf('triceps')).toBe('arms');
  });
  it('is 48 h for legs, back and chest and 24 h for shoulders, arms and abs', () => {
    expect(RECOVERY_HOURS).toEqual({ legs: 48, back: 48, chest: 48, shoulders: 24, arms: 24, abs: 24 });
  });
});

describe('trained = at least 3 logged working sets with the group as PRIMARY muscle', () => {
  it('3 working sets train the group, 2 do not', () => {
    expect(TRAINED_MIN_SETS).toBe(3);
    expect(groupsTrained(workout(1, sets(3, work(['chest']))))).toEqual(['chest']);
    expect(groupsTrained(workout(1, sets(2, work(['chest']))))).toEqual([]);
  });
  it('counts sets of different exercises of the same group together', () => {
    expect(groupsTrained(workout(1, sets(2, work(['quads', 'glutes'])), sets(1, work(['hamstrings']))))).toEqual(['legs']);
  });
  it('counts a set once per group, even with two primary muscles of that group', () => {
    expect(groupsTrained(workout(1, sets(2, work(['quads', 'glutes']))))).toEqual([]);
  });
  it('warmups only never count', () => {
    const w = workout(1, sets(10, { kind: 'warmup', primary: ['chest'] }));
    expect(groupsTrained(w)).toEqual([]);
    expect(lastTrainedGroups([w], NOW)).toEqual({});
  });
  it('warmups never make up the count', () => {
    expect(groupsTrained(workout(1, sets(2, work(['chest'])), sets(1, { kind: 'warmup', primary: ['chest'] })))).toEqual([]);
  });
  it('secondary muscles only never count', () => {
    const w = workout(1, sets(6, work(['chest'], ['triceps', 'front delts'])));
    expect(groupsTrained(w)).toEqual(['chest']);
    const only = workout(1, sets(6, work([], ['chest', 'triceps'])));
    expect(lastTrainedGroups([only], NOW)).toEqual({});
  });
  it('drop sets and unsure sets are not working sets', () => {
    expect(groupsTrained(workout(1, sets(2, work(['back'])), sets(1, { kind: 'drop', primary: ['back'] })))).toEqual([]);
    expect(groupsTrained(workout(1, sets(2, work(['back'])), sets(1, { kind: 'work', primary: ['back'], uncertain: true })))).toEqual([]);
  });
  it('two workouts never add up: each needs its own 3 sets', () => {
    expect(lastTrainedGroups([workout(2, sets(2, work(['chest']))), workout(30, sets(2, work(['chest'])))], NOW)).toEqual({});
  });
  it('keeps the latest workout per group and ignores workouts dated in the future', () => {
    expect(lastTrainedGroups([chestDay(50), chestDay(5), chestDay(-3)], NOW)).toEqual({ chest: NOW - 5 * H });
  });
});

describe('recovery windows at 23, 25, 47 and 49 hours', () => {
  const at = (hours: number) => lastTrainedGroups([chestDay(hours), shoulderDay(hours)], NOW);
  it('23 h: shoulders and chest both inside', () => {
    expect(isRested('shoulders', at(23), NOW)).toBe(false);
    expect(isRested('chest', at(23), NOW)).toBe(false);
  });
  it('25 h: shoulders outside, chest inside', () => {
    expect(isRested('shoulders', at(25), NOW)).toBe(true);
    expect(isRested('chest', at(25), NOW)).toBe(false);
  });
  it('47 h: chest still inside', () => {
    expect(isRested('chest', at(47), NOW)).toBe(false);
  });
  it('49 h: chest outside', () => {
    expect(isRested('chest', at(49), NOW)).toBe(true);
  });
  it('exactly the window is outside it', () => {
    expect(isRested('shoulders', at(24), NOW)).toBe(true);
    expect(isRested('chest', at(48), NOW)).toBe(true);
  });
  it('a group never trained in the log is outside its window', () => {
    expect(isRested('legs', at(1), NOW)).toBe(true);
  });
});

describe('Recommended', () => {
  it('only when every primary group is outside its window', () => {
    // Chest 49 h ago, shoulders 23 h ago: Chest is fresh, Push is not.
    const r = byId([chestDay(49), shoulderDay(23)]);
    expect(r.push!.state).toBe('recent');
    expect(r.push!.recommended).toBe(false);
    expect(r.chest!.state).toBe('fresh');
  });
  it(`at most ${MAX_RECOMMENDED} tags, the longest rested first`, () => {
    const log = [chestDay(10), workout(60, sets(3, work(['back']))), workout(100, sets(3, work(['quads']))), workout(30, sets(3, work(['abs'])))];
    const r = targetRecovery(TARGETS, lastTrainedGroups(log, NOW), NOW);
    const tagged = r.filter((x) => x.recommended);
    expect(tagged).toHaveLength(2);
    // Legs (100 h) and back (60 h, Pull first in the given order), not abs (30 h).
    expect(tagged.map((x) => x.id)).toEqual(['pull', 'legs']);
    expect(r.find((x) => x.id === 'back')!.recommended).toBe(false);
    expect(r.find((x) => x.id === 'abs')!.state).toBe('fresh');
    expect(r.find((x) => x.id === 'abs')!.recommended).toBe(false);
  });
  it('groups never trained count as rested longest; ties keep the order given', () => {
    const r = targetRecovery(TARGETS, lastTrainedGroups([chestDay(3)], NOW), NOW);
    expect(r.filter((x) => x.recommended).map((x) => x.id)).toEqual(['pull', 'legs']);
  });
  it('no fresh target: no tag', () => {
    const all = targetRecovery([{ id: 'chest', groups: ['chest'] }], lastTrainedGroups([chestDay(3)], NOW), NOW);
    expect(all.some((x) => x.recommended)).toBe(false);
  });
});

describe('facts from the log', () => {
  it('recent targets show the real fact, dimmed but never blocked (state recent, no other flag)', () => {
    const r = byId([chestDay(3)]);
    expect(r.chest).toEqual({ id: 'chest', state: 'recent', recommended: false, fact: 'Trained today', restedMs: null });
    expect(r.push!.fact).toBe('Trained today');
  });
  it('"Trained yesterday" by the local calendar day, not 24 hours', () => {
    const lateLastNight = new Date(2026, 10, 18, 23, 30).getTime();
    const justAfterMidnight = new Date(2026, 10, 19, 0, 30).getTime();
    expect(trainedFact(lateLastNight, justAfterMidnight)).toBe('Trained yesterday');
    expect(trainedFact(new Date(2026, 10, 19, 0, 5).getTime(), new Date(2026, 10, 19, 23, 55).getTime())).toBe('Trained today');
    expect(byId([chestDay(25)]).chest!.fact).toBe('Trained yesterday');
  });
  it('a 48 h window can reach two days back: "Trained 2 days ago"', () => {
    expect(byId([chestDay(47)]).chest!.fact).toBe('Trained 2 days ago');
  });
  it('a target with two recent groups names the latest', () => {
    expect(byId([chestDay(40), shoulderDay(2)]).push!.fact).toBe('Trained today');
  });
  it('fresh targets carry no fact', () => {
    expect(byId([chestDay(3)]).legs!.fact).toBeNull();
  });
});

describe('no history: no claim at all', () => {
  const none = (log: LoggedWorkout[]) => {
    const r = targetRecovery(TARGETS, lastTrainedGroups(log, NOW), NOW);
    expect(r.map((x) => x.id)).toEqual(TARGETS.map((t) => t.id));
    for (const x of r) expect(x).toEqual({ id: x.id, state: 'unknown', recommended: false, fact: null, restedMs: null });
  };
  it('an empty log', () => {
    expect(hasHistory({})).toBe(false);
    none([]);
  });
  it('warmups only', () => none([workout(2, sets(8, { kind: 'warmup', primary: ['quads'] }))]));
  it('secondary only', () => none([workout(2, sets(8, work([], ['quads'])))]));
  it('a workout dated in the future', () => none([chestDay(-5)]));
});
