import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PCT,
  FRESH_HOURS,
  PRIORITY,
  START_LIGHT,
  autoExample,
  autoWarmUps,
  bandOf,
  candidates,
  coachRest,
  coachToday,
  currentEstimate,
  deloadChanges,
  deloadSignal,
  firstCompound,
  freshBands,
  judgeRaise,
  learnedScale,
  liftClass,
  liftKey,
  missedWorkouts,
  newOutcomes,
  plateauOf,
  raiseRule,
  recoveryLine,
  sessionEstimate,
  sharpDrop,
  showable,
  smoothed,
  targetActive,
  targetOf,
  trainingStreak,
  weekKey,
  weekStart,
  weeklyLevelUp,
  weeklyRate,
  welcomeChanges,
  withTarget,
  type ChangeRecord,
  type CoachInput,
  type Lift,
} from '../../coach';
import { loadAt } from '../../load';
import { progress } from '../../progression';
import { DAY, KG, LB, NOW, bar, db, lift, nov, pin, record, sess } from './fixtures';

// PLAN 3.8: the coach's rules (SPEC 15), one by one. Weights in lb and kg, rounding through load.ts.

const base = (over: Partial<CoachInput> = {}): CoachInput => ({ now: NOW, lifts: [], dates: [], changes: [], closed: new Set(), autoLevelUp: false, activeWorkout: false, ...over });
const datesOf = (lifts: Lift[]) => lifts.flatMap((l) => l.sessions.map((s) => s.date));

describe('classify', () => {
  it('big leg lifts, upper body compounds, small exercises; unknown is unknown', () => {
    expect(liftClass('squat')).toBe('lower');
    expect(liftClass('hinge')).toBe('lower');
    expect(liftClass('lunge')).toBe('lower');
    expect(liftClass('horizontal push')).toBe('upper');
    expect(liftClass('vertical pull')).toBe('upper');
    expect(liftClass('biceps')).toBe('isolation');
    expect(liftClass('calves')).toBe('isolation');
    expect(liftClass(null)).toBeNull();
    expect(liftKey('bench', 'barbell', '')).toBe('bench||barbell');
    expect(liftKey('bench', 'barbell', 'g1', true)).toBe('bench|g1|barbell|smith');
  });
});

describe('the strength estimate (internal)', () => {
  it('best working set; a set with no rep and bodyweight with nothing added say nothing', () => {
    expect(sessionEstimate(sess(nov(2), [5, 0], bar(200)), 'lb')).toBeCloseTo(200 * (1 + 5 / 30), 6);
    expect(sessionEstimate(sess(nov(2), [0], bar(200)), 'lb')).toBeNull();
    expect(sessionEstimate({ sets: [{ reps: 10, load: { kind: 'bodyweight', unit: 'lb', total: 0, added: 0 } }] }, 'lb')).toBeNull();
    expect(sessionEstimate({ sets: [{ reps: 10, load: { kind: 'timed', unit: 'lb', total: 0 } }] }, 'lb')).toBeNull();
    // A kg set compared in lb.
    expect(sessionEstimate(sess(nov(2), [1], bar(100, KG)), 'lb')).toBeCloseTo(220.462, 2);
  });
  it('smoothed with an exponential moving average', () => {
    expect(smoothed([100, 110, 120])).toEqual([100, 105, 112.5]);
    expect(smoothed([])).toEqual([]);
    const l = lift({ sessions: [sess(nov(9), [5], bar(200)), sess(nov(2), [5], bar(190))] });
    expect(currentEstimate(l.sessions, 'lb')).toBeCloseTo(0.5 * 200 * (7 / 6) + 0.5 * 190 * (7 / 6), 6);
    expect(currentEstimate([], 'lb')).toBeNull();
  });
  it('a weekly rate from 4 to 8 weeks; null with too little', () => {
    const weeks = [0, 1, 2, 3, 4].map((w) => sess(NOW - (4 - w) * 7 * DAY, [5, 5, 5], bar(200 + 10 * w)));
    const rate = weeklyRate([...weeks].reverse(), 'lb', NOW)!;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.06);
    expect(weeklyRate(weeks.slice(0, 2), 'lb', NOW)).toBeNull();
    // Three workouts in one week: not enough time to learn a rate.
    expect(weeklyRate([sess(NOW - DAY, [5], bar(200)), sess(NOW - 2 * DAY, [5], bar(195)), sess(NOW - 3 * DAY, [5], bar(190))], 'lb', NOW)).toBeNull();
    // Older than 8 weeks is left out.
    expect(weeklyRate([sess(NOW - 70 * DAY, [5], bar(200)), sess(NOW - 80 * DAY, [5], bar(190)), sess(NOW - 90 * DAY, [5], bar(180))], 'lb', NOW)).toBeNull();
    // The same strength every week: flat, 0.
    const flat = [0, 1, 2, 3].map((w) => sess(NOW - w * 7 * DAY, [5], bar(200)));
    expect(weeklyRate(flat, 'lb', NOW)).toBeCloseTo(0, 9);
  });
});

