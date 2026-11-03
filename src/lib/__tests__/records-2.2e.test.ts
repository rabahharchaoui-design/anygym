// PLAN 2.2e: live PR badges and the finish lead line, from real history only.
import { describe, expect, it } from 'vitest';
import type { Load } from '../../db/types';
import { barbellLoad, beatsVolume, biggerGain, formatSetWeightFirst, bodyweightLoad, dumbbellLoad, gainRatio, heavierThan, setScore, singleLoad, stackLoad, timedLoad } from '../load';
import type { PastSet } from '../progression';
import { biggestWin, recordSetText, recordSets, type RecordSet } from '../records';

const lb = (total: number): Load => singleLoad(total, 'lb');
const kg = (total: number): Load => singleLoad(total, 'kg');
const bar = (perSide: number[]): Load => barbellLoad(45, perSide, 'none', 'lb')!;
const past = (reps: number, load: Load, kind: PastSet['kind'] = 'work'): PastSet => ({ kind, reps, load });
let n = 0;
const set = (reps: number, load: Load, kind: PastSet['kind'] = 'work'): RecordSet => ({ id: `s${++n}`, kind, reps, load });
const kinds = (today: RecordSet[], before: PastSet[]) => recordSets(today, before).map((r) => [today.findIndex((s) => s.id === r.setId), r.kind]);

