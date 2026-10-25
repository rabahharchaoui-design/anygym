// The owner's real history file, read from a temp copy at test time only (SPEC 0.6: never in the
// repo). Skipped when the file is not on this machine. Prints counts only, never names or weights.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../../data/planExercises';
import { makeGym, machineStartFor } from '../../../db/gyms';
import type { Load } from '../../../db/types';
import { loadSetupFor, machineIdFor } from '../../../screens/workout/exerciseLoad';
import { add, heldWeightOf } from '../../load';
import { parseImportText, setsIn } from '../anygymImportV1';
import { planImport, type LoadContext, type ReviewChoices } from '../importPlan';

const SOURCE = join(homedir(), 'anygym-private', 'g-history.json');
const HAVE = existsSync(SOURCE);
let dir = '';
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** The file number a stored load was built from (per side, one dumbbell, the pin, added weight). */
export function fileNumberOf(load: Load): number {
  switch (load.kind) {
    case 'barbell':
    case 'plate_machine':
      return add(...(load.perSide ?? []));
    case 'dumbbell_each':
      return heldWeightOf(load)!;
    case 'stack':
      return load.stackValue ?? load.total;
    case 'bodyweight':
      return load.added ?? 0;
    default:
      return load.total;
  }
}

type RawSet = { reps?: number; weight?: number; dropTo?: { reps?: number; weight?: number } };
type Raw = { exercises: Array<{ planExercise: string; loadType: string; sessions: Array<{ sets: RawSet[] }> }> };

describe.skipIf(!HAVE)('private history file (temp copy)', () => {
  it('every set imported, no invented load, order kept', () => {
    dir = mkdtempSync(join(tmpdir(), 'anygym-import-'));
    const copy = join(dir, 'history.private.json');
    copyFileSync(SOURCE, copy);
    const text = readFileSync(copy, 'utf8');
    const raw = JSON.parse(text) as Raw;
    const parsed = parseImportText(text);
    if (!parsed.ok) throw new Error(parsed.error);

    const fileLines = raw.exercises.reduce((n, e) => n + e.sessions.reduce((m, s) => m + s.sets.length, 0), 0);
    const fileDrops = raw.exercises.reduce((n, e) => n + e.sessions.reduce((m, s) => m + s.sets.filter((x) => x.dropTo).length, 0), 0);
    const numbers = new Set<number>();
    for (const e of raw.exercises)
      for (const s of e.sessions)
        for (const x of s.sets) {
          if (x.weight !== undefined) numbers.add(x.weight);
          if (x.dropTo?.weight !== undefined) numbers.add(x.dropTo.weight);
        }

    expect(parsed.issues).toEqual([]);
    expect(setsIn(parsed.sessions)).toBe(fileLines + fileDrops);

    const gym = makeGym({ name: 'Test gym', type: 'full', unit: parsed.unit }, 1);
    const contextFor = (id: string, name: string): LoadContext => ({
      gymUnit: gym.unit,
      olympic: gym.bars.olympic,
      smith: gym.bars.smith,
      machineStart: machineStartFor(gym, machineIdFor(id, name)),
      setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, id, name) }),
    });
    // Unknown load types: answered "one weight" (any answer keeps the file's number).
    const kinds: ReviewChoices['kinds'] = {};
    parsed.exercises.forEach((e) => {
      if (e.loadType === 'unknown') kinds[e.index] = 'single';
    });
    const plan = planImport(parsed, { picks: {}, kinds, edits: {} }, { planExercises: PLAN_EXERCISES, contextFor, existing: new Set() });
    expect(plan.open).toEqual([]);
    expect(plan.sets).toBe(fileLines + fileDrops);

    const written = plan.sessions.flatMap((s) => s.sets);
    const withLoad = written.filter((s) => s.load);
    const invented = withLoad.filter((s) => !(s.load!.kind === 'bodyweight' && fileNumberOf(s.load!) === 0) && !numbers.has(fileNumberOf(s.load!)));
    expect(invented).toHaveLength(0);

    // Order: each exercise's sessions come out in file order with the file's reps.
    for (const [i, e] of raw.exercises.entries()) {
      const target = plan.exercises[i]!.target!;
      const mine = plan.sessions.filter((s) => s.exerciseId === target.id && parsed.sessions.find((p) => p.hash === s.hash)!.exerciseIndex === i);
      const reps = mine.map((s) => s.sets.filter((x) => x.kind !== 'drop').map((x) => x.reps));
      expect(reps).toEqual(e.sessions.map((s) => s.sets.map((x) => x.reps)));
    }

    const unsure = written.filter((s) => s.uncertain).length;
    console.log(
      `private import: exercises ${parsed.exercises.length}, sessions ${parsed.sessions.length}, file lines ${fileLines}, drop sets ${fileDrops}, written ${plan.sets}, with load ${withLoad.length}, unsure ${unsure}, invented ${invented.length}`,
    );
  });
});
