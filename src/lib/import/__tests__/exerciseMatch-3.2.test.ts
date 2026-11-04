// PLAN 3.2: imported names to plan exercises and catalog ids (SPEC 4.3: exact, variant, none;
// when unsure, none), the mapping stored with the sets, and History names for every target.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../../data/planExercises';
import { CATALOG_NAMES, MATCH_DATA, exerciseNameOf } from '../../../data/importMatch';
import { EXERCISE_MAP } from '../../../data/muscles';
import { makeGym, machineStartFor } from '../../../db/gyms';
import { AnyGymDB } from '../../../db/schema';
import { importedHashes, writeImport } from '../../../db/importHistory';
import type { Gym, Session } from '../../../db/types';
import { RECORD_CHECKS } from '../../backup';
import { loadSetupFor, machineIdFor } from '../../../screens/workout/exerciseLoad';
import { exerciseNamer, workoutTitle } from '../../../screens/history/historyWords';
import { parseImportText, type ParsedImport } from '../anygymImportV1';
import {
  KEEP_NAME,
  autoTarget,
  catalogPick,
  matchLine,
  nameOnlyId,
  nameOnlyOf,
  pickedTarget,
  planTarget,
  type MatchData,
} from '../exerciseMatch';
import { SKIP, emptyChoices, planImport, type LoadContext, type ReviewChoices } from '../importPlan';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'synthetic-mapping-v1.json'), 'utf8');
const parsed = (): ParsedImport => {
  const p = parseImportText(FIXTURE);
  if (!p.ok) throw new Error(p.error);
  return p;
};
const gym: Gym = makeGym({ name: 'Test gym', type: 'full', unit: 'lb' }, 1);
const contextFor = (id: string, name: string): LoadContext => ({
  gymUnit: gym.unit,
  olympic: gym.bars.olympic,
  smith: gym.bars.smith,
  machineStart: machineStartFor(gym, machineIdFor(id, name)),
  setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, id, name) }),
});
const deps = (existing: Set<string> = new Set()) => ({ planExercises: PLAN_EXERCISES, map: EXERCISE_MAP, catalog: CATALOG_NAMES, contextFor, existing });
const byName = (plan: ReturnType<typeof planImport>, name: string) => plan.exercises.find((e) => e.ex.name === name)!;

