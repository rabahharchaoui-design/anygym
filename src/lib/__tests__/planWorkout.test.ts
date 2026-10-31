import { describe, expect, it } from 'vitest';
import { planById } from '../../data/plans';
import { advancesAfterLog, dayProgress, dayWorkout, doneCounts, finisherId, firstOpen, isStretchName, isWorkingEntry, nextCurrent, repRangeOf, restAfter, setLine, startedCount, targetSecondsOf, type WorkoutEntry } from '../planWorkout';

const split5 = planById('five-day-split')!;
const sixWeek = planById('six-week-volume')!;

describe('dayWorkout', () => {
  it('day 1: every exercise in order with targets, rest and notes', () => {
    const day = dayWorkout(split5, 0);
    expect(day).toHaveLength(16);
    expect(day.map((e) => e.exerciseId).slice(0, 5)).toEqual([
      'static-quadricep-stretch',
      'dynamic-hip-flexor-stretch',
      'static-proximal-hamstring-stretch',
      'static-pigeon-stretch',
      'barbell-back-squat',
    ]);
    expect(day[0]).toMatchObject({ kind: 'single', sets: 1, seconds: 45, restSec: 0, line: '45 sec', amount: '45 sec', warmup: false });
    expect(day[4]).toEqual({
      exerciseId: 'barbell-back-squat',
      name: 'Barbell Back Squat',
      note: 'Wide stance',
      block: 4,
      kind: 'single',
      warmup: false,
      pairIndex: 0,
      pairSize: 1,
      sets: 4,
      reps: [8, 12],
      restSec: 90,
      statedRest: 90,
      setsText: '4 sets × 8 to 12',
      line: '4 sets × 8 to 12 reps · 90 s rest',
      amount: '8 to 12 reps',
    });
    const climber = day.find((e) => e.exerciseId === 'cross-body-mountain-climber')!;
    expect(climber).toMatchObject({ eachSide: true, amount: '20 reps each side' });
  });

  it('day 2: pairs share a block, warm up flagged', () => {
    const day = dayWorkout(split5, 1);
    expect(day.slice(0, 2).map((e) => [e.kind, e.warmup, e.block, e.pairIndex, e.pairSize])).toEqual([
      ['pair', true, 0, 0, 2],
      ['pair', true, 0, 1, 2],
    ]);
    expect(day[3]).toMatchObject({ exerciseId: 'barbell-incline-bench-press', kind: 'pair', block: 2, pairIndex: 0, restSec: 90, sets: 4 });
    expect(day[4]).toMatchObject({ exerciseId: 'incline-plate-press', kind: 'pair', block: 2, pairIndex: 1 });
  });

  it('weekly table: the week row and a prescription; double plans have none', () => {
    expect(dayWorkout(sixWeek, 0, 0)[0]).toMatchObject({ setsText: '5 sets × 6', prescription: { sets: 5, reps: 6 } });
    expect(dayWorkout(sixWeek, 0, 2)[0]).toMatchObject({ setsText: '5 sets × 8', prescription: { sets: 5, reps: 8 } });
    expect(dayWorkout(sixWeek, 2, 0)[0]).toMatchObject({ setsText: '10 rounds × 30 sec', line: '10 rounds × 30 sec', seconds: 30, rounds: true, restSec: 90 });
    expect(setLine(dayWorkout(sixWeek, 2, 0)[0]!, 2)).toBe('Round 2 of 10 · 30 sec');
    expect(dayWorkout(sixWeek, 2, 0)[0]!.prescription).toBeUndefined();
    expect(dayWorkout(split5, 0)[4]!.prescription).toBeUndefined();
    expect(dayWorkout(split5, 9)).toEqual([]);
  });
});

