import { describe, expect, it } from 'vitest';
import { judgeRaise } from '../../coach';
import { stackLoad } from '../../load';
import { bar, db, lift, nov, pin, record, sess } from './fixtures';

// PLAN R3 (1): a raise is judged on the whole weight it goes to (the pin plus a kept add-on), not the pin alone.

const base = { name: 'Lift', reason: '', source: 'level_up' as const, unit: 'lb' as const };

describe('judging a raise on the whole weight (R3)', () => {
  const stackRaise = record({ ...base, key: 'leg-press|g1|stack', exerciseId: 'leg-press', loadKind: 'stack', from: 100, fromTotal: 150, to: 105, toAdded: 50 }, nov(9));

  it('a pin plus add-on raise is not done by a workout on the pin alone', () => {
    const pinOnly = lift({ loadKind: 'stack', sessions: [sess(nov(10), [5, 5, 5], pin(105))] });
    expect(judgeRaise(stackRaise, pinOnly)).toBeNull();
  });
  it('is done by a workout at the full weight', () => {
    const full = lift({ loadKind: 'stack', sessions: [sess(nov(10), [5, 5, 5], stackLoad(105, 'lb', 50))] });
    expect(judgeRaise(stackRaise, full)).toBe('miss');
    const good = lift({ loadKind: 'stack', sessions: [sess(nov(10), [9, 9, 9], stackLoad(105, 'lb', 50), [8, 12], 'easy')] });
    expect(judgeRaise(stackRaise, good)).toBe('easy');
  });
  it('a pin only raise is not done by the same pin with an add-on', () => {
    const plain = { ...stackRaise, toAdded: undefined };
    expect(judgeRaise(plain, lift({ loadKind: 'stack', sessions: [sess(nov(10), [9], stackLoad(105, 'lb', 50))] }))).toBeNull();
    expect(judgeRaise(plain, lift({ loadKind: 'stack', sessions: [sess(nov(10), [9], pin(105))] }))).toBe('good');
  });
  it('barbell and dumbbell raises are judged as before', () => {
    const barRaise = record({ ...base, key: 'squat||barbell', exerciseId: 'squat', loadKind: 'barbell', from: 200, to: 210 }, nov(9));
    expect(judgeRaise(barRaise, lift({ sessions: [sess(nov(10), [9], bar(210))] }))).toBe('good');
    expect(judgeRaise(barRaise, lift({ sessions: [sess(nov(10), [9], bar(200))] }))).toBeNull();
    const dbRaise = record({ ...base, key: 'press||dumbbell_each', exerciseId: 'press', loadKind: 'dumbbell_each', from: 40, to: 45 }, nov(9));
    expect(judgeRaise(dbRaise, lift({ loadKind: 'dumbbell_each', sessions: [sess(nov(10), [5], db(45))] }))).toBe('miss');
    expect(judgeRaise(dbRaise, lift({ loadKind: 'dumbbell_each', sessions: [sess(nov(10), [9], db(40))] }))).toBeNull();
  });
});
