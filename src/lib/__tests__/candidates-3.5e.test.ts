// PLAN 3.5e: the candidate builder (deterministic, cross checked, never in the sure catalog), its
// rules, the curation lines, the review queue order and batches, the decisions and the export, and
// the coverage report (the committed report is what the script writes today).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import type { MapEntry } from '../catalog';
import { eligibleDemos } from '../exerciseInfo';
import { PATTERNS, type PatternFile } from '../swap';
import { buildCandidates, type BuildInput } from '../candidates/build';
import { parseCuration, parseLine, type CurationFile } from '../candidates/curation';
import { checkGear, shoulderRule, sourceGear } from '../candidates/rules';
import { BATCH, batchText, batchView, currentBatch, reviewOrder } from '../candidates/queue';
import { groupRows, presetRows, sureLadderMoves, type Move } from '../candidates/coverage';
import { coverageReport } from '../candidates/report';
import { PRESET_KITS } from '../candidates/presets';
import { approvedIds, buildApprovalsExport, canFix, decisionRow, isReviewRow, NOTE_MAX, type CandidateReviewRow } from '../candidates/review';
import { candidateMuscles, gearLine } from '../candidates/view';
import { EXTRA_GROUPS, STYLES, type CandidateFile, type SourceExercise } from '../candidates/types';
import { EQUIPMENT_LABEL } from '../intake/options';

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const curation = read<CurationFile>('data/candidate-curation.json');
const slice = read<{ total: number; exercises: SourceExercise[] }>('data/candidate-source.json');
const committed = read<CandidateFile>('data/catalog-candidates.json');
const patternFile = read<PatternFile>('data/patterns.json');
const patterns = Object.keys(patternFile.patterns);
const catalogIds = new Set(read<{ exercises: { id: string }[] }>('data/catalog.json').exercises.map((e) => e.id));
const LOADS = ['barbell', 'dumbbell_each', 'single', 'stack', 'plate_machine', 'bodyweight', 'timed', 'unknown'];
const BARS = ['olympic', 'womens', 'ez_curl', 'trap', 'smith'];
const GROUPS = [...patterns, ...EXTRA_GROUPS];

const input = (): BuildInput => {
  const { entries, problems } = parseCuration(curation, GROUPS, EQUIPMENT_IDS, LOADS, BARS);
  expect(problems).toEqual([]);
  return { entries, source: new Map(slice.exercises.map((e) => [e.id, e])), catalogIds, patterns, photos: curation.photos, muscles: curation.muscles };
};

const src = (over: Partial<SourceExercise>): SourceExercise => ({ id: 'X', name: 'X', force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'dumbbell', primaryMuscles: ['chest'], secondaryMuscles: [], instructions: ['a'], category: 'strength', images: ['a/0.jpg', 'a/1.jpg'], ...over });
const entry = (line: string, group = 'horizontal push') => {
  const e = parseLine(line, group as never, EQUIPMENT_IDS, LOADS, BARS);
  if (typeof e === 'string') throw new Error(e);
  return e;
};
const one = (line: string, s: SourceExercise, group?: string) => buildCandidates({ entries: [entry(line, group)], source: new Map([[s.id, s]]), catalogIds: new Set(), patterns, photos: {} });

