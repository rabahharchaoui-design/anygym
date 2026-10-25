import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../../data/planExercises';
import { makeGym } from '../../../db/gyms';
import type { Gym, Load } from '../../../db/types';
import { loadSetupFor, machineIdFor } from '../../../screens/workout/exerciseLoad';
import { machineStartFor } from '../../../db/gyms';
import { NO_WEIGHT, parseImportText, type ImportedSet, type ParsedImport } from '../anygymImportV1';
import {
  ASK_LOAD,
  NOT_LOADABLE,
  NO_PLATES,
  SKIP,
  SMITH_UNKNOWN,
  START_UNKNOWN,
  buildLoad,
  chooseKind,
  emptyChoices,
  fileSetText,
  kindOf,
  planImport,
  setKey,
  type LoadContext,
  type ReviewChoices,
} from '../importPlan';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'synthetic-import-v1.json'), 'utf8');
const parsed = (): ParsedImport => {
  const p = parseImportText(FIXTURE);
  if (!p.ok) throw new Error(p.error);
  return p;
};

const gymLb = (): Gym => makeGym({ name: 'Test gym', type: 'full', unit: 'lb' }, 1);
const ctxOf =
  (gym: Gym) =>
  (id: string, name: string): LoadContext => ({
    gymUnit: gym.unit,
    olympic: gym.bars.olympic,
    smith: gym.bars.smith,
    machineStart: machineStartFor(gym, machineIdFor(id, name)),
    setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, id, name) }),
  });
const deps = (gym = gymLb(), existing: Set<string> = new Set()) => ({ planExercises: PLAN_EXERCISES, contextFor: ctxOf(gym), existing });

const set = (over: Partial<ImportedSet>): ImportedSet => ({ kind: 'work', reps: 10, unit: 'lb', loadType: 'stack', uncertain: false, ...over });
const ctx = (over: Partial<LoadContext> = {}): LoadContext => ({ ...ctxOf(gymLb())('x', 'X'), ...over });

