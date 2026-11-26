// PLAN M18a: the weekly count, the weekly streak, the comeback 14 day rule and early bird / night
// owl, on the phone's own clock. Time zones are switched with process.env.TZ (Node re-reads it).
import { afterEach, describe, expect, it } from 'vitest';
import { clockOf, isComeback, weekCount, weeklyGoal, weekStreak, workoutsInWeek, type WorkoutFact } from '..';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});
const zone = (tz: string) => {
  process.env.TZ = tz;
};

const MIN = 60_000;
let k = 0;
/** A finished workout started at a local time (month is 1 based) and lasting `minutes`. */
function at(y: number, m: number, d: number, h = 18, min = 0, minutes = 50, extra: Partial<WorkoutFact> = {}): WorkoutFact {
  const startedAt = new Date(y, m - 1, d, h, min).getTime();
  return { id: `w${++k}`, startedAt, endedAt: startedAt + minutes * MIN, imported: false, workSets: 12, liftedLb: 5000, ...extra };
}
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('weeklyGoal: the plan goal, or 3 if none', () => {
  it('the plan days per week, 3 when there is no plan or a value that is not a goal', () => {
    expect(weeklyGoal(4)).toBe(4);
    expect(weeklyGoal(1)).toBe(1);
    expect(weeklyGoal(7)).toBe(7);
    expect(weeklyGoal(undefined)).toBe(3);
    for (const bad of [0, -1, 8, 2.5, Number.NaN]) expect(weeklyGoal(bad)).toBe(3);
  });
});

describe('weekCount: Monday to Sunday on the phone clock', () => {
  it('counts the workouts started this week, against the goal', () => {
    zone('Europe/Paris');
    // Mon Nov 23 2026 is a Monday.
    const ws = [at(2026, 11, 22), at(2026, 11, 23, 7), at(2026, 11, 25), at(2026, 11, 29, 23, 30), at(2026, 11, 30, 0, 10)];
    expect(weekCount(ws, local(2026, 11, 26), 4)).toEqual({ count: 3, goal: 4, complete: false });
    expect(weekCount(ws, local(2026, 11, 26), 3)).toEqual({ count: 3, goal: 3, complete: true });
  });
  it('across midnight: a workout started Sunday 11:50 PM and saved Monday is Sunday’s week', () => {
    zone('America/New_York');
    const late = at(2026, 11, 29, 23, 50, 70);
    expect(workoutsInWeek([late], local(2026, 11, 29))).toBe(1);
    expect(workoutsInWeek([late], local(2026, 11, 30))).toBe(0);
  });
  it('never counts imported workouts, ones still going, or warm ups alone', () => {
    zone('Europe/Paris');
    const t = local(2026, 11, 25);
    const ws = [at(2026, 11, 24, 18, 0, 50, { imported: true }), at(2026, 11, 24, 18, 0, 50, { endedAt: undefined }), at(2026, 11, 24, 18, 0, 50, { workSets: 0 }), at(2026, 11, 24)];
    expect(workoutsInWeek(ws, t)).toBe(1);
  });
  it('a daylight saving week (23 h and 25 h days) is still one week', () => {
    zone('America/New_York');
    // 2026: DST starts Sun Mar 8, ends Sun Nov 1.
    const spring = [at(2026, 3, 2, 0, 0), at(2026, 3, 8, 3, 30), at(2026, 3, 8, 23, 59)];
    expect(workoutsInWeek(spring, local(2026, 3, 5))).toBe(3);
    expect(workoutsInWeek([at(2026, 3, 9, 0, 0)], local(2026, 3, 8))).toBe(0);
    const fall = [at(2026, 10, 26, 0, 0), at(2026, 11, 1, 1, 30), at(2026, 11, 1, 23, 59)];
    expect(workoutsInWeek(fall, local(2026, 10, 28))).toBe(3);
    expect(workoutsInWeek([at(2026, 11, 2, 0, 0)], local(2026, 11, 1))).toBe(0);
  });
});