describe('finisher row', () => {
  it('is the last row: timed with the plan minutes, no rest, no invented length', () => {
    const day2 = dayWorkout(split5, 1);
    expect(day2.at(-1)).toEqual({
      exerciseId: 'finisher-stair-climbing',
      name: 'Stair climbing',
      block: 7,
      kind: 'single',
      warmup: false,
      pairIndex: 0,
      pairSize: 1,
      sets: 1,
      restSec: 0,
      seconds: 900,
      setsText: '15 min',
      line: '15 min',
      amount: '15 min',
      finisher: true,
    });
    const day5 = dayWorkout(split5, 4).at(-1)!;
    expect(day5).toMatchObject({ exerciseId: finisherId('Cycling'), name: 'Cycling', line: '', finisher: true, restSec: 0 });
    expect(day5.seconds).toBeUndefined();
    expect(setLine(day5, 1)).toBe('Set 1 of 1');
    expect(dayWorkout(split5, 0).some((e) => e.finisher)).toBe(false);
  });
});

describe('helpers', () => {
  it('repRangeOf, targetSecondsOf, setLine', () => {
    expect(repRangeOf({ reps: [8, 12] })).toEqual([8, 12]);
    expect(repRangeOf({ reps: 20 })).toEqual([20, 20]);
    expect(repRangeOf({})).toBeNull();
    expect(targetSecondsOf({ seconds: [60, 90] })).toBe(60);
    expect(targetSecondsOf({ seconds: 45 })).toBe(45);
    expect(targetSecondsOf({})).toBeUndefined();
    expect(setLine({ sets: 4, amount: '8 to 12 reps' }, 1)).toBe('Set 1 of 4 · 8 to 12 reps');
    expect(setLine({ sets: 4, amount: '' }, 2)).toBe('Set 2 of 4');
    expect(setLine({ sets: 4, amount: '8 to 12 reps' }, 5)).toBe('Set 5');
  });
});

const e = (exerciseId: string, extra: Partial<WorkoutEntry> = {}): WorkoutEntry => ({
  exerciseId,
  name: exerciseId,
  block: 0,
  kind: 'single',
  warmup: false,
  pairIndex: 0,
  pairSize: 1,
  sets: 2,
  restSec: 60,
  setsText: '',
  line: '',
  amount: '',
  ...extra,
});

describe('nextCurrent and restAfter', () => {
  const day = [
    e('a', { block: 0 }),
    e('p1', { block: 1, kind: 'pair', pairIndex: 0, pairSize: 2, restSec: 90 }),
    e('p2', { block: 1, kind: 'pair', pairIndex: 1, pairSize: 2, restSec: 90 }),
    e('b', { block: 2, restSec: 0 }),
  ];

  it('single: stays until done, then the next open exercise', () => {
    expect(nextCurrent(day, { a: 1 }, 'a')).toBe('a');
    expect(restAfter(day, { a: 1 }, 'a')).toBe(60);
    expect(nextCurrent(day, { a: 2 }, 'a')).toBe('p1');
    expect(restAfter(day, { a: 2 }, 'a')).toBe(60);
  });

  it('pair: partner up next, the block rest still runs (PLAN 2.0g), then on', () => {
    expect(nextCurrent(day, { a: 2, p1: 1 }, 'p1')).toBe('p2');
    expect(restAfter(day, { a: 2, p1: 1 }, 'p1')).toBe(90);
    expect(nextCurrent(day, { a: 2, p1: 1, p2: 1 }, 'p2')).toBe('p1');
    expect(restAfter(day, { a: 2, p1: 1, p2: 1 }, 'p2')).toBe(90);
    expect(nextCurrent(day, { a: 2, p1: 2, p2: 2 }, 'p2')).toBe('b');
    // p2 ahead of p1 (logged out of order): back to p1.
    expect(nextCurrent(day, { a: 2, p1: 0, p2: 1 }, 'p2')).toBe('p1');
    // An extra set on p1 when p2 is done: on past the pair.
    expect(nextCurrent(day, { a: 2, p1: 3, p2: 2 }, 'p1')).toBe('b');
  });

  it('skipped exercises earlier in the day come back after the last one', () => {
    expect(nextCurrent(day, { b: 2 }, 'b')).toBe('a');
    expect(firstOpen(day, { a: 2 })).toBe('p1');
  });

  it('everything done: stays, no rest; an exercise added by hand is not the plan’s', () => {
    const all = { a: 2, p1: 2, p2: 2, b: 2 };
    expect(nextCurrent(day, all, 'b')).toBe('b');
    expect(firstOpen(day, all)).toBeNull();
    expect(restAfter(day, all, 'b')).toBe(0);
    expect(nextCurrent(day, {}, 'zz')).toBe('zz');
    expect(restAfter(day, {}, 'zz')).toBeNull();
  });
});

