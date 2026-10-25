import { describe, expect, it } from 'vitest';
import type { Draft } from '../drafts';
import { barbellLoad, bodyweightLoad, dumbbellLoad, stackLoad, timedLoad } from '../load';
import { progress } from '../progression';
import {
  SET_TYPES,
  blockedReason,
  lastTimeCell,
  nextSetType,
  pendingRows,
  countModeOf,
  legacyRowKey,
  markSubmitted,
  reconcileRows,
  rowKey,
  shiftAfterLog,
  slotChanges,
  slotsOf,
  storedType,
  typeOfSet,
  weightCell,
  weightHeader,
  type BuildInput,
} from '../setTable';

const bar = (perSide: number[]) => barbellLoad(45, perSide, 'none', 'lb')!;
const b185 = bar([45, 25]);
const setup = { base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none' as const, dumbbellRange: null, stackStep: 5 };

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  count: 4,
  logged: [],
  progression: undefined,
  draftOf: () => null,
  rebuild: (picked) => picked,
  carry: (prev) => prev ?? null,
  certain: null,
  defaultReps: 8,
  defaultType: 'normal',
  ...over,
});

describe('set types', () => {
  it('cycle normal → W → D → F → normal', () => {
    expect(SET_TYPES.map(nextSetType)).toEqual(['warmup', 'drop', 'failure', 'normal']);
  });
  it('store as kind plus a failure flag, and read back', () => {
    for (const t of SET_TYPES) {
      const s = storedType(t);
      expect(typeOfSet(s)).toBe(t);
    }
    expect(storedType('failure')).toEqual({ kind: 'work', failure: true });
    expect(storedType('warmup')).toEqual({ kind: 'warmup', failure: false });
    expect(typeOfSet({ kind: 'work' })).toBe('normal');
  });
  it('row keys are per set number', () => {
    expect(rowKey('squat', 2)).toBe('squat@2');
    expect(legacyRowKey('squat', 2)).toBe('squat#2');
  });
});