describe('buildLoad: loads only from the file numbers, through load.ts', () => {
  it('each file load type', () => {
    expect(buildLoad(set({ loadType: 'dumbbell_each', weight: 30 }), undefined, ctx()).load).toEqual({ kind: 'dumbbell_each', unit: 'lb', total: 60 });
    expect(buildLoad(set({ loadType: 'single_weight', weight: 50 }), undefined, ctx()).load).toEqual({ kind: 'single', unit: 'lb', total: 50 });
    expect(buildLoad(set({ loadType: 'held_weight', weight: 25 }), undefined, ctx()).load?.total).toBe(25);
    expect(buildLoad(set({ loadType: 'fixed_bar_total', weight: 60 }), undefined, ctx()).load?.total).toBe(60);
    expect(buildLoad(set({ loadType: 'stack', weight: 115 }), undefined, ctx()).load).toEqual({ kind: 'stack', unit: 'lb', total: 115, stackValue: 115 });
    expect(buildLoad(set({ loadType: 'bodyweight' }), undefined, ctx()).load).toEqual({ kind: 'bodyweight', unit: 'lb', total: 0 });
    expect(buildLoad(set({ loadType: 'bodyweight', weight: 25 }), undefined, ctx()).load).toMatchObject({ kind: 'bodyweight', total: 25, added: 25 });
  });

  it('barbell per side: Olympic bar + 2 × the side, plates kept when they add up', () => {
    const b = buildLoad(set({ loadType: 'barbell_per_side', weight: 70, plates: [45, 25] }), undefined, ctx()).load!;
    expect(b).toMatchObject({ kind: 'barbell', total: 185, barWeight: 45, perSide: [45, 25], barId: 'olympic' });
    const odd = buildLoad(set({ loadType: 'barbell_per_side', weight: 70, plates: [45, 20] }), undefined, ctx()).load!;
    // Listed plates that do not add up: real plates that do, heaviest first (the diagram draws only real plates).
    expect(odd.perSide).toEqual([45, 25]);
    expect(odd.total).toBe(185);
    expect(buildLoad(set({ loadType: 'barbell_per_side', weight: 70 }), undefined, ctx()).load?.perSide).toEqual([45, 25]);
    // No real plates weigh that: reps only, the number kept in the note.
    expect(buildLoad(set({ loadType: 'barbell_per_side', weight: 0.3 }), undefined, ctx())).toEqual({ reason: NO_PLATES, note: '0.3 lb per side' });
    // A kg set in a lb gym: the standard kg Olympic bar, never converted.
    expect(buildLoad(set({ loadType: 'barbell_per_side', weight: 20, unit: 'kg' }), undefined, ctx()).load).toMatchObject({ unit: 'kg', total: 60, barWeight: 20 });
    // No Olympic bar known at this gym: the standard one.
    expect(buildLoad(set({ loadType: 'barbell_per_side', weight: 45 }), undefined, ctx({ olympic: null })).load?.total).toBe(135);
  });

  it('Smith and plate machines need this gym\'s base; until then reps only, the side kept in the note', () => {
    expect(buildLoad(set({ loadType: 'smith_per_side', weight: 45 }), undefined, ctx())).toEqual({ reason: SMITH_UNKNOWN, note: '45 lb per side' });
    expect(buildLoad(set({ loadType: 'smith_per_side', weight: 45 }), undefined, ctx({ smith: 0 })).load).toMatchObject({ kind: 'barbell', total: 90, barId: 'smith' });
    expect(buildLoad(set({ loadType: 'smith_per_side', weight: 45 }), undefined, ctx({ smith: 15 })).load?.total).toBe(105);
    expect(buildLoad(set({ loadType: 'smith_per_side', weight: 20, unit: 'kg' }), undefined, ctx({ smith: 15 })).reason).toBe(SMITH_UNKNOWN);
    expect(buildLoad(set({ loadType: 'plate_machine_per_side', weight: 90, plates: [45, 45] }), undefined, ctx())).toEqual({ reason: START_UNKNOWN, note: '90 lb per side' });
    expect(buildLoad(set({ loadType: 'plate_machine_per_side', weight: 90, plates: [45, 45] }), undefined, ctx({ machineStart: 0 })).load).toMatchObject({ kind: 'plate_machine', total: 180, perSide: [45, 45] });
  });

  it('no weight: no load and the reason; unknown load type waits for the answer', () => {
    expect(buildLoad(set({ loadType: 'stack' }), undefined, ctx())).toEqual({ reason: NO_WEIGHT });
    expect(buildLoad(set({ loadType: 'unknown', weight: 20 }), undefined, ctx())).toEqual({ reason: ASK_LOAD });
    expect(buildLoad(set({ loadType: 'unknown', weight: 20 }), 'timed', ctx())).toEqual({ reason: ASK_LOAD });
    expect(buildLoad(set({ loadType: 'unknown', weight: 20 }), 'dumbbell_each', ctx()).load?.total).toBe(40);
    expect(buildLoad(set({ loadType: 'unknown', weight: 20 }), 'single', ctx()).load?.total).toBe(20);
    expect(buildLoad(set({ loadType: 'unknown', weight: 20 }), 'stack', ctx()).load?.stackValue).toBe(20);
    expect(buildLoad(set({ loadType: 'unknown', weight: 20 }), 'bodyweight', ctx()).load).toMatchObject({ kind: 'bodyweight', added: 20 });
    expect(buildLoad(set({ loadType: 'unknown' }), 'bodyweight', ctx()).load?.total).toBe(0);
    // Bar or plate machine: the number is the total, only if this gym can make it exactly.
    expect(buildLoad(set({ loadType: 'unknown', weight: 135 }), 'barbell', ctx()).load).toMatchObject({ kind: 'barbell', total: 135, perSide: [45] });
    // Cannot be built (or another unit): the file's number, unit and reading are never dropped.
    expect(buildLoad(set({ loadType: 'unknown', weight: 136 }), 'barbell', ctx())).toEqual({
      reason: `${NOT_LOADABLE}: 136 lb as plates on a bar`,
      note: 'In your file: 136 lb total, read as plates on a bar',
    });
    expect(buildLoad(set({ loadType: 'unknown', weight: 135, unit: 'kg' }), 'barbell', ctx())).toEqual({
      reason: `${NOT_LOADABLE}: 135 kg as plates on a bar`,
      note: 'In your file: 135 kg total, read as plates on a bar',
    });
    expect(buildLoad(set({ loadType: 'unknown', weight: 90 }), 'plate_machine', ctx())).toEqual({
      reason: `${NOT_LOADABLE}: 90 lb as plates on a machine`,
      note: 'In your file: 90 lb total, read as plates on a machine',
    });
  });

  it('kindOf and fileSetText', () => {
    expect(kindOf('smith_per_side')).toBe('barbell');
    expect(kindOf('plate_machine_per_side')).toBe('plate_machine');
    expect(kindOf('unknown')).toBeUndefined();
    expect(fileSetText(set({ weight: 50 }))).toBe('10 × 50 lb');
    expect(fileSetText(set({ loadType: 'dumbbell_each', weight: 30 }))).toBe('10 × 30 lb each');
    expect(fileSetText(set({ loadType: 'smith_per_side', weight: 45 }))).toBe('10 × 45 lb per side');
    expect(fileSetText(set({ loadType: 'bodyweight', weight: 10 }))).toBe('10 reps + 10 lb');
    expect(fileSetText(set({}))).toBe('10 reps');
  });
});