describe('advancesAfterLog (PLAN 2.0g)', () => {
  const four = [
    e('inc', { block: 0, kind: 'pair', pairIndex: 0, pairSize: 2, sets: 4, name: 'Barbell Incline Bench Press' }),
    e('plate', { block: 0, kind: 'pair', pairIndex: 1, pairSize: 2, sets: 4, name: 'Incline Plate Press' }),
    e('sq', { block: 1, sets: 4, name: 'Barbell Back Squat' }),
    e('wu', { block: 2, warmup: true, sets: 2, name: 'Band Rotation' }),
    e('st', { block: 3, sets: 1, name: 'Static Pigeon Stretch' }),
  ];
  it('stays on sets 1 to 3 of a 4 set exercise, single or pair', () => {
    for (const id of ['inc', 'sq']) for (const n of [0, 1, 2]) expect(advancesAfterLog(four, { [id]: n }, id, 'work')).toBe(false);
  });
  it('moves on only with the last working set', () => {
    expect(advancesAfterLog(four, { inc: 3 }, 'inc', 'work')).toBe(true);
    expect(advancesAfterLog(four, { sq: 3 }, 'sq', 'drop')).toBe(true);
  });
  it('never on an extra set after going back, a warm up set, a warm up block, a stretch, or a hand added exercise', () => {
    expect(advancesAfterLog(four, { sq: 4 }, 'sq', 'work')).toBe(false);
    expect(advancesAfterLog(four, { sq: 5 }, 'sq', 'work')).toBe(false);
    // Back on a done exercise, + Add set (5 sets, 1 extra), then its check: stays.
    const extra = four.map((x) => (x.exerciseId === 'sq' ? { ...x, sets: 5 } : x));
    expect(advancesAfterLog(extra, { sq: 4 }, 'sq', 'work', 1)).toBe(false);
    expect(advancesAfterLog(extra, { sq: 3 }, 'sq', 'work', 1)).toBe(false);
    expect(advancesAfterLog(four, { sq: 3 }, 'sq', 'warmup')).toBe(false);
    expect(advancesAfterLog(four, { wu: 1 }, 'wu', 'warmup')).toBe(false);
    expect(advancesAfterLog(four, {}, 'st', 'work')).toBe(false);
    expect(advancesAfterLog(four, {}, 'zz', 'work')).toBe(false);
  });
});