describe('the raise rule (SPEC 15 personal progression)', () => {
  it('under 3 workouts: the fixed defaults', () => {
    expect(raiseRule({ cls: 'lower', rate: 0.2, sessions: 2, scale: 1, easy: false }, 'lb')).toEqual({ pct: DEFAULT_PCT.lower, minAdd: 10, capPct: 0.1 });
    expect(raiseRule({ cls: 'upper', rate: null, sessions: 5, scale: 1, easy: false }, 'kg')).toEqual({ pct: DEFAULT_PCT.upper, minAdd: 2.5, capPct: 0.05 });
    expect(raiseRule({ cls: 'isolation', rate: 0.1, sessions: 9, scale: 1, easy: true }, 'lb')).toEqual({ pct: 0, minAdd: 0, capPct: 0 });
  });
  it('a fast lifter gets bigger jumps, a slow one smaller, within the bounds', () => {
    expect(raiseRule({ cls: 'lower', rate: 0.3, sessions: 6, scale: 1, easy: false }, 'lb').pct).toBe(0.1);
    expect(raiseRule({ cls: 'lower', rate: 0.001, sessions: 6, scale: 1, easy: false }, 'lb').pct).toBe(0.025);
    expect(raiseRule({ cls: 'upper', rate: 0.04, sessions: 6, scale: 1, easy: false }, 'lb').pct).toBe(0.04);
    expect(raiseRule({ cls: 'upper', rate: 0.5, sessions: 6, scale: 2, easy: true }, 'lb').pct).toBe(0.05);
  });
  it('after a missed raise: half, and the minimum drops to one small step', () => {
    const r = raiseRule({ cls: 'lower', rate: null, sessions: 1, scale: 0.5, easy: false }, 'lb');
    expect(r.pct).toBe(0.025);
    expect(r.minAdd).toBe(0);
    expect(raiseRule({ cls: 'lower', rate: null, sessions: 1, scale: 1, easy: true }, 'lb').pct).toBeCloseTo(0.0625, 9);
  });
});

