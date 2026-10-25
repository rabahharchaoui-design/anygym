import { describe, expect, it } from 'vitest';
import type { Load, SetKind, Unit } from '../../db/types';
import {
  barbellLoad,
  bodyweightLoad,
  dumbbellLoad,
  loadAt,
  nearestLoadable,
  pickedWeight,
  plateMachineLoad,
  resetWeight,
  sameLoad,
  singleLoad,
  stackLoad,
  stepUp,
  timedLoad,
  type LoadSetup,
} from '../load';
import {
  FIRST_TIME,
  FIRST_TIME_BODYWEIGHT,
  FIRST_TIME_TIMED,
  RESET,
  beatLine,
  formatNext,
  formatSets,
  formatWhen,
  progress,
  type PastSession,
  type ProgressionInput,
  type RepRange,
} from '../progression';

const LB: Omit<LoadSetup, 'unit'> = {
  base: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  collars: 'none',
  dumbbellRange: { min: 5, max: 50, step: 5 },
  stackStep: 5,
};
const KG: Omit<LoadSetup, 'unit'> = {
  base: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  collars: 'none',
  dumbbellRange: { min: 2, max: 40, step: 2 },
  stackStep: 2.5,
};
const setupOf = (unit: Unit, over: Partial<LoadSetup> = {}): LoadSetup => ({ ...(unit === 'lb' ? LB : KG), unit, ...over });

const bar = (total: number, unit: Unit = 'lb'): Load => {
  const s = setupOf(unit);
  const l = loadAt('barbell', total, s);
  if (!l) throw new Error(`not loadable ${total}`);
  return l;
};

const day = (n: number) => new Date(2026, 9, n, 18).getTime();
type S = [reps: number, load: Load, kind?: SetKind];
const session = (date: number, sets: S[], gymId = 'g1'): PastSession => ({
  date,
  gymId,
  unit: sets[0]![1].unit,
  sets: sets.map(([reps, load, kind = 'work']) => ({ kind, reps, load })),
});
const same = (reps: number[], load: Load): S[] => reps.map((r) => [r, load]);

const run = (over: Partial<ProgressionInput> & Pick<ProgressionInput, 'loadKind' | 'history'>) =>
  progress({ exerciseId: 'x', unit: 'lb', gym: LB, repRange: [8, 12] as RepRange, ...over });

describe('rule 5: first time', () => {
  it('no history: no weight, the honest line, the range as reps', () => {
    const p = run({ loadKind: 'barbell', history: [] });
    expect(p.lastTime).toBeNull();
    expect(p.next).toEqual({ load: null, reps: [8, 12], reason: FIRST_TIME, kind: 'first_time' });
    expect(p.next.reason).toBe('First time: pick a weight you could lift 2 more reps with');
    expect(p.perSet).toEqual([]);
  });
  it('a prescription gives empty rows to fill; bodyweight and timed have their own first time line', () => {
    const p = run({ loadKind: 'dumbbell_each', history: [], prescription: { sets: 3, reps: [10, 15] } });
    expect(p.perSet).toEqual([1, 2, 3].map(() => ({ target: { load: null, reps: 10 } })));
    expect(p.next.reps).toEqual([10, 15]);
    expect(run({ loadKind: 'stack', history: [], repRange: null, prescription: { sets: 2, reps: 8 } }).perSet[0]!.target.reps).toBe(8);
    expect(run({ loadKind: 'barbell', history: [], repRange: null }).next.reps).toBeNull();
    expect(run({ loadKind: 'bodyweight', history: [] }).next.reason).toBe(FIRST_TIME_BODYWEIGHT);
    const t = run({ loadKind: 'timed', history: [] });
    expect(t.next).toMatchObject({ reason: FIRST_TIME_TIMED, reps: null, load: null, kind: 'first_time' });
  });
  it('history of another load kind, or only warmups, is not this exercise as loaded now', () => {
    const h = [session(day(20), same([12, 12], dumbbellLoad(30, 'lb'))), session(day(18), [[10, bar(135), 'warmup']])];
    expect(run({ loadKind: 'barbell', history: h }).next.kind).toBe('first_time');
  });
});

