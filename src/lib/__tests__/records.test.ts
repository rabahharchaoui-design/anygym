import { describe, expect, it } from 'vitest';
import type { Load } from '../../db/types';
import { barbellLoad, bodyweightLoad, dumbbellLoad, timedLoad } from '../load';
import type { PastSet } from '../progression';
import { recordsFor } from '../records';

const bar = (perSide: number[]): Load => barbellLoad(45, perSide, 'none', 'lb')!;
const work = (reps: number, load: Load): PastSet => ({ kind: 'work', reps, load });

describe('recordsFor', () => {
  it('no history: no records at all', () => {
    expect(recordsFor('sq', 'Squat', [work(10, bar([45]))], [])).toEqual([]);
  });
  it('heaviest ever beats every earlier working weight', () => {
    const r = recordsFor('sq', 'Squat', [work(5, bar([45, 25]))], [work(8, bar([45, 10]))]);
    expect(r).toEqual([{ exerciseId: 'sq', kind: 'heaviest', text: 'Squat: heaviest ever, 185 lb' }]);
  });
  it('most reps at a weight lifted before', () => {
    const r = recordsFor('sq', 'Squat', [work(12, bar([45, 25])), work(9, bar([45, 25]))], [work(10, bar([45, 25])), work(8, bar([45, 35]))]);
    expect(r).toEqual([{ exerciseId: 'sq', kind: 'most_reps', text: 'Squat: most reps at 185 lb, 12' }]);
  });
  it('ties are not records; warm ups and drops never count', () => {
    expect(recordsFor('sq', 'Squat', [work(10, bar([45]))], [work(10, bar([45]))])).toEqual([]);
    const warm: PastSet = { kind: 'warmup', reps: 20, load: bar([45, 45, 45]) };
    expect(recordsFor('sq', 'Squat', [warm, work(5, bar([25]))], [work(5, bar([45]))])).toEqual([]);
    const pastDrop: PastSet = { kind: 'drop', reps: 30, load: bar([25]) };
    expect(recordsFor('sq', 'Squat', [work(12, bar([25]))], [pastDrop, work(5, bar([45]))])).toEqual([]);
  });
  it('dumbbells name the dumbbell; other units are not compared', () => {
    expect(recordsFor('db', 'Press', [work(8, dumbbellLoad(40, 'lb'))], [work(8, dumbbellLoad(35, 'lb'))])[0]!.text).toBe('Press: heaviest ever, 40 lb each');
    expect(recordsFor('db', 'Press', [work(8, dumbbellLoad(40, 'lb'))], [work(8, dumbbellLoad(20, 'kg'))])).toEqual([]);
  });
  it('bodyweight: reps records, no heaviest without added weight; holds none', () => {
    expect(recordsFor('pu', 'Pull Up', [work(12, bodyweightLoad('lb'))], [work(10, bodyweightLoad('lb'))])).toEqual([
      { exerciseId: 'pu', kind: 'most_reps', text: 'Pull Up: most reps at bodyweight, 12' },
    ]);
    expect(recordsFor('pl', 'Plank', [{ kind: 'work', seconds: 90, load: timedLoad('lb') }], [{ kind: 'work', seconds: 60, load: timedLoad('lb') }])).toEqual([]);
  });
});

describe('records across units (PLAN 1.7c)', () => {
  const kgBar = (perSide: number[]): Load => barbellLoad(20, perSide, 'none', 'kg')!;
  it('never announces a heaviest that a lift in the other unit beats', () => {
    // 100 kg (220 lb) before; 135 lb today is not a record, 225 lb is.
    const before = [work(5, kgBar([40])), work(5, bar([25]))];
    expect(recordsFor('sq', 'Squat', [work(5, bar([45]))], before)).toEqual([]);
    expect(recordsFor('sq', 'Squat', [work(5, bar([45, 45]))], before).map((r) => r.kind)).toEqual(['heaviest']);
  });
  it('most reps at a weight is not a record when a heavier set in kg had as many reps', () => {
    const before = [work(8, bar([45])), work(10, kgBar([40]))];
    expect(recordsFor('sq', 'Squat', [work(9, bar([45]))], before)).toEqual([]);
    expect(recordsFor('sq', 'Squat', [work(11, bar([45]))], before).map((r) => r.text)).toEqual(['Squat: most reps at 135 lb, 11']);
  });
});