describe('learn from outcomes', () => {
  const raise = { key: 'barbell-back-squat||barbell', exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell' as const, unit: 'lb' as const, from: 200, to: 210, reason: '', source: 'level_up' as const };
  it('a raise followed by missed reps halves the next one; an Easy one grows it; undone ones teach nothing', () => {
    const missed = lift({ sessions: [sess(nov(10), [8, 6, 5], bar(210)), sess(nov(3), [12, 12, 12], bar(200))] });
    const c = record(raise, nov(9));
    expect(judgeRaise(c, missed)).toBe('miss');
    expect(learnedScale(missed, [c])).toBe(0.5);
    const easy = lift({ sessions: [sess(nov(10), [9, 9, 9], bar(210), [8, 12], 'easy')] });
    expect(judgeRaise(c, easy)).toBe('easy');
    expect(learnedScale(easy, [c])).toBe(1.25);
    const good = lift({ sessions: [sess(nov(10), [9, 9, 8], bar(210), [8, 12], 'good')] });
    expect(learnedScale(good, [c])).toBe(1);
    expect(learnedScale(missed, [{ ...c, undoneAt: nov(9) + 1 }])).toBe(1);
    // Not lifted at the raised weight yet (or done lighter): nothing to judge.
    expect(judgeRaise(c, lift({ sessions: [sess(nov(10), [8], bar(200))] }))).toBeNull();
    expect(judgeRaise({ ...c, unit: 'kg' }, missed)).toBeNull();
    expect(judgeRaise(c, lift({ sessions: [sess(nov(8), [5], bar(210))] }))).toBeNull();
  });
  it('stays within 0.25 and 2', () => {
    const l = lift({ sessions: [sess(nov(10), [5], bar(210))] });
    const misses = [1, 2, 3, 4].map((i) => record(raise, nov(1) + i));
    expect(learnedScale(l, misses)).toBe(0.25);
    const easies = [1, 2, 3, 4].map((i) => record(raise, nov(1) + i));
    expect(learnedScale(lift({ sessions: [sess(nov(10), [9], bar(210), [8, 12], 'easy')] }), easies)).toBe(2);
  });
});

// Last week: Mon 2 to Sun 8 Nov 2026. NOW: Wed 11 Nov.
const squatTop = (load = bar(200), effort?: 'easy' | 'good' | 'hard') => lift({ sessions: [sess(nov(5), [12, 12, 12], load, [8, 12], effort)] });

describe('weekly Level up', () => {
  it('earned: every set at the top; +5% at least +10 lb on a big leg lift, loadable', () => {
    const d = weeklyLevelUp([squatTop()], [], NOW)!;
    expect(d.weekKey).toBe('2026-11-02');
    expect(d.cardId).toBe('levelup:2026-11-02');
    expect(d.earned).toEqual([
      expect.objectContaining({ exerciseId: 'barbell-back-squat', from: 200, to: 210, unit: 'lb', reason: '+10 lb: you hit 3 × 12 last week', source: 'level_up', reps: 'low' }),
    ]);
    expect(d.holding).toEqual([]);
  });
  it('two weeks in a row, with reps to spare', () => {
    const l = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200), [8, 12], 'easy'), sess(nov(29) - 31 * DAY, [12, 12, 12], bar(200))] });
    expect(weeklyLevelUp([l], [], NOW)!.earned[0]!.reason).toBe('+15 lb: you hit 3 × 12 two weeks in a row, with reps to spare');
  });
  it('upper body +2.5% at least +5 lb; a kg gym rounds to kg plates', () => {
    const bench = lift({ exerciseId: 'barbell-bench-press', name: 'Barbell Bench Press', pattern: 'horizontal push', sessions: [sess(nov(4), [10, 10, 10], bar(135), [8, 10])] });
    expect(weeklyLevelUp([bench], [], NOW)!.earned[0]).toMatchObject({ from: 135, to: 140, reason: '+5 lb: you hit 3 × 10 last week' });
    const kgSquat = lift({ setup: KG, sessions: [sess(nov(4), [5, 5, 5], bar(100, KG), [3, 5])] });
    expect(weeklyLevelUp([kgSquat], [], NOW)!.earned[0]).toMatchObject({ from: 100, to: 105, unit: 'kg', reason: '+5 kg: you hit 3 × 5 last week' });
    const kgBench = lift({ setup: KG, pattern: 'horizontal push', sessions: [sess(nov(4), [8, 8], bar(60, KG), [6, 8])] });
    expect(weeklyLevelUp([kgBench], [], NOW)!.earned[0]).toMatchObject({ from: 60, to: 62.5, reason: '+2.5 kg: you hit 2 × 8 last week' });
  });
  it('small exercises: reps first (the top of the range), then one step', () => {
    const curl = lift({ exerciseId: 'dumbbell-curl', name: 'Dumbbell Curl', pattern: 'biceps', sessions: [sess(nov(4), [12, 12, 12], db(25), [10, 12])] });
    expect(weeklyLevelUp([curl], [], NOW)!.earned[0]).toMatchObject({ from: 25, to: 30, reason: '+5 lb each: you hit 3 × 12 last week' });
    const cable = lift({ exerciseId: 'cable-fly', name: 'Cable Fly', pattern: 'chest isolation', sessions: [sess(nov(4), [15, 15], pin(50), [12, 15])] });
    expect(weeklyLevelUp([cable], [], NOW)!.earned[0]).toMatchObject({ from: 50, to: 55 });
  });
  it('never raises a lift that missed reps, or one not at the top yet, or one that felt hard', () => {
    const missed = lift({ sessions: [sess(nov(6), [12, 12, 12], bar(200)), sess(nov(3), [10, 8, 7], bar(200))] });
    expect(weeklyLevelUp([missed], [], NOW)).toMatchObject({ earned: [], holding: [{ reason: 'Holding steady: 1 set fell short of 8 reps' }] });
    const two = lift({ sessions: [sess(nov(6), [10, 7, 6], bar(200))] });
    expect(weeklyLevelUp([two], [], NOW)!.holding[0]!.reason).toBe('Holding steady: 2 sets fell short of 8 reps');
    const notTop = lift({ sessions: [sess(nov(6), [12, 11, 10], bar(200))] });
    expect(weeklyLevelUp([notTop], [], NOW)!.holding[0]!.reason).toBe('Holding steady: aim for 12 reps on every set first');
    const mixed = lift({ sessions: [sess(nov(6), [12, 12], bar(200)), sess(nov(6), [12], bar(205))].slice(0, 1).map((s) => ({ ...s, sets: [...s.sets, { reps: 12, load: bar(205) }] })) });
    expect(weeklyLevelUp([mixed], [], NOW)!.holding[0]!.reason).toBe('Holding steady: aim for 12 reps on every set first');
    expect(weeklyLevelUp([squatTop(bar(200), 'hard')], [], NOW)!.holding[0]!.reason).toBe('Holding steady: it felt hard, so one more week at this weight');
    const top = lift({ loadKind: 'dumbbell_each', pattern: 'horizontal push', sessions: [sess(nov(6), [10, 10], db(100), [8, 10])] });
    expect(weeklyLevelUp([top], [], NOW)!.holding[0]!.reason).toBe('Holding steady: no heavier weight here yet. Add a rep to each set instead');
  });
  it('leaves out what it cannot judge: no range, other unit, not loadable here, unknown pattern, bodyweight, trained since, not last week', () => {
    const cases: Lift[] = [
      lift({ sessions: [sess(nov(5), [12, 12], bar(200), null)] }),
      lift({ sessions: [sess(nov(5), [12, 12], bar(100, KG))] }),
      lift({ setup: null, sessions: [sess(nov(5), [12, 12], bar(200))] }),
      lift({ pattern: null, sessions: [sess(nov(5), [12, 12], bar(200))] }),
      lift({ loadKind: 'bodyweight', sessions: [sess(nov(5), [12, 12], { kind: 'bodyweight', unit: 'lb', total: 0, added: 0 })] }),
      lift({ sessions: [sess(nov(10), [12, 12], bar(200)), sess(nov(5), [12, 12], bar(200))] }),
      lift({ sessions: [sess(nov(1), [12, 12], bar(200))] }),
    ];
    expect(weeklyLevelUp(cases, [], NOW)).toBeNull();
  });
  it('after a missed raise, the next raise is smaller', () => {
    const c = record({ key: 'barbell-back-squat||barbell', exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 190, to: 200, reason: '', source: 'auto' }, nov(1, 8));
    const l = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200)), sess(nov(2), [8, 7, 6], bar(200))] });
    // This week's earned raise is judged after the missed one: half of 5% of 200 = 5 lb.
    expect(weeklyLevelUp([lift({ sessions: [l.sessions[0]!] })], [], NOW)!.earned[0]!.to).toBe(210);
    expect(weeklyLevelUp([lift({ sessions: [l.sessions[0]!, sess(nov(2) - 7 * DAY, [8, 7, 6], bar(200))] })], [{ ...c, appliedAt: nov(1) - 9 * DAY }], NOW)!.earned[0]!.to).toBe(205);
  });
});