describe('rule 2: every working set at the top, same load → one step up', () => {
  it('barbell lb: +5 lb total, start at the bottom of the range', () => {
    const p = run({ loadKind: 'barbell', history: [session(day(20), same([12, 12, 12], bar(185)))] });
    expect(p.next.kind).toBe('increase');
    expect(p.next.load).toEqual(barbellLoad(45, [45, 25, 2.5], 'none', 'lb'));
    expect(p.next.load!.total).toBe(190);
    expect(p.next.reps).toEqual([8, 12]);
    expect(p.next.reason).toBe('All sets hit 12. Time to go up');
    expect(p.perSet.map((r) => r.target.reps)).toEqual([8, 8, 8]);
    expect(p.perSet[0]!.lastTime).toEqual({ reps: 12, load: bar(185) });
    expect(p.lastTime).toEqual({ date: day(20), sets: same([12, 12, 12], bar(185)).map(([reps, load]) => ({ reps, load })) });
  });
  it('barbell kg: +2.5 kg', () => {
    const p = run({ loadKind: 'barbell', unit: 'kg', gym: KG, history: [session(day(20), same([12, 12], bar(100, 'kg')))] });
    expect(p.next.load!.total).toBe(102.5);
    expect(p.next.load!.unit).toBe('kg');
  });
  it('plate machine: +5 lb on a plates only machine', () => {
    const s = setupOf('lb', { base: 0 });
    const last = loadAt('plate_machine', 90, s)!;
    expect(last).toEqual(plateMachineLoad(0, [45], 'lb'));
    const p = run({ loadKind: 'plate_machine', gym: { ...LB, base: 0 }, history: [session(day(20), same([12, 12], last))] });
    expect(p.next.load!.total).toBe(95);
  });
  it('dumbbells: the next dumbbell up in this gym', () => {
    const p = run({ loadKind: 'dumbbell_each', history: [session(day(20), same([12, 12, 12], dumbbellLoad(30, 'lb')))] });
    expect(p.next.load).toEqual(dumbbellLoad(35, 'lb'));
    const one = run({ loadKind: 'single', history: [session(day(20), same([12], singleLoad(20, 'lb')))] });
    expect(one.next.load).toEqual(singleLoad(25, 'lb'));
  });
  it('dumbbells at the top of the rack: same weight, one more rep each set', () => {
    const p = run({ loadKind: 'dumbbell_each', history: [session(day(20), same([12, 12], dumbbellLoad(50, 'lb')))] });
    expect(p.next).toMatchObject({ load: dumbbellLoad(50, 'lb'), kind: 'beat_reps', reason: 'Heaviest weight here. Add a rep to each set' });
    expect(p.perSet.map((r) => r.target.reps)).toEqual([13, 13]);
  });
  it('stack: the next pin, keeping an add on weight', () => {
    const p = run({ loadKind: 'stack', history: [session(day(20), same([12, 12], stackLoad(100, 'lb')))] });
    expect(p.next.load).toEqual(stackLoad(105, 'lb'));
    const withAdd = run({ loadKind: 'stack', history: [session(day(20), same([12, 12], stackLoad(100, 'lb', 5)))] });
    expect(withAdd.next.load).toEqual(stackLoad(105, 'lb', 5));
    // PLAN 1.7c: 300 lb is only the first display range ("More" adds pins), so the next pin is 305.
    const top = run({ loadKind: 'stack', history: [session(day(20), same([12], stackLoad(300, 'lb')))] });
    expect(top.next).toMatchObject({ load: stackLoad(305, 'lb'), kind: 'increase' });
  });
  it('a full sleeve: same weight, more reps', () => {
    const s = setupOf('lb', { plates: [45] });
    const max = nearestLoadable('barbell', 5000, s)!;
    const p = run({ loadKind: 'barbell', gym: { ...LB, plates: [45] }, history: [session(day(20), same([12], loadAt('barbell', max, s)!))] });
    expect(p.next.kind).toBe('beat_reps');
    expect(p.next.load!.total).toBe(max);
  });
  it('bodyweight: +1 rep a set, then after 3 sessions at the top, add weight', () => {
    const bw = bodyweightLoad('lb');
    const one = run({ loadKind: 'bodyweight', history: [session(day(20), same([12, 12], bw)), session(day(18), same([10, 9], bw))] });
    expect(one.next).toMatchObject({ load: bw, kind: 'increase', reps: 13, reason: 'All sets hit 12. Add 1 rep a set' });
    expect(one.perSet.map((r) => r.target.reps)).toEqual([13, 13]);
    const two = run({ loadKind: 'bodyweight', history: [session(day(20), same([12, 12], bw)), session(day(18), same([12, 12], bw))] });
    expect(two.next.reason).toBe('All sets hit 12. Add 1 rep a set');
    const three = run({
      loadKind: 'bodyweight',
      history: [session(day(22), same([13, 13], bw)), session(day(20), same([12, 12], bw)), session(day(18), same([12, 12], bw))],
    });
    expect(three.next).toMatchObject({ kind: 'increase', reason: '3 sessions at the top: try adding weight', reps: 14 });
    // A prescription keeps its reps.
    expect(run({ loadKind: 'bodyweight', prescription: { sets: 2, reps: 12 }, history: [session(day(20), same([12, 12], bw))] }).next.reps).toBe(12);
  });
  it('not the same load on every set: no step up', () => {
    const p = run({ loadKind: 'barbell', history: [session(day(20), [[12, bar(185)], [12, bar(175)]])] });
    expect(p.next.kind).toBe('beat_reps');
    expect(p.next.load!.total).toBe(185);
  });
});

