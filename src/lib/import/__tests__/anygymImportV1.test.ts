import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../../data/planExercises';
import { formatWhen, progress } from '../../progression';
import { workoutDate } from '../../../screens/history/historyWords';
import {
  MARKED_UNSURE,
  NOT_OURS,
  NO_WEIGHT,
  contentHash,
  mapPlanExercise,
  normalizeName,
  parseImport,
  parseImportText,
  setsIn,
  type ParsedImport,
} from '../anygymImportV1';
import { IMPORTED_LABEL, isImportOrder } from '../importOrder';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'synthetic-import-v1.json'), 'utf8');
const parsed = (): ParsedImport => {
  const p = parseImportText(FIXTURE);
  if (!p.ok) throw new Error(p.error);
  return p;
};

describe('parseImportText (anygym-import-v1)', () => {
  it('reads the synthetic file: every set, drop sets as their own set, file order kept', () => {
    const p = parsed();
    expect(p.unit).toBe('lb');
    expect(p.exercises.map((e) => e.planExercise)).toEqual(['barbell back-squat', 'Cable Tricep Pushdown', 'Wide Lunge', 'Zercher Moon Press']);
    expect(p.sessions).toHaveLength(5);
    expect(setsIn(p.sessions)).toBe(16);
    expect(p.sessions.map((s) => s.importSeq)).toEqual([1, 2, 3, 4, 5]);
    expect(p.sessions.map((s) => [s.exerciseIndex, s.sessionIndex])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(p.sessions.every((s) => s.imported === true)).toBe(true);
    expect(p.issues).toEqual([]);
    // No dates anywhere: nothing is invented.
    expect(JSON.stringify(p)).not.toMatch(/date|startedAt/i);
  });

  it('keeps every number exactly as written', () => {
    const p = parsed();
    const squat = p.sessions[0]!.sets;
    expect(squat[0]).toMatchObject({ kind: 'warmup', reps: 5, weight: 45, unit: 'lb', loadType: 'barbell_per_side', uncertain: false });
    expect(squat[1]).toMatchObject({ kind: 'work', reps: 8, weight: 70, plates: [45, 25] });
    const cable = p.sessions[2]!.sets;
    expect(cable.map((s) => [s.kind, s.reps, s.weight, s.unit])).toEqual([
      ['work', 12, 50, 'lb'],
      ['work', 12, 50, 'lb'],
      ['work', 10, 55, 'lb'],
      ['drop', 6, 30, 'lb'],
      ['work', 10, 20, 'kg'],
    ]);
    expect(cable[1]!.note).toBe('slow');
    expect(p.sessions[4]!.sets[1]!.note).toBe('5 wide, 4 narrow');
    expect(p.sessions[1]!.note).toBe('Felt strong');
    expect(p.exercises[0]!.note).toBe('High bar');
  });

  it('marks unsure sets with the file reason, and weighted sets with no weight', () => {
    const p = parsed();
    expect(p.sessions[1]!.sets[2]).toMatchObject({ uncertain: true, reason: 'Hard to read: 6 or 8' });
    const lunge = p.sessions[3]!.sets;
    expect(lunge.map((s) => s.loadType)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(lunge[2]).toMatchObject({ reps: 10, uncertain: true, reason: NO_WEIGHT });
    expect(lunge[2]!.weight).toBeUndefined();
    expect(lunge[0]!.uncertain).toBe(false);
  });

  it('rejects anything that is not this format, in one plain sentence', () => {
    expect(parseImportText('not json')).toEqual({ ok: false, error: NOT_OURS });
    expect(parseImport({ format: 'other' })).toEqual({ ok: false, error: NOT_OURS });
    expect(parseImport(null)).toEqual({ ok: false, error: NOT_OURS });
    expect(parseImport({ format: 'anygym-import-v1', unit: 'stone', exercises: [] })).toMatchObject({ ok: false });
    expect(parseImport({ format: 'anygym-import-v1', unit: 'kg', exercises: [] })).toMatchObject({ ok: false, error: 'The file has no exercises.' });
  });

  it('leaves out unreadable lines and says so; odd load types are asked', () => {
    const p = parseImport({
      format: 'anygym-import-v1',
      unit: 'kg',
      exercises: [
        'nope',
        { loadType: 'stack', sessions: [] },
        {
          planExercise: 'Leg Press',
          loadType: 'sled',
          sessions: [
            { sets: [{ reps: 0, weight: 50 }, { reps: 10, weight: -5 }, { reps: 8, weight: 60, uncertain: true }, 'x'] },
            { nothing: true },
            [{ reps: 5, weight: 40, dropTo: { reps: 0 } }],
            { sets: [{ reps: 3, weight: 10, uncertain: true, why: 'Maybe', dropTo: { reps: 2 } }] },
          ],
        },
      ],
    });
    if (!p.ok) throw new Error('should parse');
    expect(p.exercises).toHaveLength(1);
    expect(p.exercises[0]!.loadType).toBe('unknown');
    expect(p.issues.map((i) => i.problem)).toEqual([
      'Not readable',
      'No exercise name',
      'Load type not known: asked on import',
      'No reps: left out',
      'No reps: left out',
      'No sets',
    ]);
    const sets = p.sessions.flatMap((s) => s.sets);
    expect(sets.map((s) => [s.kind, s.reps, s.weight ?? null, s.uncertain, s.reason ?? null])).toEqual([
      ['work', 10, null, true, NO_WEIGHT],
      ['work', 8, 60, true, MARKED_UNSURE],
      ['work', 5, 40, false, null],
      ['work', 3, 10, true, 'Maybe'],
      ['drop', 2, null, true, NO_WEIGHT],
    ]);
    // A keyed exercises object is read in key order, the key standing in for a missing name.
    const keyed = parseImport({ format: 'anygym-import-v1', unit: 'lb', exercises: { 'Plank Row': { loadType: 'bodyweight', sessions: [{ sets: [{ reps: 12 }] }] } } });
    if (!keyed.ok) throw new Error('should parse');
    expect(keyed.exercises[0]!.planExercise).toBe('Plank Row');
    expect(keyed.sessions[0]!.sets[0]).toMatchObject({ reps: 12, uncertain: false });
  });

  it('hashes content, not position in memory: same file, same hashes; any change, a new hash', () => {
    const a = parsed().sessions.map((s) => s.hash);
    const b = parsed().sessions.map((s) => s.hash);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect(a.every((h) => /^[0-9a-f]{16}$/.test(h))).toBe(true);
    expect(contentHash({ x: 1, y: [1, 2] })).toBe(contentHash({ y: [1, 2], x: 1 }));
    expect(contentHash({ x: 1 })).not.toBe(contentHash({ x: 2 }));
  });
});

describe('mapPlanExercise', () => {
  it('exact name first, then a match that ignores case and punctuation, nothing looser', () => {
    expect(mapPlanExercise('Barbell Back Squat', PLAN_EXERCISES)?.id).toBe('barbell-back-squat');
    expect(mapPlanExercise('barbell back-squat', PLAN_EXERCISES)?.id).toBe('barbell-back-squat');
    expect(mapPlanExercise('BARBELL BACK SQUAT!', PLAN_EXERCISES)?.id).toBe('barbell-back-squat');
    expect(mapPlanExercise('Back Squat', PLAN_EXERCISES)).toBeUndefined();
    expect(mapPlanExercise('Zercher Moon Press', PLAN_EXERCISES)).toBeUndefined();
    expect(mapPlanExercise('---', PLAN_EXERCISES)).toBeUndefined();
    expect(normalizeName('Lat Pull-Down (wide)')).toBe('latpulldownwide');
  });
});

describe('imported workouts show "Imported", never a date', () => {
  it('import order is not a time', () => {
    expect(isImportOrder(1)).toBe(true);
    expect(isImportOrder(250)).toBe(true);
    expect(isImportOrder(Date.now())).toBe(false);
    const now = new Date(2026, 9, 24, 12).getTime();
    expect(formatWhen(3, now)).toBe(IMPORTED_LABEL);
    expect(workoutDate(3, now)).toBe('Imported');
    expect(workoutDate(new Date(2026, 9, 24, 8).getTime(), now)).toBe('Sat, Oct 24');
  });
});

describe('progression with sets in two units (imported history)', () => {
  it('100 kg is heavier than 120 lb: the target builds on 100 kg, which keeps its own unit', () => {
    const kg = { kind: 'stack' as const, unit: 'kg' as const, total: 100, stackValue: 100 };
    const lb = { kind: 'stack' as const, unit: 'lb' as const, total: 120, stackValue: 120 };
    const setup = { base: null, plates: [], collars: 'none' as const, dumbbellRange: null, stackStep: 5 };
    const r = progress({ exerciseId: 'x', loadKind: 'stack', unit: 'lb', gym: setup, repRange: [8, 12], history: [{ date: 2, gymId: 'g', unit: 'lb', sets: [{ kind: 'work', reps: 10, load: lb }, { kind: 'work', reps: 10, load: kg }] }] });
    // 100 kg = 220.46 lb: never the lighter 120 lb.
    expect(r.next.load?.total).toBe(220);
    const r2 = progress({ exerciseId: 'x', loadKind: 'stack', unit: 'kg', gym: { ...setup, stackStep: 2.5 }, repRange: [8, 12], history: [{ date: 2, gymId: 'g', unit: 'kg', sets: [{ kind: 'work', reps: 10, load: kg }, { kind: 'work', reps: 10, load: lb }] }] });
    expect(r2.next.load).toMatchObject({ unit: 'kg', total: 100 });
  });
});