describe('lighter weeks (deload) and welcome back', () => {
  const weekly = (weeks: number, load = bar(200)) => lift({ sessions: Array.from({ length: weeks }, (_, i) => sess(nov(4) - i * 7 * DAY, [10, 10, 10], load)) });
  it('every 5th to 6th week: after 5 straight training weeks', () => {
    const l = weekly(5);
    expect(trainingStreak(datesOf([l]), NOW)).toBe(5);
    expect(deloadSignal([l], datesOf([l]), [], NOW)).toEqual({ why: 'weeks', text: '5 strong weeks in a row. A lighter week now keeps you progressing.' });
    expect(deloadSignal([weekly(4)], datesOf([weekly(4)]), [], NOW)).toBeNull();
    // A week off breaks the streak.
    const gap = lift({ sessions: [0, 1, 3, 4, 5, 6].map((i) => sess(nov(4) - i * 7 * DAY, [10], bar(200))) });
    expect(trainingStreak(datesOf([gap]), NOW)).toBe(2);
  });
  it('not again within 4 weeks of a lighter week, and the streak restarts from it', () => {
    const l = weekly(8);
    const took = record({ key: l.key, exerciseId: l.exerciseId, name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 200, to: 180, reason: '', source: 'deload' }, NOW - 20 * DAY);
    expect(deloadSignal([l], datesOf([l]), [took], NOW)).toBeNull();
    const older = { ...took, appliedAt: NOW - 30 * DAY };
    expect(trainingStreak(datesOf([l]), NOW, older.appliedAt)).toBe(4);
    expect(deloadSignal([l], datesOf([l]), [older], NOW)).toBeNull();
    expect(deloadSignal([l], datesOf([l]), [{ ...older, undoneAt: NOW - 29 * DAY }], NOW)?.why).toBe('weeks');
  });
  it('missed reps two workouts in a row on most lifts', () => {
    const miss = (id: string) => lift({ exerciseId: id, key: id, sessions: [sess(nov(9), [8, 6, 5], bar(200)), sess(nov(6), [9, 7, 6], bar(200))] });
    const ok = lift({ exerciseId: 'c', key: 'c', sessions: [sess(nov(9), [10, 10], bar(200))] });
    const lifts = [miss('a'), miss('b'), ok];
    expect(deloadSignal(lifts, [nov(9), nov(6)], [], NOW)?.why).toBe('missed');
    expect(deloadSignal([miss('a'), ok], [nov(9), nov(6)], [], NOW)).toBeNull();
  });
  it('most lifts Hard last week, or reps dropping sharply set to set', () => {
    const hard = (id: string, e: 'hard' | 'good') => lift({ exerciseId: id, key: id, sessions: [sess(nov(5), [10, 10], bar(200), [8, 12], e)] });
    expect(deloadSignal([hard('a', 'hard'), hard('b', 'hard'), hard('c', 'good')], [nov(5)], [], NOW)?.why).toBe('hard');
    expect(deloadSignal([hard('a', 'hard'), hard('b', 'good')], [nov(5)], [], NOW)).toBeNull();
    expect(sharpDrop(sess(nov(5), [10, 8, 6], bar(200)))).toBe(true);
    expect(sharpDrop(sess(nov(5), [10, 9, 7], bar(200)))).toBe(false);
    expect(sharpDrop(sess(nov(5), [10], bar(200)))).toBe(false);
    expect(sharpDrop({ sets: [{ reps: 10, load: bar(200) }, { reps: 4, load: bar(225) }] })).toBe(false);
    const drop = (id: string) => lift({ exerciseId: id, key: id, sessions: [sess(nov(5), [12, 8, 6], bar(200))] });
    expect(deloadSignal([drop('a'), drop('b')], [nov(5)], [], NOW)?.why).toBe('drop');
  });
  it('the lighter week: about 10% off, loadable, one set fewer, until Monday', () => {
    const squat = weekly(5);
    const curl = lift({ exerciseId: 'dumbbell-curl', key: 'curl', name: 'Dumbbell Curl', pattern: 'biceps', sessions: [sess(nov(9), [10], db(25))] });
    const kg = lift({ exerciseId: 'kg', key: 'kg', setup: KG, sessions: [sess(nov(9), [5], bar(102.5, KG))] });
    const old = lift({ exerciseId: 'old', key: 'old', sessions: [sess(nov(1) - 20 * DAY, [5], bar(300))] });
    const list = deloadChanges([squat, curl, kg, old], NOW);
    expect(list.map((c) => [c.exerciseId, c.from, c.to, c.unit])).toEqual([
      ['barbell-back-squat', 200, 180, 'lb'],
      ['dumbbell-curl', 25, 20, 'lb'],
      ['kg', 102.5, 92.5, 'kg'],
    ]);
    expect(list[0]).toMatchObject({ source: 'deload', fewerSets: true, until: weekStart(NOW) + 7 * DAY, reason: '−20 lb this week: a lighter week so you come back stronger' });
    expect(list[1]!.reason).toBe('−5 lb each this week: a lighter week so you come back stronger');
    for (const c of list) expect(loadAt(c.loadKind, c.to, c.unit === 'kg' ? KG : LB)).not.toBeNull();
  });
  it('welcome back: about 90% on lifts done before the break, for 7 days', () => {
    const now = nov(20, 12);
    const squat = lift({ sessions: [sess(nov(10), [5], bar(225))] });
    const list = welcomeChanges([squat], [nov(10)], now);
    expect(list).toEqual([expect.objectContaining({ from: 225, to: 200, source: 'welcome_back', until: now + 7 * DAY, reason: '−25 lb this week: welcome back, easing in' })]);
    expect(list[0]!.fewerSets).toBeUndefined();
  });
});