describe('rule 3: below the bottom two sessions in a row → ~10% lighter', () => {
  it('resets to a loadable weight and says why', () => {
    const h = [session(day(22), same([8, 7, 6], bar(185))), session(day(20), same([9, 7], bar(185)))];
    const p = run({ loadKind: 'barbell', history: h });
    expect(p.next.kind).toBe('reset');
    expect(p.next.reason).toBe(RESET);
    expect(p.next.reason).toBe('Reset and build back up');
    expect(p.next.load!.total).toBe(165); // 166.5 → 165
    expect(p.perSet.map((r) => r.target.reps)).toEqual([12, 12, 12]);
  });
  it('one bad session does NOT reset', () => {
    const h = [session(day(22), same([8, 7, 6], bar(185))), session(day(20), same([10, 9], bar(185)))];
    const p = run({ loadKind: 'barbell', history: h });
    expect(p.next.kind).toBe('beat_reps');
    expect(p.next.load!.total).toBe(185);
    expect(p.next.reason).toBe('Aim for 9, 7, 6 or better');
  });
  it('dumbbells and stacks reset to their own steps; bodyweight never resets', () => {
    const d = run({ loadKind: 'dumbbell_each', history: [session(day(22), same([6], dumbbellLoad(40, 'lb'))), session(day(20), same([7], dumbbellLoad(40, 'lb')))] });
    expect(d.next.load).toEqual(dumbbellLoad(35, 'lb'));
    const s = run({ loadKind: 'stack', history: [session(day(22), same([6], stackLoad(100, 'lb'))), session(day(20), same([7], stackLoad(100, 'lb')))] });
    expect(s.next.load).toEqual(stackLoad(90, 'lb'));
    const bw = bodyweightLoad('lb');
    expect(run({ loadKind: 'bodyweight', history: [session(day(22), same([5], bw)), session(day(20), same([6], bw))] }).next.kind).toBe('beat_reps');
  });
});

describe('rule 4: same load, beat the reps', () => {
  it('+1 on the first set that missed the top (the SPEC example)', () => {
    const p = run({ loadKind: 'barbell', history: [session(day(20), same([12, 12, 10], bar(185)))] });
    expect(p.next).toMatchObject({ kind: 'beat_reps', reason: 'Aim for 12, 12, 11 or better', reps: [8, 12] });
    expect(p.next.load).toEqual(bar(185));
    expect(p.perSet.map((r) => r.target.reps)).toEqual([12, 12, 11]);
    const q = run({ loadKind: 'barbell', history: [session(day(20), same([12, 11, 10], bar(185)))] });
    expect(q.next.reason).toBe('Aim for 12, 12, 10 or better');
  });
  it('no rep range (quick workout): the last reps are the target, never an invented range', () => {
    const p = run({ loadKind: 'barbell', repRange: null, history: [session(day(20), same([10, 10], bar(185)))] });
    expect(p.next).toEqual({ load: bar(185), reps: 10, reason: 'Aim for 10, 10 or better', kind: 'beat_reps' });
    expect(p.perSet.map((r) => r.target)).toEqual([
      { load: bar(185), reps: 10 },
      { load: bar(185), reps: 10 },
    ]);
  });
});