describe('autoTarget: only exact names, never a guess', () => {
  it('a plan name maps to the plan exercise, with the exercise map entry as its catalog match', () => {
    const t = autoTarget(['barbell back-squat'], MATCH_DATA)!;
    expect(t).toMatchObject({ id: 'barbell-back-squat', source: 'plan', catalogId: 'Barbell_Squat', match: 'variant' });
    const none = autoTarget(['28 Method Squat'], MATCH_DATA)!;
    expect(none).toMatchObject({ id: '28-method-squat', source: 'plan', catalogId: null, catalogName: null, match: 'none' });
  });

  it('a catalog name with exactly one exact plan entry is that plan exercise', () => {
    expect(autoTarget(['Triceps Pushdown'], MATCH_DATA)).toMatchObject({ id: 'cable-tricep-pushdown', source: 'plan', catalogId: 'Triceps_Pushdown', match: 'exact' });
  });

  it('a catalog name with no plan entry, or two exact ones, stays the catalog exercise', () => {
    expect(autoTarget(['Barbell Curl'], MATCH_DATA)).toMatchObject({ id: 'Barbell_Curl', source: 'catalog', catalogId: 'Barbell_Curl', match: 'exact' });
    // Two plan exercises are mapped exact to Leg Extensions: which one is not known, so neither.
    expect(EXERCISE_MAP.filter((m) => m.catalogId === 'Leg_Extensions' && m.match === 'exact').length).toBeGreaterThan(1);
    expect(autoTarget(['Leg Extensions'], MATCH_DATA)).toMatchObject({ id: 'Leg_Extensions', source: 'catalog' });
  });

  it('a variant plan entry is never jumped to from a catalog name', () => {
    // Barbell Squat is the catalog photo of the plan's wide stance squat (variant): not the same.
    const t = autoTarget(['Barbell Squat'], MATCH_DATA)!;
    expect(t.source).toBe('catalog');
    expect(t.id).toBe('Barbell_Squat');
  });

  it('loose, partial or unknown names match nothing', () => {
    for (const name of ['Moon press', 'Zercher Moon Press', 'Bench', 'Squat', 'Curl', 'Leg Extension machine', 'Pushdown', '']) {
      expect(autoTarget([name], MATCH_DATA)).toBeUndefined();
    }
  });

  it('same letters and digits is the same name; planExercise is tried before name', () => {
    expect(autoTarget(['barbell curl'], MATCH_DATA)?.id).toBe('Barbell_Curl');
    expect(autoTarget(['triceps push-down'], MATCH_DATA)?.id).toBe('cable-tricep-pushdown');
    expect(autoTarget(['Barbell Curl', 'Triceps Pushdown'], MATCH_DATA)?.id).toBe('Barbell_Curl');
    expect(autoTarget(['Moon press', 'Barbell Curl'], MATCH_DATA)?.id).toBe('Barbell_Curl');
  });

  it('two catalog exercises with the same letters: none', () => {
    const data: MatchData = { planExercises: [], map: [], catalog: [{ id: 'A', name: 'Lat Pull-Down' }, { id: 'B', name: 'Lat Pulldown' }] };
    expect(autoTarget(['lat pulldown'], data)).toBeUndefined();
    expect(autoTarget(['Lat Pull-Down'], data)?.id).toBe('A');
  });

  it('every plan exercise maps to itself with its map entry, never to another catalog id', () => {
    for (const p of PLAN_EXERCISES) {
      const t = autoTarget([p.name], MATCH_DATA)!;
      expect(t.id).toBe(p.id);
      const entry = EXERCISE_MAP.find((m) => m.planId === p.id)!;
      expect(t.match).toBe(entry.match);
      expect(t.catalogId).toBe(entry.match === 'none' ? null : entry.catalogId);
    }
  });
});

describe('picks and words', () => {
  it('a pick is a plan id, a catalog exercise or the file name kept', () => {
    expect(pickedTarget('dumbbell-bench-press', 'Bench', MATCH_DATA)).toMatchObject({ id: 'dumbbell-bench-press', source: 'plan' });
    expect(pickedTarget(catalogPick('Ab_Roller'), 'Wheel', MATCH_DATA)).toMatchObject({ id: 'Ab_Roller', source: 'catalog', match: 'exact' });
    expect(pickedTarget(KEEP_NAME, '  Moon press ', MATCH_DATA)).toMatchObject({ id: 'import:Moon press', name: 'Moon press', source: 'name', catalogId: null, match: 'none' });
    expect(pickedTarget(catalogPick('Not_A_Real_Id'), 'x', MATCH_DATA)).toBeUndefined();
    expect(pickedTarget('not-a-plan-id', 'x', MATCH_DATA)).toBeUndefined();
    expect(pickedTarget(undefined, 'x', MATCH_DATA)).toBeUndefined();
  });

  it('name only ids round trip', () => {
    expect(nameOnlyOf(nameOnlyId('Moon press'))).toBe('Moon press');
    expect(nameOnlyOf('import:')).toBeUndefined();
    expect(nameOnlyOf('barbell-back-squat')).toBeUndefined();
  });

  it('the quiet match line', () => {
    expect(matchLine(planTarget(PLAN_EXERCISES.find((p) => p.id === 'cable-tricep-pushdown')!, MATCH_DATA))).toBe('Matched: Triceps Pushdown');
    expect(matchLine(planTarget(PLAN_EXERCISES.find((p) => p.id === 'barbell-back-squat')!, MATCH_DATA))).toBe('Matched: Barbell Squat (a close variant)');
    expect(matchLine(planTarget(PLAN_EXERCISES.find((p) => p.id === '28-method-squat')!, MATCH_DATA))).toBe('Not in the catalog yet');
    expect(matchLine({ catalogName: null, match: 'none' })).toBe('Not in the catalog yet');
  });

  it('History names every id an import can write', () => {
    expect(exerciseNameOf('cable-tricep-pushdown')).toBe(PLAN_EXERCISES.find((p) => p.id === 'cable-tricep-pushdown')!.name);
    expect(exerciseNameOf('Barbell_Curl')).toBe('Barbell Curl');
    expect(exerciseNameOf('import:Moon press')).toBe('Moon press');
    expect(exerciseNameOf('nope')).toBeUndefined();
    const s: Session = { id: 's', gymId: 'g', startedAt: 1, imported: true, importSeq: 1, exerciseIds: ['import:Moon press'] };
    expect(workoutTitle(s)).toBe('Moon press');
    expect(exerciseNamer(s)('Barbell_Curl')).toBe('Barbell Curl');
  });
});