describe('plateau (one lift)', () => {
  it('flat for 3 workouts: a lighter step on that lift only', () => {
    const l = lift({ sessions: [sess(nov(10), [10, 9, 9], bar(200)), sess(nov(7), [10, 9, 9], bar(200)), sess(nov(4), [10, 10, 9], bar(200))] });
    const p = plateauOf(l, NOW)!;
    expect(p.text).toBe('Barbell Back Squat has been stuck around 200 lb for 3 workouts.');
    expect(p.action).toEqual({ kind: 'lighter', change: expect.objectContaining({ from: 200, to: 180, source: 'plateau', reps: 'high', reason: '−20 lb next time: a step back to build up past it' }) });
    expect(p.cardId).toBe(`plateau:${l.key}:${l.sessions[0]!.sessionId}`);
  });
  it('a close variation when one fits the plan in use', () => {
    const variation = { id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', slot: 'barbell-bench-press', planId: 'p' };
    const l = lift({ name: 'Bench', pattern: 'horizontal push', variation, sessions: [sess(nov(10), [8, 8], bar(185)), sess(nov(7), [8, 8], bar(185)), sess(nov(4), [8, 8], bar(185))] });
    expect(plateauOf(l, NOW)!.action).toEqual({ kind: 'variation', ...variation });
  });
  it('Hard twice in a row at the same weight', () => {
    const l = lift({ sessions: [sess(nov(10), [8, 8], bar(200), [8, 12], 'hard'), sess(nov(7), [9, 8], bar(200), [8, 12], 'hard')] });
    expect(plateauOf(l, NOW)!.text).toBe('Barbell Back Squat felt hard twice in a row at 200 lb.');
  });
  it('not a plateau: moving up, at the top, not recent, too few workouts, nothing lighter', () => {
    expect(plateauOf(lift({ sessions: [sess(nov(10), [10], bar(210)), sess(nov(7), [10], bar(200)), sess(nov(4), [10], bar(190))] }), NOW)).toBeNull();
    expect(plateauOf(lift({ sessions: [sess(nov(10), [12, 12], bar(200)), sess(nov(7), [12, 12], bar(200)), sess(nov(4), [12, 12], bar(200))] }), NOW)).toBeNull();
    expect(plateauOf(lift({ sessions: [sess(nov(10) - 30 * DAY, [10], bar(200)), sess(nov(7) - 30 * DAY, [10], bar(200)), sess(nov(4) - 30 * DAY, [10], bar(200))] }), NOW)).toBeNull();
    expect(plateauOf(lift({ sessions: [sess(nov(10), [10], bar(200))] }), NOW)).toBeNull();
    expect(plateauOf(lift({ loadKind: 'dumbbell_each', sessions: [sess(nov(10), [9], db(5)), sess(nov(7), [9], db(5)), sess(nov(4), [9], db(5))] }), NOW)).toBeNull();
    expect(plateauOf(lift({ setup: null, sessions: [sess(nov(10), [9], bar(200)), sess(nov(7), [9], bar(200)), sess(nov(4), [9], bar(200))] }), NOW)).toBeNull();
  });
});

describe('missed days (ask before changing the plan)', () => {
  it('counts the training days in between (today and the last workout left out)', () => {
    // Last workout Mon 2 Nov; today Wed 11 Nov; Mon, Wed, Fri plan: Wed 4, Fri 6, Mon 9 → 3.
    expect(missedWorkouts({ last: nov(2), now: NOW, weekdays: ['mon', 'wed', 'fri'], daysPerWeek: 3 })).toBe(3);
    expect(missedWorkouts({ last: nov(9), now: NOW, weekdays: ['mon', 'wed', 'fri'], daysPerWeek: 3 })).toBe(0);
    expect(missedWorkouts({ last: nov(10), now: NOW, daysPerWeek: 3 })).toBe(0);
  });
  it('without training days: the plan rate over the days between, rounded down', () => {
    expect(missedWorkouts({ last: nov(6), now: NOW, daysPerWeek: 3 })).toBe(1);
    expect(missedWorkouts({ last: nov(4), now: NOW, daysPerWeek: 3 })).toBe(2);
    expect(missedWorkouts({ last: nov(4), now: NOW, daysPerWeek: 9 })).toBe(6);
  });
});

describe('Today: one card at most, in priority order, honest when empty', () => {
  it('no data: no card and no line', () => {
    expect(coachToday(base())).toEqual({ card: null, line: null, autoApply: null });
    expect(coachToday(base({ recovery: { yesterday: [], next: [], nameOf: String } }))).toEqual({ card: null, line: null, autoApply: null });
  });
  it('the priority order is welcome back > missed days > deload > level up > leveled up > plateau', () => {
    expect(PRIORITY).toEqual(['welcome_back', 'missed_days', 'deload', 'level_up', 'leveled_up', 'plateau']);
  });
  it('level up shows when earned, and only one card', () => {
    const l = squatTop();
    const t = coachToday(base({ lifts: [l], dates: datesOf([l]) }));
    expect(t.card).toMatchObject({ kind: 'level_up', id: 'levelup:2026-11-02', title: 'You hit all your reps on 1 lift last week. Add weight?' });
    expect(t.line).toBeNull();
    // Answered: gone.
    expect(coachToday(base({ lifts: [l], dates: datesOf([l]), closed: new Set(['levelup:2026-11-02']) })).card).toBeNull();
  });
  it('a deload beats a level up; missed days beats a deload; welcome back beats them all', () => {
    const streak = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200)), ...[1, 2, 3, 4].map((i) => sess(nov(5) - i * 7 * DAY, [12, 12, 12], bar(200)))] });
    const dates = datesOf([streak]);
    const c1 = candidates(base({ lifts: [streak], dates }));
    expect(c1.cards.map((c) => c.kind)).toEqual(['deload', 'level_up']);
    const c2 = candidates(base({ lifts: [streak], dates, plan: { daysPerWeek: 7 } }));
    expect(c2.cards.map((c) => c.kind)).toEqual(['missed_days', 'deload', 'level_up']);
    expect(c2.cards[0]).toMatchObject({ missed: 5, title: 'Missed 5 workouts' });
    const later = nov(16, 12);
    const c3 = candidates(base({ now: later, lifts: [streak], dates, plan: { daysPerWeek: 7 } }));
    expect(c3.cards.map((c) => c.kind)).toEqual(['welcome_back', 'missed_days']);
    expect(c3.cards[0]).toMatchObject({ days: 11 });
  });
  it('plateau is last; a recovery line only when there is no card', () => {
    const l = lift({ sessions: [sess(nov(10), [10, 9, 9], bar(200)), sess(nov(9), [10, 9, 9], bar(200)), sess(nov(8, 9), [10, 10, 9], bar(200))] });
    const t = coachToday(base({ lifts: [l], dates: datesOf([l]), recovery: { yesterday: ['quadriceps'], next: ['quadriceps'], nameOf: () => 'quads' } }));
    expect(t.card?.kind).toBe('plateau');
    expect(t.line).toBeNull();
    const none = coachToday(base({ lifts: [], dates: [nov(10)], recovery: { yesterday: ['quadriceps', 'gluteal'], next: ['gluteal', 'quadriceps'], nameOf: (r) => (r === 'gluteal' ? 'glutes' : 'quads') } }));
    expect(none.card).toBeNull();
    expect(none.line).toBe('You trained glutes and quads yesterday, and today works them again. Go a little lighter if they feel tired.');
  });
  it('nothing during a workout in progress', () => {
    const l = squatTop();
    expect(coachToday(base({ lifts: [l], dates: datesOf([l]), activeWorkout: true }))).toEqual({ card: null, line: null, autoApply: null });
    expect(recoveryLine({ activeWorkout: true, recovery: { yesterday: ['chest'], next: ['chest'], nameOf: () => 'chest' } })).toBeNull();
    expect(recoveryLine({ activeWorkout: false, recovery: { yesterday: ['chest'], next: ['chest'], nameOf: () => 'chest' } })).toBe(
      'You trained chest yesterday, and today works it again. Go a little lighter if it feels tired.',
    );
  });
  it('Auto level up: applies on its own, then the quiet Leveled up card shows once that week', () => {
    const l = squatTop();
    const t = coachToday(base({ lifts: [l], dates: datesOf([l]), autoLevelUp: true }));
    expect(t.card).toBeNull();
    expect(t.autoApply?.earned).toHaveLength(1);
    const applied: ChangeRecord[] = t.autoApply!.earned.map((c) => record({ ...c, source: 'auto' }, NOW, t.autoApply!.cardId, { weekKey: t.autoApply!.weekKey }));
    const after = coachToday(base({ lifts: [l], dates: datesOf([l]), autoLevelUp: true, changes: applied }));
    expect(after.autoApply).toBeNull();
    expect(after.card).toMatchObject({ kind: 'leveled_up', id: 'leveled:2026-11-02', title: 'Leveled up 1 lift for this week' });
    expect(coachToday(base({ lifts: [l], dates: datesOf([l]), autoLevelUp: true, changes: applied, closed: new Set(['leveled:2026-11-02']) })).card).toBeNull();
    // A dismissed Level up card is never applied on its own later.
    expect(coachToday(base({ lifts: [l], dates: datesOf([l]), autoLevelUp: true, closed: new Set(['levelup:2026-11-02']) })).autoApply).toBeNull();
  });
});