describe('rule 1: working sets only', () => {
  it('warmups and drops are ignored', () => {
    const h = [
      session(day(20), [
        [10, bar(95), 'warmup'],
        [5, bar(135), 'warmup'],
        [12, bar(185)],
        [12, bar(185)],
        [6, bar(135), 'drop'],
      ]),
    ];
    const p = run({ loadKind: 'barbell', history: h });
    expect(p.next.kind).toBe('increase');
    expect(p.next.load!.total).toBe(190);
    expect(p.lastTime!.sets).toHaveLength(2);
  });
});

describe('rule 6: a prescription sets the reps, the load still follows the rules', () => {
  it('overrides reps and the number of rows', () => {
    const p = run({ loadKind: 'barbell', prescription: { sets: 4, reps: 5 }, history: [session(day(20), same([12, 12, 12], bar(185)))] });
    expect(p.next.kind).toBe('increase');
    expect(p.next.load!.total).toBe(190);
    expect(p.next.reps).toBe(5);
    expect(p.perSet.map((r) => r.target.reps)).toEqual([5, 5, 5, 5]);
    expect(p.perSet[3]!.lastTime).toBeUndefined();
  });
  it('a prescribed range doubles as the range when the exercise has none, and clamps the targets', () => {
    const p = run({ loadKind: 'barbell', repRange: null, prescription: { sets: 3, reps: [6, 8] }, history: [session(day(20), same([10, 10], bar(185)))] });
    expect(p.next.kind).toBe('increase');
    expect(p.perSet.map((r) => r.target.reps)).toEqual([6, 6, 6]);
    const q = run({ loadKind: 'barbell', prescription: { sets: 2, reps: [10, 12] }, history: [session(day(20), same([12, 8], bar(185)))] });
    expect(q.perSet.map((r) => r.target.reps)).toEqual([12, 10]);
    expect(q.next.reason).toBe('Aim for 12, 10 or better');
  });
});

describe('rule 7: another unit → converted, rounded to a loadable weight here', () => {
  it('lb history in a kg gym shows both', () => {
    const p = run({ loadKind: 'barbell', unit: 'kg', gym: KG, repRange: null, history: [session(day(20), same([10, 10], bar(60)))] });
    expect(p.next.kind).toBe('converted');
    expect(p.next.load!.total).toBe(27.5);
    expect(p.next.load!.unit).toBe('kg');
    expect(p.next.reason).toBe('≈ 27.5 kg, last time 60 lb');
    expect(p.lastTime!.sets[0]!.load.unit).toBe('lb');
  });
  it('rules still apply after converting; kg dumbbells into a lb gym', () => {
    const p = run({ loadKind: 'barbell', unit: 'kg', gym: KG, history: [session(day(20), same([12, 12], bar(185)))] });
    // 185 lb = 83.9 kg → 85 kg loadable, +2.5 → 87.5 kg
    expect(p.next.load!.total).toBe(87.5);
    expect(p.next.reason).toBe('≈ 87.5 kg, last time 185 lb');
    const d = run({ loadKind: 'dumbbell_each', repRange: null, history: [session(day(20), same([10], dumbbellLoad(12, 'kg')))] });
    expect(d.next.load).toEqual(dumbbellLoad(25, 'lb'));
    expect(d.next.reason).toBe('≈ 25 lb, last time 12 kg');
  });
});