describe('planImport', () => {
  it('maps names, asks what it must, and writes nothing for unanswered exercises', () => {
    const p = parsed();
    const plan = planImport(p, emptyChoices(), deps());
    const [squat, cable, lunge, moon] = plan.exercises;
    expect(squat!.target?.id).toBe('barbell-back-squat');
    expect(squat!.matched).toBe(true);
    expect(cable!.target?.id).toBe('cable-tricep-pushdown');
    expect(lunge!.target?.id).toBe('wide-lunge');
    expect(lunge!.needsKind).toBe(true);
    expect(moon!.needsPick).toBe(true);
    expect(plan.open.map((e) => e.ex.index)).toEqual([2, 3]);
    // Squat 6 + cable 5 (with the drop set); lunges and the unmatched name wait.
    expect(plan.sets).toBe(11);
    expect(plan.sessions.map((s) => s.exerciseId)).toEqual(['barbell-back-squat', 'barbell-back-squat', 'cable-tricep-pushdown']);
    // The file's unsure set stays unsure and is written that way.
    expect(plan.sessions[1]!.sets[2]).toMatchObject({ reps: 6, uncertain: true });
    expect(plan.sessions[1]!.sets[2]!.load?.total).toBe(185);
    expect(plan.sessions[0]!.sets[0]).toMatchObject({ kind: 'warmup', reps: 5 });
    expect(plan.sessions[0]!.sets[0]!.load?.total).toBe(135);
    // The kg set is stored in kg (never converted), the drop set right after its set.
    expect(plan.sessions[2]!.sets.map((s) => [s.kind, s.load?.total, s.load?.unit])).toEqual([
      ['work', 50, 'lb'],
      ['work', 50, 'lb'],
      ['work', 55, 'lb'],
      ['drop', 30, 'lb'],
      ['work', 20, 'kg'],
    ]);
    expect(plan.fills).toEqual([]);
  });

  it('answers: the picked exercise, the chosen load type (filled in once), skips and edits', () => {
    const p = parsed();
    const lungeSession = p.sessions[3]!;
    const choices: ReviewChoices = {
      picks: { 3: 'dumbbell-bench-press' },
      kinds: { 2: 'dumbbell_each' },
      edits: { [setKey(p.sessions[1]!, 2)]: { ok: true }, [setKey(p.sessions[2]!, 1)]: { skip: true } },
    };
    const plan = planImport(p, choices, deps());
    expect(plan.open).toEqual([]);
    // 16 sets in the file, one skipped.
    expect(plan.sets).toBe(15);
    const lunge = plan.sessions.find((s) => s.hash === lungeSession.hash)!;
    expect(lunge.exerciseId).toBe('wide-lunge');
    expect(lunge.sets.map((s) => [s.load?.total ?? null, s.uncertain])).toEqual([
      [40, false],
      [40, false],
      [null, true],
    ]);
    expect(plan.fills).toEqual([{ exerciseId: 'wide-lunge', loadType: 'dumbbell_each' }]);
    expect(plan.sessions.find((s) => s.exerciseId === 'dumbbell-bench-press')!.sets.map((s) => s.load?.total)).toEqual([50, 50]);
    expect(plan.sessions[1]!.sets[2]!.uncertain).toBe(false);
    expect(plan.sessions[2]!.sets).toHaveLength(4);
    const planned = plan.exercises[1]!.sessions[0]!.sets[1]!;
    expect(planned).toMatchObject({ skipped: true });

    // A weight picked by hand replaces the file's; reps edited; a no weight set stays unsure
    // when only its reps were changed.
    const load: Load = { kind: 'dumbbell_each', unit: 'lb', total: 50 };
    const edited = planImport(p, { ...choices, edits: { [setKey(lungeSession, 2)]: { reps: 12, ok: true } , [setKey(lungeSession, 0)]: { load, ok: true } } }, deps());
    const l2 = edited.sessions.find((s) => s.hash === lungeSession.hash)!;
    expect(l2.sets[0]!.load).toEqual(load);
    expect(l2.sets[2]).toMatchObject({ reps: 12, uncertain: true });
    expect(edited.exercises[2]!.sessions[0]!.sets[2]!.reason).toBe(NO_WEIGHT);
  });

  it('skip a whole exercise; already imported sessions are left out', () => {
    const p = parsed();
    const plan = planImport(p, { ...emptyChoices(), picks: { 3: SKIP }, kinds: { 2: 'single' } }, deps(gymLb(), new Set([p.sessions[0]!.hash])));
    expect(plan.exercises[3]!.skipped).toBe(true);
    expect(plan.exercises[3]!.needsPick).toBe(false);
    expect(plan.already).toBe(1);
    expect(plan.exercises[0]!.sessions[0]!.already).toBe(true);
    expect(plan.sets).toBe(3 + 5 + 3);
    expect(plan.sessions.some((s) => s.hash === p.sessions[0]!.hash)).toBe(false);
  });

  it('Smith: asks for the bar once, fills the bar choice; plate machine: the starting weight', () => {
    const p = parseImportText(
      JSON.stringify({
        format: 'anygym-import-v1',
        unit: 'lb',
        exercises: [
          { planExercise: 'Barbell Back Squat', loadType: 'smith_per_side', sessions: [{ sets: [{ reps: 8, weight: 45 }] }] },
          { planExercise: 'Leg Press', loadType: 'plate_machine_per_side', sessions: [{ sets: [{ reps: 10, weight: 90 }] }] },
        ],
      }),
    );
    if (!p.ok) throw new Error('parse');
    const plan = planImport(p, emptyChoices(), deps());
    expect(plan.exercises.map((e) => e.missingBase)).toEqual(['smith', 'plate_machine']);
    expect(plan.sessions[0]!.sets[0]).toMatchObject({ reps: 8, uncertain: true, note: '45 lb per side' });
    expect(plan.sessions[0]!.sets[0]!.load).toBeUndefined();
    expect(plan.exercises[0]!.sessions[0]!.sets[0]!.reason).toBe(SMITH_UNKNOWN);
    expect(plan.fills).toEqual([{ exerciseId: 'barbell-back-squat', barId: 'smith' }]);
    const gym = gymLb();
    gym.bars.smith = 0;
    gym.equipmentWeights['leg-press'] = { kind: 'starting_resistance', value: 50 };
    const known = planImport(p, emptyChoices(), deps(gym));
    expect(known.exercises.map((e) => e.missingBase)).toEqual([undefined, undefined]);
    expect(known.sessions.map((s) => s.sets[0]!.load?.total)).toEqual([90, 230]);
    expect(known.sessions.every((s) => !s.sets[0]!.uncertain)).toBe(true);
  });

  it('an unbuildable answer is written unsure with the file number in the note', () => {
    const p = parsed();
    const plan = planImport(p, { picks: { 3: SKIP }, kinds: { 2: 'barbell' }, edits: {} }, deps());
    const lunge = plan.sessions.find((s) => s.exerciseId === 'wide-lunge')!;
    // 20 lb is lighter than the empty bar: no load, but the number stays with the set.
    expect(lunge.sets[0]).toMatchObject({ reps: 10, uncertain: true, note: 'In your file: 20 lb total, read as plates on a bar' });
    expect(lunge.sets[0]!.load).toBeUndefined();
    expect(plan.exercises[2]!.sessions[0]!.sets[0]!.reason).toBe(`${NOT_LOADABLE}: 20 lb as plates on a bar`);
  });

  it('changing the load type drops the weights picked and the checks for the old answer', () => {
    const p = parsed();
    const lunge = p.sessions[3]!;
    const single: Load = { kind: 'single', unit: 'lb', total: 25 };
    let c: ReviewChoices = chooseKind({ ...emptyChoices(), picks: { 3: SKIP } }, p, 2, 'single');
    c = { ...c, edits: { ...c.edits, [setKey(lunge, 0)]: { load: single, ok: true }, [setKey(lunge, 1)]: { reps: 12, ok: true, skip: true }, [setKey(p.sessions[0]!, 0)]: { ok: true } } };
    expect(chooseKind(c, p, 2, 'single')).toBe(c);
    const next = chooseKind(c, p, 2, 'dumbbell_each');
    expect(next.kinds[2]).toBe('dumbbell_each');
    expect(next.edits[setKey(lunge, 0)]).toBeUndefined();
    expect(next.edits[setKey(lunge, 1)]).toEqual({ reps: 12, skip: true });
    // Other exercises keep their checks.
    expect(next.edits[setKey(p.sessions[0]!, 0)]).toEqual({ ok: true });
    const plan = planImport(p, next, deps());
    const written = plan.sessions.find((s) => s.exerciseId === 'wide-lunge')!.sets;
    expect(written.map((s) => s.load?.kind ?? null)).toEqual(['dumbbell_each', null]);
    expect(written[0]!.load?.total).toBe(40);
    expect(plan.fills).toContainEqual({ exerciseId: 'wide-lunge', loadType: 'dumbbell_each' });
  });
});