describe('the candidate builder', () => {
  it('is deterministic and the committed file is exactly what it builds', () => {
    const a = buildCandidates(input());
    const b = buildCandidates(input());
    expect(a.problems).toEqual([]);
    expect(JSON.stringify(a.candidates)).toBe(JSON.stringify(b.candidates));
    expect(JSON.stringify(a.candidates)).toBe(JSON.stringify(committed.candidates));
    expect(committed.candidates.map((c) => c.id)).toEqual([...committed.candidates.map((c) => c.id)].sort());
  });

  it('never holds a move of the sure catalog, and every candidate is status candidate', () => {
    for (const c of committed.candidates) {
      expect(catalogIds.has(c.id), c.id).toBe(false);
      expect(c.status).toBe('candidate');
    }
    expect(new Set(committed.candidates.map((c) => c.id)).size).toBe(committed.candidates.length);
  });

  it('every candidate has a pattern, gear, sure muscles, two photos on disk and both cross checks', () => {
    expect(committed.candidates.length).toBeGreaterThan(250);
    for (const c of committed.candidates) {
      expect(GROUPS, c.id).toContain(c.pattern);
      expect(c.ladder).toBe((PATTERNS as readonly string[]).includes(c.pattern));
      expect(Array.isArray(c.requires)).toBe(true);
      for (const g of c.requires) for (const id of g) expect(EQUIPMENT_IDS, c.id).toContain(id);
      expect(LOADS).toContain(c.load);
      expect(c.styles.length).toBeGreaterThan(0);
      for (const s of c.styles) expect(STYLES).toContain(s);
      // Sure muscles: at least one primary muscle named (rotator cuff work is text only, SPEC 4.5).
      expect(candidateMuscles(c)?.primary.length, c.id).toBeGreaterThan(0);
      if (!c.regions.primary.length) expect(c.muscleText, c.id).toMatch(/^Rotator cuff/);
      expect(candidateMuscles(c)?.text).toBe(c.muscleText);
      for (const k of ['gear', 'muscles', 'pattern'] as const) {
        expect(c.checks[k].agree).toBe(true);
        expect(c.checks[k].source.length).toBeGreaterThan(0);
        expect(c.checks[k].how.length).toBeGreaterThan(10);
      }
      expect(['contact-sheet', 'not-viewed']).toContain(c.checks.photo.confidence);
      expect(['high', 'medium']).toContain(c.confidence);
      for (const p of c.images.webp) expect(existsSync(`public/${p}`), p).toBe(true);
      expect(c.images.webp[0]).toBe(`exc/${c.id}/0.webp`);
      if ([...c.primaryMuscles, ...c.secondaryMuscles].includes('shoulders')) expect(c.muscleOverride?.shoulders, c.id).toBeTruthy();
    }
  });

  it('names no muscle twice, and keeps the hand fixed muscles of the tester round', () => {
    for (const c of committed.candidates) {
      expect(new Set(c.primaryMuscles).size, c.id).toBe(c.primaryMuscles.length);
      expect(new Set(c.secondaryMuscles).size, c.id).toBe(c.secondaryMuscles.length);
      expect(c.secondaryMuscles.filter((m) => c.primaryMuscles.includes(m)), c.id).toEqual([]);
    }
    const by = new Map(committed.candidates.map((c) => [c.id, c]));
    expect(by.get('Side_Leg_Raises')?.primaryMuscles).toEqual(['abductors']);
    expect(by.get('Single_Leg_Butt_Kick')?.primaryMuscles).toEqual(['hamstrings']);
    expect(by.get('Double_Leg_Butt_Kick')?.primaryMuscles).toEqual(['hamstrings']);
    expect(by.get('Bent-Arm_Dumbbell_Pullover')).toMatchObject({ pattern: 'vertical pull', primaryMuscles: ['lats'] });
    expect(by.get('Overhead_Stretch')?.primaryMuscles).toEqual(['lats']);
    for (const id of ['Box_Squat', 'Standing_Hip_Flexors', 'Kneeling_Hip_Flexor']) expect(by.has(id), id).toBe(false);
    expect(by.get('Side_Leg_Raises')?.checks.muscles.how).toMatch(/^corrected by hand/);
  });

  it('keeps every photo drop out, and only the candidates have photo folders', () => {
    const r = buildCandidates(input());
    const dropped = Object.entries(curation.photos).filter(([, n]) => n.startsWith('drop')).map(([id]) => id);
    expect(r.dropped.map((d) => d.id).sort()).toEqual(dropped.sort());
    for (const id of dropped) expect(existsSync(`public/exc/${id}`), id).toBe(false);
    const ids = new Set(committed.candidates.map((c) => c.id));
    for (const id of Object.keys(curation.photos)) expect(ids.has(id) || dropped.includes(id), id).toBe(true);
  });

  it('refuses what the two references disagree on, never guessing', () => {
    expect(one('Incline_Dumbbell_Thing', src({ id: 'Incline_Dumbbell_Thing' })).problems.join()).toMatch(/Incline.*adjustable_bench/);
    expect(one('Press =dumbbells', src({ id: 'Press', equipment: 'barbell' })).problems.join()).toMatch(/source says barbell/);
    expect(one('Dumbbell_X', src({ id: 'Dumbbell_X', equipment: 'barbell' })).problems.join()).toMatch(/name says "Dumbbell"/);
    expect(one('X', src({ primaryMuscles: ['biceps'] })).problems.join()).toMatch(/not a horizontal push muscle/);
    expect(one('X', src({ force: 'static', secondaryMuscles: ['shoulders'] }), 'biceps').problems.join()).toMatch(/not a biceps muscle/);
    expect(one('X', src({ force: null, primaryMuscles: ['triceps'], secondaryMuscles: ['shoulders'] }), 'triceps').problems.join()).toMatch(/add sh:/);
    expect(one('X', src({ equipment: 'machine' })).problems.join()).toMatch(/needs its gear named/);
    expect(one('X', src({ images: ['a.jpg'] })).problems.join()).toMatch(/two/);
    const inCatalog = buildCandidates({ entries: [entry('Pushups')], source: new Map([['Pushups', src({ id: 'Pushups' })]]), catalogIds: new Set(['Pushups']), patterns, photos: {} });
    expect(inCatalog.problems).toEqual(['Pushups: already in the sure catalog']);
  });

  it('writes the gear the flags say, and the shoulder part by the SPEC 4.5 rules', () => {
    const r = one('Dumbbell_Press bench each', src({ id: 'Dumbbell_Press', secondaryMuscles: ['shoulders', 'triceps'] }));
    expect(r.problems).toEqual([]);
    const c = r.candidates[0]!;
    expect(c.requires).toEqual([['dumbbells'], ['flat_bench', 'adjustable_bench']]);
    expect(c.load).toBe('dumbbell_each');
    expect(c.eachSide).toBe(true);
    expect(c.muscleOverride?.shoulders).toBe('front');
    expect(sourceGear('dumbbell', 'One-Arm_Row')?.load).toBe('single');
    expect(sourceGear('machine', 'X')).toBeNull();
    expect(shoulderRule(src({ id: 'Face_Pull_Thing', force: 'pull' }), 'rear delt')?.part).toBe('rear');
    expect(shoulderRule(src({ id: 'Cable_Lateral_Thing' }), 'lateral delt')?.part).toBe('side');
    expect(shoulderRule(src({ id: 'Plank_Thing', force: 'static' }), 'core')?.part).toBe('leave out');
    expect(checkGear(src({ id: 'Triceps_Pushdown_-_V-Bar_Attachment', equipment: 'cable' }), [['cable_station']]).ok).toBe(true);
  });

  it('parses the curation flags and says what is wrong with a line', () => {
    expect(entry('A +smith_machine incline load:barbell bar:smith sh:out timed')).toMatchObject({ add: [['smith_machine'], ['adjustable_bench']], load: 'barbell', bar: 'smith', shoulders: 'leave out', timed: true });
    expect(entry('A =seated_row/cable_station').replace).toEqual([['seated_row', 'cable_station']]);
    expect(parseLine('A +sauna', 'core', EQUIPMENT_IDS, LOADS, BARS)).toMatch(/unknown equipment/);
    expect(parseLine('A wobble', 'core', EQUIPMENT_IDS, LOADS, BARS)).toMatch(/unknown flag/);
    expect(parseLine('A timed reps', 'core', EQUIPMENT_IDS, LOADS, BARS)).toMatch(/timed and reps/);
    expect(parseCuration({ about: '', groups: { core: ['A', 'A'], yoga: ['B'] }, photos: {} }, GROUPS, EQUIPMENT_IDS, LOADS, BARS).problems).toEqual(['A: listed twice', 'unknown group yoga']);
  });
});