describe('load.ts record math', () => {
  it('setScore is weight × reps in the asked unit; 0 for holds, no reps, plain bodyweight', () => {
    expect(setScore({ reps: 6, load: bar([45, 25]) }, 'lb')).toBe(1110);
    expect(setScore({ reps: 8, load: dumbbellLoad(50, 'lb') }, 'lb')).toBe(400); // one dumbbell, as records compare
    expect(setScore({ reps: 10, load: stackLoad(100, 'lb', 25) }, 'lb')).toBe(1250);
    expect(setScore({ reps: 8, load: bodyweightLoad('lb', 25) }, 'lb')).toBe(200);
    expect(setScore({ reps: 12, load: bodyweightLoad('lb') }, 'lb')).toBe(0);
    expect(setScore({ reps: 0, load: lb(100) }, 'lb')).toBe(0);
    expect(setScore({ load: timedLoad('lb') }, 'lb')).toBe(0);
    expect(setScore({ reps: 5, load: kg(100) }, 'lb')).toBeCloseTo(1102.31, 2);
  });
  it('heavierThan never counts conversion noise', () => {
    expect(heavierThan(lb(190), lb(185), 'lb')).toBe(true);
    expect(heavierThan(lb(185), lb(185), 'lb')).toBe(false);
    expect(heavierThan(lb(220.462), kg(100), 'lb')).toBe(false); // the same 100 kg
    expect(heavierThan(kg(100), lb(200), 'kg')).toBe(true);
  });
  it('beatsVolume: same weight needs more reps; otherwise weight × reps', () => {
    expect(beatsVolume({ reps: 6, load: lb(185) }, { reps: 5, load: lb(185) }, 'lb')).toBe(true);
    expect(beatsVolume({ reps: 6, load: lb(185) }, { reps: 6, load: lb(185) }, 'lb')).toBe(false);
    expect(beatsVolume({ reps: 6, load: lb(185) }, { reps: 5, load: lb(225) }, 'lb')).toBe(false);
    expect(beatsVolume({ reps: 5, load: kg(100) }, { reps: 5, load: lb(220.462) }, 'kg')).toBe(false);
    expect(beatsVolume({ reps: 6, load: kg(100) }, { reps: 5, load: lb(220.462) }, 'kg')).toBe(true);
    expect(beatsVolume({ load: timedLoad('lb') }, { reps: 1, load: lb(1) }, 'lb')).toBe(false);
  });
  it('biggerGain ignores floating noise', () => {
    expect(biggerGain(1.025, 1.0250000000001)).toBe(false);
    expect(biggerGain(1.03, 1.02)).toBe(true);
    expect(biggerGain(Number.POSITIVE_INFINITY, 2)).toBe(true);
    expect(biggerGain(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(false);
  });
  it('gainRatio', () => {
    expect(gainRatio(1110, 925)).toBeCloseTo(1.2);
    expect(gainRatio(5, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(gainRatio(0, 0)).toBe(1);
  });
});

describe('recordSets', () => {
  it('never on the first ever session, however many sets', () => {
    expect(recordSets([set(5, lb(185)), set(6, lb(185)), set(8, lb(200))], [])).toEqual([]);
    // Only warm ups or drops before: still a first session of working sets.
    expect(recordSets([set(5, lb(185))], [past(10, lb(95), 'warmup'), past(12, lb(100), 'drop')])).toEqual([]);
  });
  it('185 × 6 after a best of 185 × 5 is a PR; another 185 × 6 is a tie', () => {
    const today = [set(6, lb(185)), set(6, lb(185)), set(7, lb(185))];
    const r = recordSets(today, [past(5, lb(185))]);
    expect(r.map((x) => x.setId)).toEqual([today[0]!.id, today[2]!.id]);
    expect(r[0]).toMatchObject({ kind: 'volume', text: '185 lb × 6, best ever' });
  });
  it('more reps at a lighter weight than an earlier heavier best is not best ever', () => {
    // 225 × 5 (1125) beats 185 × 6 (1110); 185 was lifted before for 5: most reps at this weight.
    const r = recordSets([set(6, lb(185))], [past(5, lb(225)), past(5, lb(185))]);
    expect(r).toEqual([expect.objectContaining({ kind: 'most_reps', text: '185 lb × 6, most reps at this weight' })]);
    // Never lifted at 185 before: nothing at all.
    expect(recordSets([set(6, lb(185))], [past(5, lb(225))])).toEqual([]);
    // A heavier set already did as many reps: nothing.
    expect(recordSets([set(6, lb(185))], [past(6, lb(225)), past(5, lb(185))])).toEqual([]);
  });
  it('heaviest ever for one rep; the biggest gain names it', () => {
    const r = recordSets([set(1, lb(250))], [past(5, lb(225))]);
    expect(r).toEqual([expect.objectContaining({ kind: 'heaviest', text: '250 lb × 1, heaviest ever' })]);
    // Both heavier and more volume: volume gain 1250/1125 beats weight gain 250/225? equal ratios pick volume.
    const both = recordSets([set(5, lb(250))], [past(5, lb(225))]);
    expect(both[0]!.kind).toBe('volume');
  });
  it('warm ups, drops and other load kinds never earn a badge; holds have none', () => {
    const today = [set(20, lb(300), 'warmup'), set(30, lb(300), 'drop'), set(10, dumbbellLoad(80, 'lb'))];
    expect(recordSets(today, [past(5, lb(185))])).toEqual([]);
    expect(recordSets([{ id: 't', kind: 'work', load: timedLoad('lb') }], [past(1, timedLoad('lb'))])).toEqual([]);
  });
  it('kg today against lb history: compared after conversion, noise never wins', () => {
    expect(recordSets([set(5, kg(100))], [past(5, lb(220.462))])).toEqual([]);
    expect(kinds([set(5, kg(102.5))], [past(5, lb(220.462))])).toEqual([[0, 'volume']]);
  });
  it('dumbbells say each; bodyweight added and plain', () => {
    expect(recordSets([set(9, dumbbellLoad(50, 'lb'))], [past(8, dumbbellLoad(50, 'lb'))])[0]!.text).toBe('50 lb each × 9, best ever');
    expect(recordSets([set(8, bodyweightLoad('lb', 25))], [past(8, bodyweightLoad('lb', 20))])[0]!.text).toBe('+25 lb × 8, best ever');
    expect(recordSets([set(12, bodyweightLoad('lb'))], [past(10, bodyweightLoad('lb'))])).toEqual([
      expect.objectContaining({ kind: 'most_reps', text: '12 reps, most reps at this weight' }),
    ]);
    expect(recordSets([set(10, bodyweightLoad('lb'))], [past(10, bodyweightLoad('kg'))])).toEqual([]);
  });
  it('a set without reps never counts and never raises the bar', () => {
    const today: RecordSet[] = [{ id: 'x', kind: 'work', load: lb(400) }, set(6, lb(185))];
    expect(recordSets(today, [past(5, lb(185))]).map((r) => r.setId)).toEqual([today[1]!.id]);
  });
  it('says which earlier set it beat, with its workout date; earlier today without one', () => {
    const r = recordSets([set(6, lb(185)), set(7, lb(185))], [{ ...past(5, lb(185)), date: 111 }, { ...past(4, lb(185)), date: 222 }]);
    expect(r[0]!.beat).toEqual({ text: '185 lb × 5', date: 111 });
    expect(r[1]!.beat).toEqual({ text: '185 lb × 6' }); // the set before it, this workout
    const h = recordSets([set(1, lb(250))], [{ ...past(5, lb(225)), date: 9 }]);
    expect(h[0]!.beat).toEqual({ text: '225 lb × 5', date: 9 });
  });
  it('formatSetWeightFirst: weight first everywhere on the finish screen', () => {
    expect(formatSetWeightFirst({ reps: 6, load: lb(185) })).toBe('185 lb × 6');
    expect(formatSetWeightFirst({ reps: 8, load: dumbbellLoad(50, 'lb') })).toBe('50 lb each × 8');
    expect(formatSetWeightFirst({ reps: 8, load: bodyweightLoad('lb', 25) })).toBe('+25 lb × 8');
    expect(formatSetWeightFirst({ reps: 12, load: bodyweightLoad('lb') })).toBe('12 reps');
    expect(formatSetWeightFirst({ seconds: 45, load: timedLoad('lb') })).toBe('45 s');
    expect(formatSetWeightFirst({ reps: 10 })).toBe('10 reps');
  });
  it('recordSetText', () => {
    expect(recordSetText({ reps: 6, load: bar([45, 25]) })).toBe('185 lb × 6');
    expect(recordSetText({ reps: 10, load: stackLoad(100, 'kg') })).toBe('100 kg × 10');
  });
});

describe('biggestWin', () => {
  it('two PRs of one exercise today: the later, bigger one leads (gain over the history before today)', () => {
    const today = [set(6, lb(185)), set(7, lb(185))];
    const r = recordSets(today, [past(5, lb(185))]);
    expect(r.map((x) => x.gainOverHistory)).toEqual([1.2, 1.4]);
    expect(biggestWin([{ exerciseId: 'sq', name: 'Squat', records: r }])!.text).toBe('Squat 185 lb × 7, best ever');
  });
  it('the largest gain over its own best; ties go to the earlier exercise; null with none', () => {
    const bench = recordSets([set(6, lb(185))], [past(5, lb(185))]); // 1.2
    const squat = recordSets([set(5, lb(250))], [past(5, lb(225))]); // 1.11
    const groups = [
      { exerciseId: 'sq', name: 'Squat', records: squat },
      { exerciseId: 'bp', name: 'Bench', records: bench },
    ];
    expect(biggestWin(groups)).toMatchObject({ exerciseId: 'bp', text: 'Bench 185 lb × 6, best ever' });
    const tie = recordSets([set(6, lb(185))], [past(5, lb(185))]);
    expect(biggestWin([{ exerciseId: 'a', name: 'A', records: bench }, { exerciseId: 'b', name: 'B', records: tie }])!.exerciseId).toBe('a');
    expect(biggestWin([{ exerciseId: 'a', name: 'A', records: [] }])).toBeNull();
    expect(biggestWin([])).toBeNull();
  });
});
