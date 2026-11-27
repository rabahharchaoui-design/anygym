// PLAN M18a: the badge unlock rules and tiers (docs/finish-celebration.md, Badges), and never twice.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BADGE_IDS, earnedBy, isBadgeId, newBadges, TIERS, type BadgeFacts, type BadgeId } from '..';
import type { WorkoutFact } from '../../streak';

const ORIGINAL_TZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = 'Europe/Paris';
});
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const MIN = 60_000;
let k = 0;
function at(m: number, d: number, h = 18, extra: Partial<WorkoutFact> = {}): WorkoutFact {
  const startedAt = new Date(2026, m - 1, d, h, 0).getTime();
  return { id: `w${++k}`, startedAt, endedAt: startedAt + 50 * MIN, imported: false, workSets: 10, liftedLb: 100, ...extra };
}
/** The facts for the last workout of `workouts`. */
const facts = (workouts: WorkoutFact[], more: Partial<BadgeFacts> = {}): BadgeFacts => ({ workout: workouts[workouts.length - 1]!, workouts, runs: [], prs: 0, goal: 3, ...more });
const earned = (workouts: WorkoutFact[], more: Partial<BadgeFacts> = {}) => earnedBy(facts(workouts, more));

describe('the badge list', () => {
  it('is exactly the M18 set of the art manifest, never the future run and gym badges', () => {
    const manifest = JSON.parse(readFileSync('public/art-manifest.json', 'utf8')) as { sets: { m18: string[]; future_run_and_gym: string[] } };
    expect([...BADGE_IDS].sort()).toEqual([...manifest.sets.m18].sort());
    for (const id of manifest.sets.future_run_and_gym) expect(isBadgeId(id)).toBe(false);
  });
  it('tiers: workouts 10 / 50 / 100 and lifted 1k / 10k / 100k lb', () => {
    expect(TIERS.map((t) => [t.id, t.target])).toEqual([
      ['workouts-t1', 10], ['workouts-t2', 50], ['workouts-t3', 100],
      ['lifted-t1', 1000], ['lifted-t2', 10000], ['lifted-t3', 100000],
    ]);
  });
});

describe('single badges', () => {
  it('first-workout: the first counted workout only (warm ups alone and imports do not take it away)', () => {
    const first = at(11, 18);
    expect(earned([first])).toContain('first-workout');
    expect(earned([at(11, 10, 18, { workSets: 0 }), { id: 'imp', startedAt: 3, imported: true, workSets: 4, liftedLb: 0 }, first])).toContain('first-workout');
    expect(earned([at(11, 10), at(11, 18)])).not.toContain('first-workout');
  });
  it('nothing at all for a workout that does not count (still going, imported, warm ups only)', () => {
    expect(earned([at(11, 18, 5, { endedAt: undefined })])).toEqual([]);
    expect(earned([at(11, 18, 5, { workSets: 0 })])).toEqual([]);
    expect(earned([{ id: 'imp', startedAt: 3, endedAt: 4, imported: true, workSets: 4, liftedLb: 5000 }])).toEqual([]);
  });
  it('week-complete: the workout that reaches the weekly goal (the plan’s, or 3)', () => {
    const wk = [at(11, 23), at(11, 25)];
    expect(earned(wk)).not.toContain('week-complete');
    expect(earned([...wk, at(11, 27)])).toContain('week-complete');
    expect(earned([...wk, at(11, 27)], { goal: 4 })).not.toContain('week-complete');
    expect(earned(wk, { goal: 2 })).toContain('week-complete');
  });
  it('streak-3 / 7 / 30: weeks in a row hitting the goal', () => {
    const weeks = (n: number) => Array.from({ length: n }, (_, i) => at(1, 5 + 7 * i)); // Mondays from Jan 5 2026
    expect(earned(weeks(2), { goal: 1 })).not.toContain('streak-3');
    expect(earned(weeks(3), { goal: 1 })).toEqual(expect.arrayContaining(['streak-3']));
    expect(earned(weeks(7), { goal: 1 })).toEqual(expect.arrayContaining(['streak-3', 'streak-7']));
    expect(earned(weeks(7), { goal: 1 })).not.toContain('streak-30');
    expect(earned(weeks(30), { goal: 1 })).toEqual(expect.arrayContaining(['streak-3', 'streak-7', 'streak-30']));
    expect(earned(weeks(3), { goal: 2 })).not.toContain('streak-3');
  });
  it('new-pr: when the workout set a record', () => {
    expect(earned([at(11, 10), at(11, 18)], { prs: 2 })).toContain('new-pr');
    expect(earned([at(11, 10), at(11, 18)], { prs: 0 })).not.toContain('new-pr');
  });
  it('early-bird and night-owl by the start on the phone clock', () => {
    expect(earned([at(11, 18, 6)])).toContain('early-bird');
    expect(earned([at(11, 18, 22)])).toContain('night-owl');
    const noon = earned([at(11, 18, 12)]);
    expect(noon).not.toContain('early-bird');
    expect(noon).not.toContain('night-owl');
  });
  it('new-city: the first workout in a town no earlier workout or run had', () => {
    const tokyo = (d: number) => at(11, d, 18, { city: 'Tokyo' });
    expect(earned([tokyo(18)])).toContain('new-city');
    expect(earned([at(11, 18)])).not.toContain('new-city'); // no city given: never a guess
    expect(earned([tokyo(10), tokyo(18)])).not.toContain('new-city');
    expect(earned([at(11, 10, 18, { city: ' Tokyo ' }), tokyo(18)])).not.toContain('new-city');
    expect(earned([tokyo(18)], { runs: [{ city: 'Tokyo', startedAt: at(11, 1).startedAt, endedAt: at(11, 1).startedAt + 1 }] })).not.toContain('new-city');
    expect(earned([tokyo(18)], { runs: [{ city: 'Tokyo', startedAt: at(11, 1).startedAt }] })).toContain('new-city'); // a run never finished
    expect(earned([at(11, 10, 18, { city: 'Paris' }), tokyo(18)])).toContain('new-city');
  });
  it('comeback: after 14 or more days off', () => {
    expect(earned([at(11, 1), at(11, 16)])).toContain('comeback');
    expect(earned([at(11, 1), at(11, 15)])).not.toContain('comeback');
    expect(earned([at(11, 16)])).not.toContain('comeback');
  });
  it('a later workout (a restore, another tab) never earns this one anything', () => {
    const now = at(11, 10);
    const later = at(11, 25, 18, { city: 'Tokyo' });
    const f: BadgeFacts = { workout: now, workouts: [now, later, at(11, 26), at(11, 27)], runs: [], prs: 0, goal: 3 };
    expect(earnedBy(f)).toContain('first-workout');
    expect(earnedBy(f)).not.toContain('week-complete');
  });
});