describe('planImport with the catalog (synthetic mapping fixture)', () => {
  it('auto matches, honest unmapped names and the questions', () => {
    const plan = planImport(parsed(), emptyChoices(), deps());
    expect(byName(plan, 'Squats').target).toMatchObject({ id: 'barbell-back-squat', match: 'variant' });
    expect(byName(plan, 'Triceps Pushdown').target).toMatchObject({ id: 'cable-tricep-pushdown', match: 'exact' });
    expect(byName(plan, 'Barbell Curl').target).toMatchObject({ id: 'Barbell_Curl', source: 'catalog' });
    expect(byName(plan, 'Leg Extensions').target).toMatchObject({ id: 'Leg_Extensions', source: 'catalog' });
    expect(byName(plan, '28 Method Squat').target).toMatchObject({ id: '28-method-squat', match: 'none' });
    for (const n of ['Moon press', 'Bench', 'Mystery machine']) {
      const e = byName(plan, n);
      expect(e.target).toBeUndefined();
      expect(e.needsPick).toBe(true);
    }
    expect(byName(plan, 'Mystery machine').needsKind).toBe(true);
    expect(plan.open.map((e) => e.ex.name)).toEqual(['Moon press', 'Bench', 'Mystery machine']);
    // Without the map and catalog (older callers) the plan names still match, catalog names do not.
    const old = planImport(parsed(), emptyChoices(), { planExercises: PLAN_EXERCISES, contextFor, existing: new Set() });
    expect(byName(old, 'Squats').target).toMatchObject({ id: 'barbell-back-squat', match: 'none', catalogId: null });
    expect(byName(old, 'Barbell Curl').target).toBeUndefined();
  });

  it('writes the mapping with every set: by name, picked, kept as its name; skip writes nothing', () => {
    const p = parsed();
    const idx = (n: string) => p.exercises.find((e) => e.name === n)!.index;
    const choices: ReviewChoices = {
      picks: { [idx('Moon press')]: KEEP_NAME, [idx('Bench')]: 'dumbbell-bench-press', [idx('Mystery machine')]: catalogPick('Ab_Crunch_Machine'), [idx('Leg Extensions')]: SKIP },
      kinds: { [idx('Mystery machine')]: 'stack' },
      edits: {},
    };
    const plan = planImport(p, choices, deps());
    expect(plan.open).toEqual([]);
    const of = (id: string) => plan.sessions.filter((s) => s.exerciseId === id);
    expect(of('barbell-back-squat').map((s) => s.map)).toEqual([
      { fileName: 'Squats', catalogId: 'Barbell_Squat', match: 'variant', by: 'name' },
      { fileName: 'Squats', catalogId: 'Barbell_Squat', match: 'variant', by: 'name' },
    ]);
    expect(of('Barbell_Curl')[0]!.map).toEqual({ fileName: 'Barbell Curl', catalogId: 'Barbell_Curl', match: 'exact', by: 'name' });
    expect(of('28-method-squat')[0]!.map).toEqual({ fileName: '28 Method Squat', catalogId: null, match: 'none', by: 'name' });
    expect(of('import:Moon press')[0]!.map).toEqual({ fileName: 'Moon press', catalogId: null, match: 'none', by: 'you' });
    expect(of('dumbbell-bench-press')[0]!.map).toMatchObject({ fileName: 'Bench', by: 'you' });
    expect(of('Ab_Crunch_Machine')[0]!.map).toEqual({ fileName: 'Mystery machine', catalogId: 'Ab_Crunch_Machine', match: 'exact', by: 'you' });
    expect(of('Leg_Extensions')).toEqual([]);
    expect(byName(plan, 'Leg Extensions')).toMatchObject({ skipped: true, matched: false });
    // Change a name the app matched: the pick wins, and says so.
    const changed = planImport(p, { ...emptyChoices(), picks: { [idx('Squats')]: 'front-squat' } }, deps());
    expect(byName(changed, 'Squats')).toMatchObject({ matched: false, picked: true, target: { id: 'front-squat' }, auto: { id: 'barbell-back-squat' } });
    // Every set count: skip leaves out exactly the skipped exercise's sets.
    const all = p.sessions.reduce((n, s) => n + s.sets.length, 0);
    const legExt = p.sessions.filter((s) => s.exerciseIndex === idx('Leg Extensions')).reduce((n, s) => n + s.sets.length, 0);
    expect(plan.sets).toBe(all - legExt);
  });

  it('a remap never changes the content hash: the same file twice is still written once', () => {
    const a = planImport(parsed(), emptyChoices(), deps());
    const b = planImport(parsed(), { ...emptyChoices(), picks: { 0: 'front-squat' } }, deps());
    expect(a.sessions.filter((s) => s.exerciseId === 'barbell-back-squat').map((s) => s.hash)).toEqual(b.sessions.filter((s) => s.exerciseId === 'front-squat').map((s) => s.hash));
    const again = planImport(parsed(), emptyChoices(), deps(new Set(a.sessions.map((s) => s.hash))));
    expect(again.sessions).toEqual([]);
  });
});