describe('what a candidate shows', () => {
  it('says its gear in plain words', () => {
    expect(gearLine({ requires: [] }, EQUIPMENT_LABEL)).toBe('Nothing: just your body');
    expect(gearLine({ requires: [['dumbbells'], ['flat_bench', 'adjustable_bench']] }, EQUIPMENT_LABEL)).toBe('Dumbbells + a bench');
    expect(gearLine({ requires: [['flat_bench', 'adjustable_bench']] }, EQUIPMENT_LABEL)).toBe('A bench');
  });
});

describe('the review queue', () => {
  const sure: Move[] = sureLadderMoves(patternFile.patterns, (id) => eligibleDemos(read<MapEntry[]>('data/exercise-map.json'), read<{ exercises: { catalogId: string }[] }>('data/catalog-demos.json').exercises, catalogIds).has(id));
  const order = reviewOrder(committed.candidates, sure);

  it('holds every candidate once, in a stable order', () => {
    expect([...order].sort()).toEqual(committed.candidates.map((c) => c.id));
    expect(reviewOrder([...committed.candidates].reverse(), sure)).toEqual(order);
  });

  it('puts the short places and legs and cardio first: a leg or cardio move a short place can do, then any move a short place can do', () => {
    const byId = new Map(committed.candidates.map((c) => [c.id, c]));
    const legsOrCardio = (id: string) => ['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves', 'cardio'].includes(byId.get(id)!.pattern);
    const short = PRESET_KITS.filter((p) => p.id !== 'full');
    const fitsShort = (id: string) => short.some((p) => byId.get(id)!.requires.every((g) => g.some((e) => p.kit.equipment.includes(e) && (e !== 'dumbbells' || p.kit.dumbbellRange))));
    const first = order.findIndex((id) => !(legsOrCardio(id) && fitsShort(id)));
    expect(first).toBeGreaterThan(10);
    for (const id of order.slice(0, first)) expect(legsOrCardio(id) && fitsShort(id), id).toBe(true);
    // A full gym only move never comes before one a short place can do.
    const firstFullOnly = order.findIndex((id) => !fitsShort(id));
    expect(firstFullOnly).toBeGreaterThan(first);
    expect(order.slice(firstFullOnly).every((id) => !fitsShort(id))).toBe(true);
    // The first card is a leg or cardio move the hotel can do (its first batch is the hotel's legs).
    expect(legsOrCardio(order[0]!)).toBe(true);
  });

  it('batches of 20 with "Batch 3 of 15 · 12 left", resuming at the first undecided move', () => {
    const ids = Array.from({ length: 45 }, (_, i) => `m${String(i).padStart(2, '0')}`);
    expect(currentBatch(ids, new Set())).toBe(0);
    const decided = new Set(ids.slice(0, 48 - 20));
    expect(currentBatch(ids, decided)).toBe(1);
    const v = batchView(ids, decided, 1);
    expect(v.count).toBe(3);
    expect(v.ids).toHaveLength(BATCH);
    expect(v.left).toEqual(ids.slice(28, 40));
    expect(batchText(v)).toBe('Batch 2 of 3 · 12 left');
    expect(batchView(ids, decided, 2).ids).toHaveLength(5);
    expect(currentBatch(ids, new Set(ids))).toBe(-1);
  });
});

