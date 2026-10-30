// PLAN 2.0c group 2 (Codex 1025 1651 #2, 1722 #4): an import set whose weight the user changed never
// falls back to the file's weight. Absent = unchanged, a Load = replacement, null = cleared.
import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../../data/planExercises';
import { makeGym, machineStartFor } from '../../../db/gyms';
import type { Gym } from '../../../db/types';
import { loadSetupFor, machineIdFor } from '../../../screens/workout/exerciseLoad';
import { parseImportText, type ParsedImport } from '../anygymImportV1';
import { WEIGHT_CLEARED, chooseKind, emptyChoices, planImport, setKey, type LoadContext, type ReviewChoices } from '../importPlan';

const FILE = JSON.stringify({
  format: 'anygym-import-v1',
  unit: 'lb',
  exercises: [
    { name: 'Goblet', planExercise: 'Kettlebell Goblet Squat', loadType: 'single_weight', sessions: [{ sets: [{ reps: 10, weight: 53 }, { reps: 9, weight: 53, uncertain: true, why: 'Hard to read' }] }] },
    { name: 'Mystery', planExercise: 'Kettlebell Goblet Squat', loadType: 'unknown', sessions: [{ sets: [{ reps: 8, weight: 53 }] }] },
  ],
});
const parsed = (): ParsedImport => {
  const p = parseImportText(FILE);
  if (!p.ok) throw new Error(p.error);
  return p;
};
const gym: Gym = makeGym({ name: 'Test gym', type: 'full', unit: 'lb' }, 1);
const deps = {
  planExercises: PLAN_EXERCISES,
  existing: new Set<string>(),
  contextFor: (id: string, name: string): LoadContext => ({
    gymUnit: gym.unit,
    olympic: gym.bars.olympic,
    smith: gym.bars.smith,
    machineStart: machineStartFor(gym, machineIdFor(id, name)),
    setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, id, name) }),
  }),
};
const plan = (choices: ReviewChoices) => planImport(parsed(), choices, deps);
const first = (choices: ReviewChoices) => plan(choices).exercises[0]!.sessions[0]!.sets[0]!;
const key0 = () => setKey(parsed().sessions[0]!, 0);
const with_ = (edit: ReviewChoices['edits'][string]): ReviewChoices => ({ ...emptyChoices(), edits: { [key0()]: edit } });

describe('import set edits: unchanged, replaced, cleared', () => {
  it('absent load keeps the file weight', () => {
    expect(first(with_({ reps: 12, ok: true })).load).toEqual({ kind: 'single', unit: 'lb', total: 53 });
  });

  it('a replacement wins', () => {
    const p = first(with_({ ok: true, load: { kind: 'single', unit: 'lb', total: 35 } }));
    expect(p.load).toEqual({ kind: 'single', unit: 'lb', total: 35 });
    expect(p.uncertain).toBe(false);
  });

  it('reproduction: an explicit clear never falls back to 53 lb and stays uncertain, even with ok', () => {
    const p = first(with_({ ok: true, load: null }));
    expect(p.load).toBeUndefined();
    expect(p.uncertain).toBe(true);
    expect(p.reason).toBe(WEIGHT_CLEARED);
    expect(p.edited).toBe(true);
    const write = plan(with_({ ok: true, load: null })).sessions[0]!.sets[0]!;
    expect(write).toEqual({ kind: 'work', reps: 10, uncertain: true });
  });

  it('a new load type answer drops both a cleared and a replacement weight, and the check', () => {
    const p = parsed();
    const k = setKey(p.sessions[1]!, 0);
    for (const load of [null, { kind: 'single' as const, unit: 'lb' as const, total: 35 }]) {
      const c = chooseKind({ ...emptyChoices(), kinds: { 1: 'single' }, edits: { [k]: { load, ok: true, reps: 7 } } }, p, 1, 'dumbbell_each');
      expect(c.edits[k]).toEqual({ reps: 7 });
    }
  });
});