describe('pendingRows', () => {
  it('first time: no weight is invented, reps from the plan, plan sets as rows', () => {
    const p = progress({ exerciseId: 'sq', loadKind: 'barbell', unit: 'lb', gym: setup, repRange: [8, 12], history: [] });
    const rows = pendingRows(input({ progression: p }));
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.load).toBeNull();
      expect(r.reps).toBe(8);
      expect(r.edited).toBe(false);
    }
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it('with history: every row prefilled from the engine target, with last time per set', () => {
    const history = [{ date: 1, gymId: 'g', unit: 'lb' as const, sets: [12, 12, 10].map((reps) => ({ kind: 'work' as const, reps, load: b185 })) }];
    const p = progress({ exerciseId: 'sq', loadKind: 'barbell', unit: 'lb', gym: setup, repRange: [8, 12], history });
    const rows = pendingRows(input({ progression: p }));
    expect(rows.map((r) => r.load?.total)).toEqual([185, 185, 185, 185]);
    expect(rows.map((r) => r.reps)).toEqual([12, 12, 11, 11]);
    expect(rows[0]!.lastTime).toEqual({ reps: 12, load: b185 });
    expect(rows[3]!.lastTime).toBeUndefined();
  });

  it('logged sets come first; the rest carry this workout weight when there is no target', () => {
    const rows = pendingRows(input({ logged: [{ reps: 9, load: b185 }] }));
    expect(rows.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(rows[0]!.load).toEqual(b185);
    expect(rows[0]!.reps).toBe(9);
  });

  it('a draft wins and is rebuilt through the callback (plates kept while the bar is unknown)', () => {
    const draft: Draft = { id: 'x', load: null, plates: [10, 5], reps: 11, type: 'drop' };
    const rows = pendingRows(input({ draftOf: (i) => (i === 1 ? draft : null), rebuild: () => null }));
    expect(rows[1]).toMatchObject({ load: null, plates: [10, 5], reps: 11, type: 'drop', edited: true });
  });

  it('bodyweight and holds start from a certain load; holds use the plan seconds', () => {
    const bw = pendingRows(input({ certain: bodyweightLoad('lb') }));
    expect(bw[0]!.load).toEqual({ kind: 'bodyweight', unit: 'lb', total: 0 });
    const hold = pendingRows(input({ certain: timedLoad('lb'), defaultReps: undefined, planSeconds: 45, count: 1 }));
    expect(hold[0]).toMatchObject({ seconds: 45, load: { kind: 'timed' } });
    expect(hold[0]!.reps).toBeUndefined();
  });

  it('no rows when every planned set is logged', () => {
    expect(pendingRows(input({ count: 1, logged: [{ reps: 8, load: b185 }] }))).toEqual([]);
  });

  it('warm up block rows default to W', () => {
    expect(pendingRows(input({ defaultType: 'warmup' }))[0]!.type).toBe('warmup');
  });
});

describe('shiftAfterLog', () => {
  const rows = pendingRows(input({ draftOf: (i) => ({ id: 'd', load: bar([45 - i * 10]), reps: 10 + i }) }));
  it('in order: nothing moves', () => {
    expect(shiftAfterLog(rows, 0, 0)).toEqual([]);
  });
  it('checking a later row first moves the rows between down one place', () => {
    const moves = shiftAfterLog(rows, 0, 2);
    expect(moves.map((m) => [m.index, m.row.reps])).toEqual([
      [1, 10],
      [2, 11],
    ]);
  });
});

describe('blockedReason', () => {
  const row = { load: b185, reps: 8 };
  it('ready rows can log', () => {
    expect(blockedReason('barbell', row)).toBeNull();
  });
  it('no weight: honest reasons', () => {
    expect(blockedReason('barbell', { load: null, reps: 8 }, 0, true)).toBe('Set the bar weight first');
    expect(blockedReason('barbell', { load: null, reps: 8 })).toBe('Pick a weight');
    expect(blockedReason('plate_machine', { load: null, reps: 8 }, 0, true)).toBe('Set the starting weight first');
    expect(blockedReason('dumbbell_each', { load: null, reps: 8 })).toBe('Pick a weight');
  });
  it('holds need a time: a running timer or a planned hold', () => {
    expect(blockedReason('timed', { load: timedLoad('lb') })).toBe('Start the timer');
    expect(blockedReason('timed', { load: timedLoad('lb') }, 3)).toBeNull();
    expect(blockedReason('timed', { load: timedLoad('lb'), seconds: 45 })).toBeNull();
  });
  it('zero reps cannot log', () => {
    expect(blockedReason('barbell', { load: b185, reps: 0 })).toBe('Pick the reps');
  });
});

describe('cell words', () => {
  it('weight cell', () => {
    expect(weightCell('barbell', b185, [45, 25], 'lb')).toBe('185');
    expect(weightCell('dumbbell_each', dumbbellLoad(30, 'lb'), [], 'lb')).toBe('30');
    expect(weightCell('stack', stackLoad(15, 'lb', 2.5), [], 'lb')).toBe('17.5');
    expect(weightCell('bodyweight', bodyweightLoad('lb'), [], 'lb')).toBe('Just you');
    expect(weightCell('bodyweight', bodyweightLoad('lb', 25), [], 'lb')).toBe('+25');
    expect(weightCell('barbell', null, [10, 5], 'lb')).toBe('30 + bar');
    expect(weightCell('plate_machine', null, [45], 'lb')).toBe('90 + start');
    expect(weightCell('barbell', null, [], 'lb')).toBe('');
  });
  it('last time cell', () => {
    expect(lastTimeCell({ reps: 12, load: b185 })).toBe('12 × 185');
    expect(lastTimeCell({ reps: 10, load: dumbbellLoad(30, 'lb') })).toBe('10 × 30');
    expect(lastTimeCell({ reps: 12, load: bodyweightLoad('lb') })).toBe('12 reps');
    expect(lastTimeCell({ reps: 8, load: bodyweightLoad('kg', 10) })).toBe('8 + 10');
    expect(lastTimeCell({ seconds: 45, load: timedLoad('lb') })).toBe('45 s');
    expect(lastTimeCell(undefined)).toBe('');
  });
  it('weight header', () => {
    expect(weightHeader('barbell', 'kg')).toBe('kg');
    expect(weightHeader('dumbbell_each', 'lb')).toBe('lb each');
    expect(weightHeader('bodyweight', 'lb')).toBe('+ lb');
  });
});


describe('PLAN 1.7c round 2', () => {
  it('a planned hold beats last time; LAST TIME uses the last workout as done, warm ups included', () => {
    const hold = progress({ exerciseId: 'p', loadKind: 'timed', unit: 'lb', gym: setup, repRange: null, history: [{ date: 1, gymId: 'g', unit: 'lb', sets: [{ kind: 'work', seconds: 30, load: timedLoad('lb') }] }] });
    const rows = pendingRows(input({ progression: hold, certain: timedLoad('lb'), planSeconds: 60, defaultReps: undefined, count: 2 }));
    expect(rows.map((r) => r.seconds)).toEqual([60, 60]);
    const last = [
      { kind: 'warmup' as const, reps: 10, load: bar([25]) },
      { kind: 'work' as const, reps: 8, load: b185 },
    ];
    const withLast = pendingRows(input({ lastSets: last }));
    expect(withLast[0]!.lastTime).toEqual(last[0]);
    expect(withLast[1]!.lastTime).toEqual(last[1]);
    expect(withLast[2]!.lastTime).toBeUndefined();
    expect(pendingRows(input({ lastSets: null }))[0]!.lastTime).toBeUndefined();
  });
  it('LAST TIME tags warm ups and drops and names another unit', () => {
    expect(lastTimeCell({ kind: 'warmup', reps: 10, load: bar([25]) }, 'lb')).toBe('W 10 × 95');
    expect(lastTimeCell({ kind: 'drop', reps: 12, load: b185 }, 'lb')).toBe('D 12 × 185');
    expect(lastTimeCell({ kind: 'work', reps: 12, load: b185 }, 'kg')).toBe('12 × 185 lb');
    expect(lastTimeCell({ kind: 'work', reps: 8, load: bodyweightLoad('lb', 25) }, 'kg')).toBe('8 + 25 lb');
    expect(lastTimeCell({ kind: 'work', reps: 8, load: bodyweightLoad('lb') }, 'kg')).toBe('8 reps');
  });
  it('reconcileRows: the submitted version is used up, newer edits are kept', () => {
    let n = 0;
    const id = () => `n${++n}`;
    // In order, not edited during the write: used up, the next row moves up.
    const x: Draft = { id: 'x', load: b185, reps: 6, rev: 1 };
    expect(reconcileRows([{ id: 'a', load: b185, reps: 8, rev: 2, submitted: 2 }, x], new Map([['a', 2]]), id)).toEqual([x]);
    // In order, edited during the write (rev 3): the edit stays on that row as the next set.
    expect(reconcileRows([{ id: 'a', load: b185, reps: 9, rev: 3, submitted: 2 }], new Map([['a', 2]]), id)).toEqual([{ id: 'n1', load: b185, reps: 9, rev: 3 }]);
    // Nothing committed: unchanged.
    expect(reconcileRows([x], new Map([['other', 1]]), id)).toBeNull();
  });
});

describe('PLAN 1.7h: stable pending rows', () => {
  let n = 0;
  const id = () => `id${++n}`;
  const d = (i: string, reps: number, more: Partial<Draft> = {}): Draft => ({ id: i, load: b185, reps, rev: 1, ...more });

  it('Codex 1219 (3) case 1: a later submitted row edited during its write keeps the newer revision', () => {
    // Rows 7, 8, 19; row 3 (slot 2) checked first, then edited to 17 while the write runs.
    const slots = [d('a', 7), d('b', 8), d('c', 17, { rev: 2, submitted: 1 })];
    const out = reconcileRows(slots, new Map([['c', 1]]), id)!;
    expect(out.map((r) => r?.reps)).toEqual([7, 8, 17]);
    expect(out[2]!.id).not.toBe('c');
    expect(out[2]!.submitted).toBeUndefined();
  });

  it('Codex 1219 (3) case 2: the current submitted row edited while the next row has a draft: both kept', () => {
    const next = d('n', 12);
    const out = reconcileRows([d('s', 17, { rev: 3, submitted: 2 }), next], new Map([['s', 2]]), id)!;
    expect(out.map((r) => r?.reps)).toEqual([17, 12]);
    expect(out[1]).toBe(next); // moved down one set (the logged count grew), not overwritten
  });

  it('a committed set without a submission (logged before 1.7h) uses the stored submitted mark', () => {
    expect(reconcileRows([d('a', 5, { rev: 2, submitted: 2 })], new Map([['a', undefined]]), id)).toEqual([]);
  });

  it('markSubmitted stores the row values, version and mark; rows above keep what they show', () => {
    const rows = pendingRows(input({ count: 3, defaultReps: 8, certain: b185 }));
    const { slots, draft } = markSubmitted([null, null, d('c', 19, { rev: 4 })], rows, 2, { load: b185, reps: 19, type: 'normal' }, id);
    expect(draft).toMatchObject({ id: 'c', reps: 19, rev: 4, submitted: 4, load: b185 });
    expect(slots[0]).toMatchObject({ load: b185, reps: 8 });
    expect(slots[1]).toMatchObject({ load: b185, reps: 8 });
    expect(slots[0]!.id).not.toBe(slots[1]!.id);
    // A row with no draft yet gets one with a fresh id.
    const first = markSubmitted([], rows, 0, { load: b185, reps: 8, type: 'warmup' }, id);
    expect(first.draft).toMatchObject({ reps: 8, type: 'warmup', submitted: 0 });
    expect(first.slots).toHaveLength(1);
  });

  it('slots are pending rows only: the keys never depend on how many sets are logged', () => {
    const drafts = new Map<string, Draft>([
      [rowKey('squat', 0), d('a', 17)],
      [rowKey('squat', 2), d('c', 5)],
      [rowKey('bench', 0), d('z', 9)],
      ['squat#1', d('old', 1)],
    ]);
    expect(slotsOf(drafts, 'squat').map((x) => x?.id ?? null)).toEqual(['a', null, 'c']);
    const changes = slotChanges('squat', slotsOf(drafts, 'squat'), [d('c', 5)]);
    expect([...changes.keys()].sort()).toEqual(['squat@0', 'squat@2']);
    expect(changes.get('squat@2')).toBeNull();
  });

  it('countModeOf: from the saved set, never today\'s load type (Codex 1149 (2))', () => {
    expect(countModeOf({ reps: 10, load: b185 }, 'timed')).toBe('reps');
    expect(countModeOf({ seconds: 30, load: timedLoad('lb') }, 'barbell')).toBe('seconds');
    expect(countModeOf({ load: timedLoad('lb') }, 'barbell')).toBe('seconds');
    expect(countModeOf({}, 'timed')).toBe('seconds');
    expect(countModeOf({}, undefined)).toBe('reps');
  });
});