describe('quick workout entries and order (PLAN 1.7c)', () => {
  it('quickEntry: 3 × 8 to 12, 90 s rest; holds invent no length', async () => {
    const { quickEntry, QUICK_DEFAULT } = await import('../planWorkout');
    expect(QUICK_DEFAULT).toEqual({ sets: 3, reps: [8, 12], restSec: 90 });
    expect(quickEntry('sq', 'Squat', 'barbell', 0)).toMatchObject({ sets: 3, reps: [8, 12], restSec: 90, setsText: '3 sets × 8 to 12', amount: '8 to 12 reps', kind: 'single' });
    const plank = quickEntry('plank', 'Plank', 'timed', 1);
    expect(plank.reps).toBeUndefined();
    expect(plank.seconds).toBeUndefined();
    expect(plank.setsText).toBe('3 sets');
    expect(quickEntry('x', 'X', undefined, 2).statedRest).toBeUndefined();
  });
  it('orderEntries follows the workout order and drops removed exercises', async () => {
    const { orderEntries, quickEntry } = await import('../planWorkout');
    const a = quickEntry('a', 'A', 'barbell', 0);
    const b = quickEntry('b', 'B', 'barbell', 1);
    const out = orderEntries([a, b], ['b', 'c'], (id, i) => quickEntry(id, id.toUpperCase(), 'timed', i));
    expect(out.map((e) => e.exerciseId)).toEqual(['b', 'c']);
    expect(out[1]!.block).toBe(3);
  });
  it('moveInOrder: singles swap, pairs move as one and are never split', async () => {
    const { moveInOrder } = await import('../planWorkout');
    const kinds: Record<string, { kind: 'single' | 'pair'; block: number }> = {
      a: { kind: 'single', block: 0 },
      p1: { kind: 'pair', block: 1 },
      p2: { kind: 'pair', block: 1 },
      d: { kind: 'single', block: 2 },
    };
    const of = (id: string) => kinds[id];
    const ids = ['a', 'p1', 'p2', 'd'];
    expect(moveInOrder(ids, 'a', 1, of)).toEqual(['p1', 'p2', 'a', 'd']);
    expect(moveInOrder(ids, 'd', -1, of)).toEqual(['a', 'd', 'p1', 'p2']);
    expect(moveInOrder(ids, 'a', -1, of)).toBeNull();
    expect(moveInOrder(ids, 'd', 1, of)).toBeNull();
    expect(moveInOrder(ids, 'p1', 1, of)).toBeNull();
    expect(moveInOrder(ids, 'zz', 1, of)).toBeNull();
    expect(moveInOrder(['x', 'y'], 'x', 1, () => undefined)).toEqual(['y', 'x']);
  });
});

describe('upNext (the highlighted row)', () => {
  it('carries on after the last logged exercise, else the first with sets left', async () => {
    const { quickEntry, upNext } = await import('../planWorkout');
    const es = ['a', 'b', 'c'].map((id, i) => quickEntry(id, id, 'barbell', i));
    expect(upNext(es, {}, undefined)).toBe('a');
    expect(upNext(es, { b: 1 }, 'b')).toBe('b');
    expect(upNext(es, { b: 3 }, 'b')).toBe('c');
    expect(upNext(es, { b: 3, c: 3 }, 'c')).toBe('a');
    expect(upNext(es, { a: 3, b: 3, c: 3 }, 'c')).toBeNull();
    expect(upNext(es, {}, 'gone')).toBe('a');
  });
});

describe('dayProgress (1.7e: partial days)', () => {
  const plan = planById('five-day-split')!;
  const day = dayWorkout(plan, plan.days.findIndex((d) => d.blocks.some((b) => b.warmup) && d.finisher), 0);
  const lifts = day.filter((e) => !e.warmup && !e.finisher);
  it('counts lifts only (no warm ups, no finisher), share of planned sets, complete with a set on each', () => {
    const none = dayProgress(day, () => 0);
    expect(none).toEqual({ done: 0, total: lifts.length, share: 0, complete: false });
    const first = lifts.find((e) => e.sets > 1)!;
    // 1 of its 4 sets is not done; all of them is.
    const one = dayProgress(day, (id) => (id === first.exerciseId ? 1 : 0));
    expect(one.done).toBe(0);
    expect(dayProgress(day, (id) => (id === first.exerciseId ? first.sets : 0)).done).toBe(1);
    expect(one.share).toBeCloseTo(1 / lifts.reduce((a, e) => a + e.sets, 0));
    // Warm ups and the finisher never count.
    const warm = day.find((e) => e.warmup)!;
    expect(dayProgress(day, (id) => (id === warm.exerciseId || id.startsWith('finisher-') ? 9 : 0)).done).toBe(0);
    // One set on every lift: no tick (same rule as the finish screen), only single set lifts are done.
    const ones = dayProgress(day, (id) => (lifts.some((e) => e.exerciseId === id) ? 1 : 0));
    expect(ones.complete).toBe(false);
    expect(ones.done).toBe(lifts.filter((e) => e.sets <= 1).length);
    // Every set of every lift: the tick.
    expect(dayProgress(day, (id) => lifts.find((e) => e.exerciseId === id)?.sets ?? 0).complete).toBe(true);
    expect(dayProgress(day, () => 99).share).toBe(1);
    expect(dayProgress([], () => 1)).toEqual({ done: 0, total: 0, share: 0, complete: false });
  });
});