describe('decisions and the export', () => {
  const rows: CandidateReviewRow[] = [decisionRow('b', 'approve', 1), decisionRow('a', 'wrong', 2), decisionRow('c', 'fix', 3, { reason: 'gear', note: '  needs a box  ' }), decisionRow('gone', 'approve', 4)];

  it('only approvals become sure; a Fix keeps its reason and note with the id', () => {
    expect(approvedIds(rows)).toEqual(['b', 'gone']);
    expect(rows[2]).toEqual({ id: 'c', decision: 'fix', reason: 'gear', note: 'needs a box', at: 3 });
    expect(decisionRow('d', 'approve', 1, { reason: 'gear', note: 'x' })).toEqual({ id: 'd', decision: 'approve', at: 1 });
    expect(canFix(null, '')).toBe(false);
    expect(canFix('photo', '')).toBe(true);
    expect(canFix('other', ' ')).toBe(false);
    expect(canFix('other', 'grip')).toBe(true);
    expect(decisionRow('e', 'fix', 1, { reason: 'other', note: 'x'.repeat(500) }).note).toHaveLength(NOTE_MAX);
  });

  it('checks a stored row strictly', () => {
    for (const r of rows) expect(isReviewRow(r)).toBe(true);
    expect(isReviewRow({ id: 'x', decision: 'approve', at: 1, extra: 1 })).toBe(false);
    expect(isReviewRow({ id: 'x', decision: 'approve', reason: 'photo', at: 1 })).toBe(false);
    expect(isReviewRow({ id: '', decision: 'approve', at: 1 })).toBe(false);
    expect(isReviewRow({ id: 'x', decision: 'fix', reason: 'smell', at: 1 })).toBe(false);
    expect(isReviewRow({ id: 'x', decision: 'wrong', at: Number.NaN })).toBe(false);
  });

  it('exports only ids, decisions and Fix notes of known candidates, sorted, nothing personal', () => {
    const out = buildApprovalsExport(rows, ['a', 'b', 'c', 'z'], 'f00c', Date.UTC(2026, 10, 11));
    expect(out).toEqual({
      format: 'anygym-candidate-approvals-v1',
      sourceSha: 'f00c',
      exportedAt: '2026-11-11T00:00:00.000Z',
      total: 4,
      decided: 3,
      approved: ['b'],
      wrong: ['a'],
      fix: [{ id: 'c', reason: 'gear', note: 'needs a box' }],
    });
    expect(Object.keys(out).sort()).toEqual(['approved', 'decided', 'exportedAt', 'fix', 'format', 'sourceSha', 'total', 'wrong']);
  });
});

