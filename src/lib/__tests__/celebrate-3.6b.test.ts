// PLAN 3.6b: the facts a celebration shows ("+10 lb", "heaviest ever") and the gym's moments, from
// real history only. The tier rules are in src/ui/celebrate/__tests__/select.test.ts.
import { describe, expect, it } from 'vitest';
import type { Load } from '../../db/types';
import { barbellLoad, bodyweightLoad, dumbbellLoad, heavierBy, singleLoad, timedLoad } from '../load';
import type { PastSet } from '../progression';
import { recordSets, type RecordSet } from '../records';
import { firstWorkoutMoment, liftMoments } from '../gymMoments';

const lb = (total: number): Load => singleLoad(total, 'lb');
const kg = (total: number): Load => singleLoad(total, 'kg');
const bar = (perSide: number[]): Load => barbellLoad(45, perSide, 'none', 'lb')!;
const past = (reps: number, load: Load, kind: PastSet['kind'] = 'work'): PastSet => ({ kind, reps, load });
let n = 0;
const set = (reps: number, load: Load, kind: PastSet['kind'] = 'work'): RecordSet => ({ id: `s${++n}`, kind, reps, load });

describe('heavierBy (load.ts): how much heavier, in words', () => {
  it('the exact difference in the unit lifted now', () => {
    expect(heavierBy(bar([45, 25, 5]), bar([45, 25]))).toBe('+10 lb');
    expect(heavierBy(kg(102.5), kg(100))).toBe('+2.5 kg');
    expect(heavierBy(bodyweightLoad('lb', 25), bodyweightLoad('lb', 10))).toBe('+15 lb');
  });
  it('one dumbbell, said as each', () => {
    expect(heavierBy(dumbbellLoad(55, 'lb'), dumbbellLoad(50, 'lb'))).toBe('+5 lb each');
  });
  it('an earlier lift in the other unit is converted, never unit noise', () => {
    expect(heavierBy(lb(225), kg(100))).toBe('+4.5 lb');
    expect(heavierBy(lb(220.462), kg(100))).toBeNull(); // the same 100 kg
  });
  it('nothing when it is not heavier, or not the same kind of load', () => {
    expect(heavierBy(lb(185), lb(185))).toBeNull();
    expect(heavierBy(lb(180), lb(185))).toBeNull();
    expect(heavierBy(lb(185), dumbbellLoad(50, 'lb'))).toBeNull();
    expect(heavierBy(timedLoad('lb'), timedLoad('lb'))).toBeNull();
  });
});

describe('record facts for celebrations (records.ts)', () => {
  it('a heavier set: the weight alone, the words, and how much heavier than the earlier workouts', () => {
    const [r] = recordSets([set(6, bar([45, 25, 5]))], [past(6, bar([45, 25])), past(8, bar([45, 10]))]);
    expect(r!.setText).toBe('195 lb × 6');
    expect(r!.plus).toBe('+10 lb');
    expect(r!.heaviest).toMatchObject({ weight: '195 lb', text: '195 lb × 6, heaviest ever', plus: '+10 lb' });
    expect(r!.heaviest!.gainOverHistory).toBeCloseTo(195 / 185, 6);
  });
  it('a set named for its volume still says it is the heaviest', () => {
    // 190 × 8 after 185 × 5: volume gains more than weight, so volume names it; it is also the heaviest.
    const [r] = recordSets([set(8, lb(190))], [past(5, lb(185))]);
    expect(r!.kind).toBe('volume');
    expect(r!.text).toBe('190 lb × 8, your best yet');
    expect(r!.heaviest?.text).toBe('190 lb × 8, heaviest ever');
    expect(r!.plus).toBe('+5 lb');
  });
  it('more reps at a weight lifted before: "+2 reps", "+1 rep"; no heaviest', () => {
    const [two] = recordSets([set(7, lb(185))], [past(5, lb(185))]);
    expect(two!.plus).toBe('+2 reps');
    expect(two!.heaviest).toBeUndefined();
    const [one] = recordSets([set(6, lb(185))], [past(5, lb(185))]);
    expect(one!.plus).toBe('+1 rep');
  });
  it('a later heavier set today measures its gain against the earlier workouts, not this morning', () => {
    const rs = recordSets([set(5, lb(190)), set(5, lb(200))], [past(5, lb(185))]);
    expect(rs.map((r) => r.heaviest?.plus)).toEqual(['+5 lb', '+15 lb']);
    expect(rs[1]!.heaviest!.gainOverHistory).toBeCloseTo(200 / 185, 6);
  });
  it('a volume record with no single plain number says no plus (lighter, many more reps)', () => {
    const [r] = recordSets([set(20, lb(135))], [past(5, lb(185))]);
    expect(r!.kind).toBe('volume');
    expect(r!.plus).toBeUndefined();
    expect(r!.heaviest).toBeUndefined();
  });
  it('dumbbells say each; a tie, a warm up and a first ever lift earn nothing', () => {
    const [r] = recordSets([set(8, dumbbellLoad(55, 'lb'))], [past(8, dumbbellLoad(50, 'lb'))]);
    expect(r!.heaviest).toMatchObject({ weight: '55 lb each', plus: '+5 lb each' });
    expect(recordSets([set(5, lb(185))], [past(5, lb(185))])).toEqual([]);
    expect(recordSets([set(5, lb(225), 'warmup')], [past(5, lb(185))])).toEqual([]);
    expect(recordSets([set(5, lb(225))], [])).toEqual([]);
  });
});