describe('targets on the exercise screen', () => {
  const t = targetOf({ key: 'k', exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 200, to: 210, reason: '+10 lb: you hit 3 × 12 last week', source: 'level_up', reps: 'low' }, nov(9));
  it('active until the lift is done again; a lighter week until its end; same unit and kind only', () => {
    expect(targetActive(t, nov(5), NOW, 'lb', 'barbell')).toBe(true);
    expect(targetActive(t, undefined, NOW, 'lb', 'barbell')).toBe(true);
    expect(targetActive(t, nov(10), NOW, 'lb', 'barbell')).toBe(false);
    expect(targetActive(t, nov(5), NOW, 'kg', 'barbell')).toBe(false);
    expect(targetActive(t, nov(5), NOW, 'lb', 'dumbbell_each')).toBe(false);
    expect(targetActive(undefined, nov(5), NOW, 'lb', 'barbell')).toBe(false);
    const week = { ...t, until: nov(16, 0) };
    expect(targetActive(week, nov(10), NOW, 'lb', 'barbell')).toBe(true);
    expect(targetActive(week, nov(10), nov(16, 1), 'lb', 'barbell')).toBe(false);
    expect(targetOf({ key: 'k', exerciseId: 'x', name: 'x', loadKind: 'barbell', unit: 'lb', from: 1, to: 2, reason: '', source: 'deload', until: 5, fewerSets: true }, 1)).toEqual({
      value: 2, unit: 'lb', loadKind: 'barbell', reason: '', source: 'deload', setAt: 1, until: 5, fewerSets: true,
    });
  });
  it('wins over SPEC 6 Next with its own reason; every row at the target, reps from the range', () => {
    const p = progress({ exerciseId: 'barbell-back-squat', loadKind: 'barbell', unit: 'lb', gym: LB, repRange: [8, 12], history: [{ date: nov(5), gymId: 'g', unit: 'lb', sets: [{ kind: 'work', reps: 12, load: bar(200) }, { kind: 'work', reps: 12, load: bar(200) }] }] });
    expect(p.next.load?.total).toBe(205);
    const c = withTarget(p, t, bar(210), [8, 12]);
    expect(c.next).toMatchObject({ kind: 'coach', reason: '+10 lb: you hit 3 × 12 last week', reps: [8, 12] });
    expect(c.next.load?.total).toBe(210);
    expect(c.perSet.map((r) => [r.target.load?.total, r.target.reps])).toEqual([[210, 8], [210, 8]]);
    expect(c.lastTime).toBe(p.lastTime);
    const high = withTarget(p, { ...t, reps: 'high' }, bar(180), [8, 12]);
    expect(high.perSet[0]!.target.reps).toBe(12);
    const table = withTarget(p, t, bar(210), null, { sets: 4, reps: 6 });
    expect(table.perSet.map((r) => r.target.reps)).toEqual([6, 6]);
    expect(table.next.reps).toBe(6);
    const none = withTarget({ ...p, perSet: [] }, t, bar(210), null);
    expect(none.perSet).toHaveLength(2);
    expect(none.perSet[0]!.target.reps).toBeUndefined();
  });
});