describe('writeImport stores the mapping additively', () => {
  let db: AnyGymDB;
  let n = 0;
  beforeEach(async () => {
    db = new AnyGymDB(`anygym-import-32-${n++}`);
    await db.open();
  });
  afterEach(async () => {
    await db.delete();
  });

  it('each set carries importMap; older imports without it are left as they are', async () => {
    // An older import (before 3.2): no importMap.
    const p = parsed();
    const idx = (name: string) => p.exercises.find((e) => e.name === name)!.index;
    const first = planImport(p, emptyChoices(), deps());
    const squat = first.sessions.filter((s) => s.exerciseId === 'barbell-back-squat').map(({ map: _m, ...rest }) => rest);
    await writeImport(squat, gym.id, [], db);
    const before = await db.sets.toArray();
    expect(before.every((s) => s.importMap === undefined)).toBe(true);

    const choices: ReviewChoices = {
      picks: { [idx('Moon press')]: KEEP_NAME, [idx('Bench')]: SKIP, [idx('Mystery machine')]: SKIP },
      kinds: {},
      edits: {},
    };
    const plan = planImport(p, choices, deps(await importedHashes(db)));
    expect(plan.open).toEqual([]);
    const r = await writeImport(plan.sessions, gym.id, plan.fills, db);
    expect(r.sets).toBe(plan.sets);
    const after = await db.sets.toArray();
    // The older sets were not rewritten.
    for (const s of before) expect(after.find((x) => x.id === s.id)).toEqual(s);
    const fresh = after.filter((x) => !before.some((b) => b.id === x.id));
    expect(fresh.length).toBe(plan.sets);
    expect(fresh.every((x) => x.importMap !== undefined)).toBe(true);
    const moon = fresh.filter((x) => x.exerciseId === 'import:Moon press');
    expect(moon.map((x) => x.importMap)).toEqual(moon.map(() => ({ fileName: 'Moon press', catalogId: null, match: 'none', by: 'you' })));
    // A backup of these sets is still a valid backup.
    for (const x of after) expect(RECORD_CHECKS.sets(x)).toBe(true);
    expect(RECORD_CHECKS.sets({ ...fresh[0]!, importMap: { fileName: 'x', catalogId: null, match: 'maybe', by: 'name' } })).toBe(false);
    // Order kept: imported sessions in file order.
    const sessions = (await db.sessions.toArray()).sort((a, b) => a.importSeq! - b.importSeq!);
    expect(sessions.every((s) => s.imported)).toBe(true);
    expect(sessions.map((s) => s.importSeq)).toEqual(sessions.map((_, i) => i + 1));
  });
});