describe('working exercises (PLAN 2.0a)', () => {
  it('stretches, warm up blocks and finishers are not working exercises; timed holds are', () => {
    expect(isStretchName('Static Pigeon Stretch')).toBe(true);
    expect(isStretchName('Stretching Band Row')).toBe(false);
    const d1 = dayWorkout(split5, 0);
    expect(d1.filter((e) => !isWorkingEntry(e)).map((e) => e.name)).toEqual([
      'Static Quadricep Stretch',
      'Dynamic Hip Flexor Stretch',
      'Static Proximal Hamstring Stretch',
      'Static Pigeon Stretch',
    ]);
    expect(isWorkingEntry(d1.find((e) => e.name === 'Elbow Plank')!)).toBe(true);
    const d2 = dayWorkout(split5, 1);
    expect(d2.filter((e) => !isWorkingEntry(e)).every((e) => e.warmup || e.finisher)).toBe(true);
  });

  it('Classic Day 1 counts 12 exercises and 37 sets; Day 4 counts 13 and 40', () => {
    const none = () => 0;
    const p1 = dayProgress(dayWorkout(split5, 0), none);
    expect(p1.total).toBe(12);
    // One set short of 60% (22 of 37) and exactly enough (23 of 37: 62%).
    const day1 = dayWorkout(split5, 0).filter(isWorkingEntry);
    expect(day1.reduce((a, e) => a + e.sets, 0)).toBe(37);
    expect(dayProgress(dayWorkout(split5, 3), none).total).toBe(13);
    expect(dayWorkout(split5, 3).filter(isWorkingEntry).reduce((a, e) => a + e.sets, 0)).toBe(40);
  });

  it('stretches and warm ups add nothing; extra sets never make up for skipped ones', () => {
    const d1 = dayWorkout(split5, 0);
    const stretchesOnly = dayProgress(d1, (id) => (d1.find((e) => e.exerciseId === id)!.name.includes('Stretch') ? 5 : 0));
    expect(stretchesOnly).toMatchObject({ done: 0, total: 12, share: 0, complete: false });
    const squatsOnly = dayProgress(d1, (id) => (id === 'barbell-back-squat' ? 30 : 0));
    expect(squatsOnly.share).toBeCloseTo(4 / 37);
    expect(squatsOnly.done).toBe(1);
    const all = dayProgress(d1, (id) => d1.find((e) => e.exerciseId === id)!.sets);
    expect(all).toMatchObject({ done: 12, share: 1, complete: true });
    const warmDay = dayWorkout(split5, 1);
    const warm = warmDay.find((e) => e.warmup)!;
    const counts = doneCounts(warmDay, [{ exerciseId: warm.exerciseId, kind: 'warmup' }, { exerciseId: 'dumbbell-bench-press', kind: 'warmup' }]);
    expect(dayProgress(warmDay, (id) => counts[id] ?? 0).share).toBe(0);
  });

  it('startedCount: working exercises begun but not finished', () => {
    const d1 = dayWorkout(split5, 0);
    const done = { 'barbell-back-squat': 4, 'angled-machine-leg-press': 1 };
    const logged = (id: string) => id in done || id === 'static-pigeon-stretch' || id === 'machine-lying-leg-curl';
    expect(startedCount(d1, done, logged)).toBe(2); // leg press 1 of 3, leg curl warm up only
  });
});