describe('rest, warm ups, fresh muscles, words', () => {
  it('rest by goal and exercise; unknown keeps the default', () => {
    expect(coachRest('strength', 'lower')).toBe(180);
    expect(coachRest('muscle', 'isolation')).toBe(75);
    expect(coachRest('fat_loss', 'upper')).toBe(75);
    expect(coachRest(undefined, 'upper')).toBeNull();
    expect(coachRest('muscle', null)).toBeNull();
    expect(coachRest('nope', 'upper')).toBeNull();
  });
  it('warm ups: the first big lift of the day, for intermediate and up only', () => {
    const entries = [
      { exerciseId: 'band', warmup: true },
      { exerciseId: 'curl', warmup: false },
      { exerciseId: 'pushup', warmup: false },
      { exerciseId: 'squat', warmup: false },
      { exerciseId: 'bench', warmup: false },
    ];
    const cls = (id: string) => (id === 'curl' ? 'isolation' : id === 'band' ? null : 'lower') as ReturnType<typeof liftClass>;
    const kind = (id: string): 'bodyweight' | 'barbell' => (id === 'pushup' ? 'bodyweight' : 'barbell');
    expect(firstCompound(entries, cls, kind)).toBe('squat');
    expect(firstCompound([{ exerciseId: 'curl', warmup: false }], cls, kind)).toBeNull();
    expect(firstCompound([{ exerciseId: 'x', warmup: false, finisher: true }], cls, kind)).toBeNull();
    expect(firstCompound([{ exerciseId: 'squat', warmup: false }], cls, () => undefined)).toBeNull();
    expect(autoWarmUps('3y', 'barbell', 185, LB)).toHaveLength(3);
    expect(autoWarmUps('1_2y', 'barbell', 185, LB)).toHaveLength(3);
    expect(autoWarmUps('break', 'barbell', 185, LB)).toHaveLength(3);
    expect(autoWarmUps('new', 'barbell', 185, LB)).toEqual([]);
    expect(autoWarmUps('months', 'barbell', 185, LB)).toEqual([]);
    expect(autoWarmUps(undefined, 'barbell', 185, LB)).toEqual([]);
    expect(autoWarmUps('3y', 'barbell', null, LB)).toEqual([]);
  });
  it('fresh muscles: under 24 h, 24 to 48 h, 48 to 72 h, else not shaded (the stated rule)', () => {
    expect(FRESH_HOURS).toEqual({ day: [0, 24], two: [24, 48], three: [48, 72] });
    const h = DAY / 24;
    expect(bandOf(0)).toBe('day');
    expect(bandOf(-5 * h)).toBe('day');
    expect(bandOf(23.9 * h)).toBe('day');
    expect(bandOf(24 * h)).toBe('two');
    expect(bandOf(47.9 * h)).toBe('two');
    expect(bandOf(48 * h)).toBe('three');
    expect(bandOf(71.9 * h)).toBe('three');
    expect(bandOf(72 * h)).toBeNull();
    const bands = freshBands([
      { at: NOW - 50 * h, regions: ['chest', 'triceps'] },
      { at: NOW - 2 * h, regions: ['chest'] },
      { at: NOW - 30 * h, regions: ['quadriceps'] },
      { at: NOW - 100 * h, regions: ['biceps'] },
    ], NOW);
    expect(bands).toEqual({ chest: 'day', triceps: 'three', quadriceps: 'two' });
    expect(freshBands([], NOW)).toEqual({});
  });
  it('the words never show the internal estimate', () => {
    expect(showable('+10 lb: you hit 3 × 12 last week')).toBe(true);
    for (const bad of ['Your e1RM went up', 'Estimated max 250', 'New 1RM', 'one rep max', 'RPE 8', 'estimate']) expect(showable(bad)).toBe(false);
    expect(START_LIGHT).toBe("Start light: 10 easy reps, then we'll set your number");
  });
  it('the Auto level up example comes from the real lifts; none without one', () => {
    expect(autoExample([], [], NOW)).toBeNull();
    expect(autoExample([squatTop()], [], NOW)).toMatchObject({ name: 'Barbell Back Squat', from: 200, to: 210 });
    const notEarned = lift({ sessions: [sess(nov(10), [9, 8], bar(185))] });
    expect(autoExample([notEarned], [], NOW)).toMatchObject({ from: 185, to: 195, unit: 'lb' });
    expect(autoExample([lift({ setup: KG, sessions: [sess(nov(10), [9], bar(185))] })], [], NOW)).toBeNull();
    expect(autoExample([lift({ loadKind: 'dumbbell_each', sessions: [sess(nov(10), [9], db(100))] })], [], NOW)).toBeNull();
  });
  it('week keys are Mondays', () => {
    expect(weekKey(nov(8, 23))).toBe('2026-11-02');
    expect(weekKey(nov(9, 0))).toBe('2026-11-09');
  });
});