describe('never a fake number', () => {
  it('unknown bar → no weight, says what to do', () => {
    const p = run({ loadKind: 'barbell', gym: { ...LB, base: null }, history: [session(day(20), same([12, 12], bar(185)))] });
    expect(p.next.load).toBeNull();
    expect(p.next.reason).toBe('Set the bar weight to see your next weight');
    expect(p.perSet[0]!.target.load).toBeNull();
    const m = run({ loadKind: 'plate_machine', gym: { ...LB, base: null }, history: [session(day(20), same([10], plateMachineLoad(0, [45], 'lb')!))] });
    expect(m.next.reason).toBe('Set the starting weight to see your next weight');
  });
  it('no dumbbells here, or added bodyweight in another unit → no weight', () => {
    const d = run({ loadKind: 'dumbbell_each', gym: { ...LB, dumbbellRange: null }, history: [session(day(20), same([10], dumbbellLoad(30, 'lb')))] });
    expect(d.next.load).toBeNull();
    expect(d.next.reason).toBe('No matching weight here: pick the closest you have');
    const bw = run({ loadKind: 'bodyweight', history: [session(day(20), same([10], bodyweightLoad('kg', 10)))] });
    expect(bw.next.load).toBeNull();
    // Just you converts to just you.
    expect(run({ loadKind: 'bodyweight', history: [session(day(20), same([10], bodyweightLoad('kg')))] }).next.load).toEqual(bodyweightLoad('lb'));
  });
  it('a weight this gym lacks rounds to the closest it has', () => {
    const p = run({ loadKind: 'dumbbell_each', repRange: null, history: [session(day(20), same([10], dumbbellLoad(60, 'lb')))] });
    expect(p.next.load).toEqual(dumbbellLoad(50, 'lb'));
  });
});

describe('timed: no load progression, only beat the time', () => {
  it('beat your best hold', () => {
    const t = timedLoad('lb');
    const h: PastSession[] = [{ date: day(20), gymId: 'g1', unit: 'lb', sets: [{ kind: 'work', seconds: 45, load: t }, { kind: 'work', seconds: 40, load: t }] }];
    const p = run({ loadKind: 'timed', history: h });
    expect(p.next).toEqual({ load: t, reps: null, seconds: 45, reason: 'Beat your time', kind: 'beat_reps' });
    expect(p.perSet.map((r) => r.target.seconds)).toEqual([45, 40]);
    expect(formatNext(p.next)).toBe('45 s');
    const q = run({ loadKind: 'timed', prescription: { sets: 3, reps: 1 }, history: [{ ...h[0]!, sets: [{ kind: 'work', load: t }] }] });
    expect(q.perSet.map((r) => r.target.seconds)).toEqual([0, 0, 0]);
    expect(formatNext({ ...q.next, seconds: undefined })).toBe('0 s');
  });
});

describe('words for the set card', () => {
  it('formatNext', () => {
    expect(formatNext({ load: bar(190), reps: [8, 12], reason: '', kind: 'increase' })).toBe('8 to 12 × 190 lb');
    expect(formatNext({ load: dumbbellLoad(30, 'lb'), reps: 10, reason: '', kind: 'beat_reps' })).toBe('10 × 30 lb each');
    expect(formatNext({ load: bodyweightLoad('lb'), reps: 13, reason: '', kind: 'increase' })).toBe('13 reps');
    expect(formatNext({ load: bodyweightLoad('lb', 25), reps: 8, reason: '', kind: 'beat_reps' })).toBe('8 reps + 25 lb');
    expect(formatNext({ load: null, reps: 8, reason: '', kind: 'first_time' })).toBeNull();
    expect(formatNext({ load: bar(185), reps: null, reason: '', kind: 'beat_reps' })).toBeNull();
  });
  it('formatSets', () => {
    expect(formatSets(same([12, 12, 10], bar(185)).map(([reps, load]) => ({ reps, load })))).toBe('12 × 185 · 12 × 185 · 10 × 185 lb');
    expect(formatSets([{ reps: 10, load: dumbbellLoad(30, 'lb') }, { reps: 9, load: dumbbellLoad(30, 'lb') }])).toBe('10 × 30 · 9 × 30 lb each');
    expect(formatSets([{ reps: 12, load: bodyweightLoad('lb') }, { reps: 10, load: bodyweightLoad('lb') }])).toBe('12 · 10 reps');
    expect(formatSets([{ seconds: 45, load: timedLoad('lb') }, { load: timedLoad('lb') }])).toBe('45 s · 0 s');
    expect(formatSets([{ reps: 8, load: bodyweightLoad('lb', 25) }, { reps: 8, load: bodyweightLoad('lb') }])).toBe('8 + 25 lb · 8 reps');
    expect(formatSets([{ reps: 10, load: bar(60, 'kg') }, { load: dumbbellLoad(20, 'lb') }])).toBe('10 × 60 kg · 0 × 20 lb each');
    expect(formatSets([{ reps: 10, load: stackLoad(100, 'lb', 5) }])).toBe('10 × 105 lb');
  });
  it('formatWhen', () => {
    const now = new Date(2026, 9, 24, 9).getTime(); // a Saturday
    expect(formatWhen(new Date(2026, 9, 24, 7).getTime(), now)).toBe('today');
    expect(formatWhen(new Date(2026, 9, 23, 22).getTime(), now)).toBe('yesterday');
    expect(formatWhen(new Date(2026, 9, 20, 18).getTime(), now)).toBe('Tue');
    expect(formatWhen(new Date(2026, 9, 12, 18).getTime(), now)).toBe('Oct 12');
  });
});