describe('tiered badges', () => {
  it('workouts: 10, 50, 100 counted workouts, imported ones not counted', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => at(1, 1, 18, { startedAt: new Date(2026, 0, 1).getTime() + i * 86_400_000 * 2 }));
    expect(earned(many(9))).not.toContain('workouts-t1');
    expect(earned(many(10))).toContain('workouts-t1');
    expect(earned(many(49))).not.toContain('workouts-t2');
    const fifty = earned(many(50));
    expect(fifty).toEqual(expect.arrayContaining(['workouts-t1', 'workouts-t2']));
    expect(fifty).not.toContain('workouts-t3');
    expect(earned(many(100))).toEqual(expect.arrayContaining(['workouts-t1', 'workouts-t2', 'workouts-t3']));
    const imports = Array.from({ length: 20 }, (_, i) => ({ id: `imp${i}`, startedAt: i + 1, imported: true, workSets: 5, liftedLb: 10_000 }));
    expect(earned([...imports, ...many(9)])).not.toContain('workouts-t1');
  });
  it('lifted: 1k, 10k, 100k lb over the counted workouts, exactly at the line', () => {
    expect(earned([at(11, 1, 18, { liftedLb: 999.5 })])).not.toContain('lifted-t1');
    expect(earned([at(11, 1, 18, { liftedLb: 400.3 }), at(11, 2, 18, { liftedLb: 599.7 })])).toContain('lifted-t1');
    expect(earned([at(11, 1, 18, { liftedLb: 9_999 }), at(11, 2, 18, { liftedLb: 1 })])).toEqual(expect.arrayContaining(['lifted-t1', 'lifted-t2']));
    const big = earned([at(11, 1, 18, { liftedLb: 100_000 })]);
    expect(big).toEqual(expect.arrayContaining(['lifted-t1', 'lifted-t2', 'lifted-t3']));
    expect(earned([{ id: 'imp', startedAt: 1, imported: true, workSets: 5, liftedLb: 50_000 }, at(11, 2, 18, { liftedLb: 10 })])).not.toContain('lifted-t1');
  });
  it('the result is in catalog order with no repeats', () => {
    const list = earned([at(11, 18, 6, { city: 'Lyon', liftedLb: 2000 })], { prs: 1, goal: 1 });
    expect(list).toEqual(['first-workout', 'week-complete', 'new-pr', 'early-bird', 'new-city', 'lifted-t1']);
  });
});

describe('newBadges: never awarded twice', () => {
  it('drops the owned ones and repeats', () => {
    const e: BadgeId[] = ['first-workout', 'new-pr', 'new-pr', 'lifted-t1'];
    expect(newBadges(e, [])).toEqual(['first-workout', 'new-pr', 'lifted-t1']);
    expect(newBadges(e, ['new-pr', 'first-workout'])).toEqual(['lifted-t1']);
    expect(newBadges(e, new Set<BadgeId>(e))).toEqual([]);
  });
});