describe('gymMoments (PLAN 3.6b)', () => {
  const heavy = recordSets([set(5, lb(190)), set(5, lb(200)), set(12, lb(185))], [past(5, lb(185))]);
  const reps = recordSets([set(12, lb(40))], [past(10, lb(40))]);

  it('a new heaviest weight on a main lift asks for the full screen, with its top weight', () => {
    const [m] = liftMoments([{ exerciseId: 'bench', name: 'Barbell Bench Press', main: true, records: heavy }]);
    expect(m).toEqual({ id: `lift:${heavy[1]!.setId}`, kind: 'lift_record', big: true, weight: heavy[1]!.heaviest!.gainOverHistory, title: 'Barbell Bench Press', hero: '200 lb', caption: 'Heaviest ever', detail: '200 lb × 5, heaviest ever', plus: '+15 lb' });
  });
  it('the same record on any other lift is a card; so is a rep record on a main lift', () => {
    const [curl] = liftMoments([{ exerciseId: 'curl', name: 'Curl', main: false, records: heavy }]);
    expect(curl!.big).toBe(false);
    const [squat] = liftMoments([{ exerciseId: 'squat', name: 'Squat', main: true, records: reps }]);
    expect(squat).toMatchObject({ big: false, title: 'Squat', detail: '40 lb × 12, your best yet', plus: '+2 reps' });
  });
  it('one moment per lift, in workout order; a lift without a record has none', () => {
    const ms = liftMoments([
      { exerciseId: 'a', name: 'A', main: false, records: reps },
      { exerciseId: 'b', name: 'B', main: true, records: [] },
      { exerciseId: 'c', name: 'C', main: true, records: heavy },
    ]);
    expect(ms.map((m) => [m.title, m.big])).toEqual([['A', false], ['C', true]]);
  });
  it('the first workout is its own fact: the total lifted, or the sets done; never record words', () => {
    expect(firstWorkoutMoment('s1', '4,250 lb', 9)).toEqual({ id: 'first:s1', kind: 'first_workout', big: true, weight: 0, title: 'First workout', hero: '4,250 lb', caption: 'lifted today', detail: '4,250 lb lifted today' });
    expect(firstWorkoutMoment('s1', null, 1)).toMatchObject({ hero: '1 set', caption: 'done today' });
    expect(firstWorkoutMoment('s1', null, 6)).toMatchObject({ hero: '6 sets' });
  });
});

describe('formatTotalCompact and thousands in records (load.ts)', () => {
  it('is the tile total below a million, a cut short form above', async () => {
    const { formatTotalCompact, formatTotal } = await import('../load');
    expect(formatTotalCompact(4350, 'lb')).toBe(formatTotal(4350, 'lb'));
    expect(formatTotalCompact(999_999, 'lb')).toBe('999,999 lb');
    expect(formatTotalCompact(1_000_000, 'lb')).toBe('1M lb');
    expect(formatTotalCompact(1_239_999, 'kg')).toBe('1.23M kg');
    expect(formatTotalCompact(12_345_678, 'lb')).toBe('12.3M lb');
    expect(formatTotalCompact(123_456_789, 'lb')).toBe('123M lb');
    expect(formatTotalCompact(1_990_000_000, 'lb')).toBe('1.99B lb');
  });
  it('groups the gain like the tiles', () => {
    expect(heavierBy(singleLoad(2205, 'lb'), singleLoad(1000, 'lb'))).toBe('+1,205 lb');
  });
});