describe('the coverage report', () => {
  const eligible = eligibleDemos(read<MapEntry[]>('data/exercise-map.json'), read<{ exercises: { catalogId: string }[] }>('data/catalog-demos.json').exercises, catalogIds);
  const sure = sureLadderMoves(patternFile.patterns, (id) => eligible.has(id));

  it('counts a place and a pattern the same way the app picks moves', () => {
    const moves: Move[] = [
      { id: 'a', group: 'squat', requires: [], ladder: true },
      { id: 'b', group: 'squat', requires: [['dumbbells']], ladder: true },
      { id: 'c', group: 'mobility', requires: [], ladder: false },
    ];
    const rows = presetRows([], moves, PRESET_KITS);
    expect(rows.find((r) => r.id === 'bodyweight')).toMatchObject({ today: 0, ifAll: 2, ifAllLadder: 1, target: 25 });
    expect(rows.find((r) => r.id === 'dumbbells')).toMatchObject({ ifAll: 3, ifAllLadder: 2 });
    expect(groupRows(moves.slice(0, 1), moves.slice(1), ['squat', 'mobility'])).toEqual([
      { id: 'squat', label: 'squat', today: 1, ifAll: 2, ifAllLadder: 2, target: 3 },
      { id: 'mobility', label: 'mobility', today: 0, ifAll: 1, ifAllLadder: 1, target: 3 },
    ]);
  });

  it('the committed reports/coverage-3.5e.md is what the script writes today', () => {
    const r = coverageReport({
      sure,
      candidates: committed.candidates,
      groups: GROUPS,
      dropped: Object.values(curation.photos).filter((n) => n.startsWith('drop')).length,
      sourceTotal: slice.total,
      catalogTotal: catalogIds.size,
    });
    expect(readFileSync('reports/coverage-3.5e.md', 'utf8')).toBe(r.text);
    // The places the hotel was short on are met once approved (strength and core moves only).
    for (const p of r.presets) expect(p.ifAllLadder, p.label).toBeGreaterThanOrEqual(p.target);
    expect(r.presets.find((p) => p.id === 'hotel')!.today).toBeLessThan(25);
  });
});