describe('round 2 (Codex 3.8)', () => {
  const sq = 'barbell-back-squat||barbell';
  it('#1 no automatic raise while a lighter week, missed days or welcome back is active; lifts in a lighter week are never raised', () => {
    const streak = lift({ key: sq, sessions: [sess(nov(5), [12, 12, 12], bar(200)), ...[1, 2, 3, 4].map((i) => sess(nov(5) - i * 7 * DAY, [12, 12, 12], bar(200)))] });
    const dates = datesOf([streak]);
    // A lighter week is due: Auto level up waits.
    expect(coachToday(base({ lifts: [streak], dates, autoLevelUp: true })).autoApply).toBeNull();
    // Missed days asking: it waits too.
    const one = squatTop();
    expect(coachToday(base({ lifts: [one], dates: datesOf([one]), autoLevelUp: true, plan: { daysPerWeek: 7 } })).autoApply).toBeNull();
    expect(coachToday(base({ lifts: [one], dates: datesOf([one]), autoLevelUp: true })).autoApply).not.toBeNull();
    // An accepted lighter week target: neither the card nor Auto raises that lift.
    const deload = { value: 180, unit: 'lb' as const, loadKind: 'barbell' as const, reason: '', source: 'deload' as const, setAt: nov(9), until: nov(16, 0) };
    expect(weeklyLevelUp([{ ...one, target: deload }], [], NOW)).toBeNull();
    expect(weeklyLevelUp([{ ...one, target: { ...deload, until: nov(10) } }], [], NOW)?.earned).toHaveLength(1);
    expect(weeklyLevelUp([{ ...one, target: { ...deload, source: 'welcome_back' } }], [], NOW)).toBeNull();
  });
  it('#3 a stored outcome counts after it left the window: a miss 20 workouts ago still halves the raise until an Easy one grows it', () => {
    const old = record({ key: sq, exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 190, to: 200, reason: '', source: 'auto' }, nov(1) - 140 * DAY, 'levelup:old', { outcome: 'miss' });
    // The lift row keeps what the miss taught it (0.5); its workout is long gone from the 16 read.
    const now = lift({ key: sq, scale: 0.5, sessions: [sess(nov(5), [12, 12, 12], bar(200))] });
    expect(learnedScale(now, [old])).toBe(0.5);
    expect(weeklyLevelUp([now], [old], NOW)!.earned[0]!.to).toBe(205);
    // Without the stored scale it would be the full +10.
    expect(weeklyLevelUp([{ ...now, scale: undefined }], [old], NOW)!.earned[0]!.to).toBe(210);
    // A later Easy raise, judged now (not stored yet), grows it: 0.5 × 1.25.
    const easy = record({ key: sq, exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 195, to: 200, reason: '', source: 'auto' }, nov(4));
    const after = lift({ key: sq, scale: 0.5, sessions: [sess(nov(5), [12, 12, 12], bar(200), [8, 12], 'easy')] });
    expect(learnedScale(after, [old, easy])).toBe(0.625);
    expect(newOutcomes([after], [old, easy])).toEqual([{ id: easy.id, key: sq, outcome: 'easy' }]);
    expect(newOutcomes([after], [{ ...easy, outcome: 'easy' }])).toEqual([]);
    expect(newOutcomes([], [easy])).toEqual([]);
  });
  it('#4 Hard twice at the same weight is a plateau even at the top of the range', () => {
    const l = lift({ sessions: [sess(nov(10), [12, 12], bar(200), [8, 12], 'hard'), sess(nov(7), [12, 12], bar(200), [8, 12], 'hard')] });
    expect(plateauOf(l, NOW)?.text).toBe('Barbell Back Squat felt hard twice in a row at 200 lb.');
    expect(plateauOf(lift({ sessions: [sess(nov(10), [12, 12], bar(200), [8, 12], 'hard'), sess(nov(7), [12, 12], bar(200), [8, 12], 'good')] }), NOW)).toBeNull();
  });
  it('#5 the Leveled up card comes from this week\'s stored automatic changes, even once the lifts were trained again', () => {
    const c = record({ key: sq, exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 200, to: 210, reason: '', source: 'auto' }, nov(9, 8), 'levelup:2026-11-02', { weekKey: '2026-11-02' });
    // Trained Tuesday: last week's decision no longer lists it.
    const trained = lift({ key: sq, sessions: [sess(nov(10), [8, 8, 8], bar(210)), sess(nov(5), [12, 12, 12], bar(200))] });
    const t = coachToday(base({ lifts: [trained], dates: datesOf([trained]), autoLevelUp: true, changes: [c] }));
    expect(t.card).toMatchObject({ kind: 'leveled_up', id: 'leveled:2026-11-02', title: 'Leveled up 1 lift for this week' });
    // All undone: nothing to show; last week's changes are not this week's card.
    expect(coachToday(base({ lifts: [trained], dates: datesOf([trained]), changes: [{ ...c, undoneAt: nov(10) }] })).card).toBeNull();
    expect(coachToday(base({ lifts: [trained], dates: datesOf([trained]), changes: [{ ...c, appliedAt: nov(6) }] })).card?.kind).not.toBe('leveled_up');
  });
});
