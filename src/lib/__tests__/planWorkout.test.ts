import { describe, expect, it } from 'vitest';
import { planById } from '../../data/plans';
import { dayWorkout, finisherId, firstOpen, nextCurrent, repRangeOf, restAfter, setLine, targetSecondsOf, type WorkoutEntry } from '../planWorkout';

const ohrabah = planById('ohrabah-split')!;
const sixWeek = planById('six-week-volume')!;

describe('dayWorkout', () => {
  it('day 1: every exercise in order with targets, rest and notes', () => {
    const day = dayWorkout(ohrabah, 0);
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
      line: '4 sets × 8 to 12 · 90 s rest',
      amount: '8 to 12 reps',
    });
    const climber = day.find((e) => e.exerciseId === 'cross-body-mountain-climber')!;
    expect(climber).toMatchObject({ eachSide: true, amount: '20 reps each side' });
  });

  it('day 2: pairs share a block, warm up flagged', () => {
    const day = dayWorkout(ohrabah, 1);
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
    expect(dayWorkout(ohrabah, 0)[4]!.prescription).toBeUndefined();
    expect(dayWorkout(ohrabah, 9)).toEqual([]);
  });
});

describe('finisher row', () => {
  it('is the last row: timed with the plan minutes, no rest, no invented length', () => {
    const day2 = dayWorkout(ohrabah, 1);
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
    const day5 = dayWorkout(ohrabah, 4).at(-1)!;
    expect(day5).toMatchObject({ exerciseId: finisherId('Cycling'), name: 'Cycling', line: '', finisher: true, restSec: 0 });
    expect(day5.seconds).toBeUndefined();
    expect(setLine(day5, 1)).toBe('Set 1 of 1');
    expect(dayWorkout(ohrabah, 0).some((e) => e.finisher)).toBe(false);
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

  it('pair: back to back, rest after the round, then on', () => {
    expect(nextCurrent(day, { a: 2, p1: 1 }, 'p1')).toBe('p2');
    expect(restAfter(day, { a: 2, p1: 1 }, 'p1')).toBe(0);
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