describe('weekStreak: weeks in a row hitting the goal (SPEC 17: never a daily streak)', () => {
  // Three full weeks of 3 (Nov 2, 9, 16 2026 are Mondays), then this week.
  const weeks = () => [
    at(2026, 11, 2), at(2026, 11, 4), at(2026, 11, 6),
    at(2026, 11, 9), at(2026, 11, 11), at(2026, 11, 13),
    at(2026, 11, 16), at(2026, 11, 18), at(2026, 11, 20),
  ];
  it('rest days never break it; the week going on counts once it reaches the goal', () => {
    zone('Europe/Paris');
    const ws = weeks();
    expect(weekStreak(ws, local(2026, 11, 24), 3)).toBe(3); // this week: none yet, still alive
    ws.push(at(2026, 11, 23), at(2026, 11, 25));
    expect(weekStreak(ws, local(2026, 11, 25, 20), 3)).toBe(3);
    ws.push(at(2026, 11, 27));
    expect(weekStreak(ws, local(2026, 11, 27, 20), 3)).toBe(4);
  });
  it('a week under the goal ends it; no workouts, no streak', () => {
    zone('Europe/Paris');
    const ws = weeks().filter((_, i) => i !== 4); // the week of Nov 9 has only 2
    expect(weekStreak(ws, local(2026, 11, 24), 3)).toBe(1);
    expect(weekStreak(ws, local(2026, 11, 24), 2)).toBe(3);
    expect(weekStreak([], local(2026, 11, 24), 3)).toBe(0);
    expect(weekStreak(weeks(), local(2026, 12, 8), 3)).toBe(0); // last week missed entirely
  });
  it('across the daylight saving change (Nov 1 2026 in New York) the weeks hold', () => {
    zone('America/New_York');
    const ws = [at(2026, 10, 26), at(2026, 10, 28), at(2026, 11, 1, 1, 30), at(2026, 11, 2), at(2026, 11, 4), at(2026, 11, 6)];
    expect(weekStreak(ws, local(2026, 11, 7), 3)).toBe(2);
  });
  it('travel: mid week workouts give the same streak in Tokyo, Paris and Los Angeles', () => {
    zone('Europe/Paris');
    const ws = weeks();
    const now = local(2026, 11, 24);
    const paris = weekStreak(ws, now, 3);
    zone('Asia/Tokyo');
    expect(weekStreak(ws, now, 3)).toBe(paris); // east
    zone('America/Los_Angeles');
    expect(weekStreak(ws, now, 3)).toBe(paris); // west
  });
  it('travel west at a week edge: a Monday 1 AM workout in Paris is Sunday in New York (the phone’s clock now decides)', () => {
    zone('Europe/Paris');
    const monday = at(2026, 11, 23, 1, 0);
    expect(workoutsInWeek([monday], local(2026, 11, 23))).toBe(1);
    zone('America/New_York');
    expect(new Date(monday.startedAt).getDay()).toBe(0);
    expect(workoutsInWeek([monday], monday.startedAt)).toBe(1); // its own (local) week still counts it
    expect(workoutsInWeek([monday], new Date(2026, 10, 23, 12).getTime())).toBe(0); // the next NY week does not
  });
});

describe('isComeback: back after 14 or more days off', () => {
  it('14 whole days off is a comeback; 13 is not', () => {
    zone('Europe/Paris');
    const last = at(2026, 11, 1, 18);
    expect(isComeback(at(2026, 11, 16, 7), [last])).toBe(true); // Nov 2 to 15 off
    expect(isComeback(at(2026, 11, 15, 23), [last])).toBe(false); // Nov 2 to 14: 13 days
  });
  it('across the daylight saving change it is still counted in calendar days', () => {
    zone('America/New_York');
    const last = at(2026, 10, 25, 22);
    expect(isComeback(at(2026, 11, 9, 6), [last])).toBe(true);
    expect(isComeback(at(2026, 11, 8, 23, 59), [last])).toBe(false);
  });
  it('the first workout ever is not a comeback; imported history has no date and is not read', () => {
    zone('Europe/Paris');
    const now = at(2026, 11, 20);
    expect(isComeback(now, [now])).toBe(false);
    expect(isComeback(now, [now, { id: 'imp', startedAt: 5, imported: true, workSets: 5, liftedLb: 100 }])).toBe(false);
  });
  it('reads the latest earlier workout, never a later one or a warm up only one', () => {
    zone('Europe/Paris');
    const now = at(2026, 11, 20);
    expect(isComeback(now, [at(2026, 10, 1), at(2026, 11, 15)])).toBe(false);
    expect(isComeback(now, [at(2026, 10, 1), at(2026, 11, 15, 18, 0, 50, { workSets: 0 })])).toBe(true);
    expect(isComeback(now, [at(2026, 10, 1), at(2026, 11, 25)])).toBe(true);
  });
});

describe('clockOf: early bird and night owl on the phone clock', () => {
  it('before 7 AM is early from 4 AM; from 9 PM to 4 AM is night; the day between is neither', () => {
    zone('Europe/Paris');
    expect(clockOf(at(2026, 11, 20, 4, 0))).toBe('early');
    expect(clockOf(at(2026, 11, 20, 6, 59))).toBe('early');
    expect(clockOf(at(2026, 11, 20, 7, 0))).toBeNull();
    expect(clockOf(at(2026, 11, 20, 20, 59))).toBeNull();
    expect(clockOf(at(2026, 11, 20, 21, 0))).toBe('night');
    expect(clockOf(at(2026, 11, 20, 1, 30))).toBe('night');
    expect(clockOf(at(2026, 11, 20, 3, 59))).toBe('night');
  });
  it('the start decides, not the save: 8:55 PM to 10 PM is not a night owl', () => {
    zone('Europe/Paris');
    expect(clockOf(at(2026, 11, 20, 20, 55, 65))).toBeNull();
  });
  it('the phone’s own time zone: the same moment is early in Paris and not in Tokyo', () => {
    zone('Europe/Paris');
    const w = at(2026, 11, 20, 6, 30);
    expect(clockOf(w)).toBe('early');
    zone('Asia/Tokyo');
    expect(clockOf(w)).toBeNull(); // 2:30 PM there
  });
  it('no believable time, no badge: left open for hours, imported, or not saved', () => {
    zone('Europe/Paris');
    expect(clockOf(at(2026, 11, 20, 5, 0, 600))).toBeNull();
    expect(clockOf(at(2026, 11, 20, 5, 0, 50, { endedAt: undefined }))).toBeNull();
    expect(clockOf({ id: 'imp', startedAt: 5, endedAt: 6, imported: true, workSets: 3, liftedLb: 0 })).toBeNull();
  });
});