describe('load.ts progression helpers', () => {
  const s = setupOf('lb');
  it('pickedWeight', () => {
    expect(pickedWeight(bar(185))).toBe(185);
    expect(pickedWeight(dumbbellLoad(30, 'lb'))).toBe(30);
    expect(pickedWeight(singleLoad(20, 'lb'))).toBe(20);
    expect(pickedWeight(stackLoad(100, 'lb', 5))).toBe(100);
    expect(pickedWeight({ kind: 'stack', unit: 'lb', total: 50 })).toBe(50);
    expect(pickedWeight(bodyweightLoad('lb'))).toBe(0);
    expect(pickedWeight(bodyweightLoad('lb', 25))).toBe(25);
    expect(pickedWeight(timedLoad('lb'))).toBeNull();
  });
  it('sameLoad', () => {
    expect(sameLoad(bar(185), bar(185))).toBe(true);
    expect(sameLoad(bar(185), bar(190))).toBe(false);
    expect(sameLoad(bodyweightLoad('lb', 10), bodyweightLoad('lb'))).toBe(false);
    expect(sameLoad(stackLoad(100, 'lb'), { kind: 'stack', unit: 'kg', total: 100, stackValue: 100 })).toBe(false);
  });
  it('loadAt only makes loads the gym can make exactly', () => {
    expect(loadAt('barbell', 186, s)).toBeNull();
    expect(loadAt('barbell', 185, { ...s, base: null })).toBeNull();
    expect(loadAt('barbell', 185, { ...s, collars: 'competition' })).toBeNull();
    expect(loadAt('dumbbell_each', 33, s)).toBeNull();
    expect(loadAt('single', 20, { ...s, dumbbellRange: null })).toBeNull();
    expect(loadAt('stack', 7, s)).toBeNull();
    expect(loadAt('stack', 305, s)).toEqual(stackLoad(305, 'lb'));
    expect(loadAt('stack', 0, s)).toBeNull();
    expect(loadAt('bodyweight', 10, s)).toEqual(bodyweightLoad('lb', 10));
    expect(loadAt('timed', 0, s)).toEqual(timedLoad('lb'));
  });
  it('nearestLoadable, stepUp, resetWeight', () => {
    expect(nearestLoadable('plate_machine', 93, { ...s, base: 0 })).toBe(95);
    expect(nearestLoadable('stack', 7, s)).toBe(5);
    expect(nearestLoadable('timed', 7, s)).toBeNull();
    expect(nearestLoadable('bodyweight', 4.5, s)).toBeNull();
    expect(stepUp('barbell', 185, { ...s, plates: [] })).toBeNull();
    expect(stepUp('barbell', 135, { ...s, plates: [45, 10] })).toBe(155); // +20: one pair of 10s is the smallest step
    expect(stepUp('single', 20, { ...s, dumbbellRange: null })).toBeNull();
    expect(stepUp('bodyweight', 0, s)).toBeNull();
    expect(stepUp('timed', 0, s)).toBeNull();
    expect(resetWeight('barbell', 225, s)).toBe(200); // 202.5: a tie between 200 and 205 goes lighter
  });
});

describe('beatLine: the one target line, words only from progress()', () => {
  it('"Beat last time: 11 reps at 185 lb" from the first set\'s target and next load', () => {
    const p = run({ loadKind: 'barbell', history: [session(day(20), same([10, 10, 10, 10], bar(185)))] });
    expect(beatLine(p)).toBe('Beat last time: 11 reps at 185 lb');
  });
  it('a step up quotes the new weight and the bottom of the range', () => {
    const p = run({ loadKind: 'barbell', history: [session(day(20), same([12, 12], bar(185)))] });
    expect(beatLine(p)).toBe('Beat last time: 8 reps at 190 lb');
  });
  it('dumbbells say each, bodyweight says reps (plus any added weight), holds say seconds', () => {
    const db = run({ loadKind: 'dumbbell_each', history: [session(day(20), same([10, 10], dumbbellLoad(30, 'lb')))] });
    expect(beatLine(db)).toBe('Beat last time: 11 reps at 30 lb each');
    const bw = run({ loadKind: 'bodyweight', history: [session(day(20), same([9, 9], bodyweightLoad('lb')))] });
    expect(beatLine(bw)).toBe('Beat last time: 10 reps');
    const added = run({ loadKind: 'bodyweight', history: [session(day(20), same([9, 9], bodyweightLoad('lb', 25)))] });
    expect(beatLine(added)).toBe('Beat last time: 10 reps + 25 lb');
    const hold = progress({ exerciseId: 'x', unit: 'lb', gym: LB, repRange: null, loadKind: 'timed', history: [{ date: day(20), gymId: 'g1', unit: 'lb', sets: [{ kind: 'work', seconds: 45, load: timedLoad('lb') }] }] });
    expect(beatLine(hold)).toBe('Beat last time: 45 s');
  });
  it('nothing to beat: first time, or no load (the reason says why)', () => {
    expect(beatLine(run({ loadKind: 'barbell', history: [] }))).toBeNull();
    const noBar = progress({ exerciseId: 'x', unit: 'lb', gym: { ...LB, base: null }, loadKind: 'barbell', repRange: [8, 12], history: [session(day(20), same([10], bar(185)))] });
    expect(beatLine(noBar)).toBeNull();
  });
});

describe('equivalent loads in mixed units count as the same load (PLAN 1.7k)', () => {
  it('20 kg and 44.09245 lb dumbbells both at the top step up to 22 kg', () => {
    const p = progress({
      exerciseId: 'x',
      unit: 'kg',
      gym: KG,
      repRange: [8, 12],
      loadKind: 'dumbbell_each',
      history: [session(day(10), [[12, dumbbellLoad(20, 'kg')], [12, dumbbellLoad(44.09245, 'lb')]])],
    });
    expect(p.next.kind).toBe('increase');
    expect(pickedWeight(p.next.load!)).toBe(22);
  });
  it('unequal resistance in mixed units does not step up', () => {
    const p = progress({
      exerciseId: 'x',
      unit: 'kg',
      gym: KG,
      repRange: [8, 12],
      loadKind: 'dumbbell_each',
      history: [session(day(10), [[12, dumbbellLoad(20, 'kg')], [12, dumbbellLoad(40, 'lb')]])],
    });
    expect(p.next.kind).not.toBe('increase');
  });
  it('bodyweight with the same added weight in kg and lb reaches the three session nudge', () => {
    const kg = bodyweightLoad('kg', 10);
    const lb = bodyweightLoad('lb', 22.0462262);
    const p = progress({
      exerciseId: 'x',
      unit: 'kg',
      gym: KG,
      repRange: [8, 12],
      loadKind: 'bodyweight',
      history: [session(day(12), same([12, 12], kg)), session(day(11), same([12, 12], lb)), session(day(10), [[12, kg], [12, lb]])],
    });
    expect(p.next.reason).toBe('3 sessions at the top: try adding weight');
  });
  it('a 100 + 25 stack and a 125 pin are the same load: the step up applies', () => {
    const p = run({ loadKind: 'stack', history: [session(day(10), [[12, stackLoad(100, 'lb', 25)], [12, stackLoad(125, 'lb')]])] });
    expect(p.next.kind).toBe('increase');
  });
});
