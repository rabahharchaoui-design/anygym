// Tester (PLAN 3.5e) independent gate check. Dumps every suggestion path to JSON; with
// V35E_OUT set it writes the dump (run in a HEAD worktree for the "before" and here for "after").
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, afterAll } from 'vitest';
import { PRESET_KITS } from '../../lib/candidates/presets';
import { PATTERN_FILE, SWAP_DATA } from '../patterns';
import { PLAN_EXERCISES } from '../planExercises';
import { PLANS } from '../plans';
import { QUICK_DEPS } from '../quick';
import { GENERATOR_DEPS } from '../generator';
import { upNextPool } from '../order';
import { demoFor, infoForExercise } from '../exerciseInfo';
import { exercisesForMuscle } from '../muscleExercises';
import { exerciseNameOf } from '../importMatch';
import { musclesForCatalog } from '../muscles';
import { buildIdeas, QUICK_MINUTES } from '../../lib/quick';
import { generatePlan } from '../../lib/generator';
import { pickerSections } from '../../lib/picker';
import { PATTERNS, adaptDay, swapCandidates, workoutIdOf } from '../../lib/swap';
import { approvedLadder, loadCandidateFile, ownerCandidates, setApproved } from '../candidateGate';

const REGIONS = ['chest', 'upper-back', 'lower-back', 'front-deltoids', 'back-deltoids', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'adductor', 'trapezius'] as const;
const QUERIES = ['', 'press', 'squat', 'lunge', 'row', 'curl', 'run', 'plank', 'stretch', 'kettlebell', 'band', 'jump'];

function dump(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ids = [...PATTERNS.flatMap((p) => PATTERN_FILE.patterns[p].candidates.map(workoutIdOf)), ...Object.keys(PATTERN_FILE.planExercises)];
  out.quick = PRESET_KITS.flatMap((k) =>
    (['new', '1_2y', '3y'] as const).flatMap((experience) =>
      QUICK_MINUTES.flatMap((minutes) =>
        [['muscle'], ['strength', 'fat_loss'], ['athletic']].map((goals) => {
          const r = buildIdeas({ base: { goals, experience, days: 3, minutes, gym: k.kit } as never, minutes, recent: [] }, QUICK_DEPS);
          return [k.id, experience, minutes, goals.join(), r.cards.map((c) => [c.id, c.title, c.items.map((i) => i.id)])];
        }),
      ),
    ),
  );
  out.swaps = PRESET_KITS.map((k) => ids.map((id) => swapCandidates(SWAP_DATA, id, k.kit).map((c) => c.id)));
  out.adapt = PRESET_KITS.map((k) => adaptDay(SWAP_DATA, Object.keys(PATTERN_FILE.planExercises).slice(0, 60).map((exerciseId) => ({ exerciseId })), k.kit));
  out.upNext = PRESET_KITS.map((k) => upNextPool(k.kit).map((p) => p.id));
  out.plans = PRESET_KITS.flatMap((k) => [30, 45, 60].map((minutes) => generatePlan({ goals: ['muscle'], experience: 'new', days: 3, minutes, gym: k.kit } as never, GENERATOR_DEPS)));
  out.frozen = PLANS.map((p) => JSON.stringify(p));
  out.picker = PRESET_KITS.flatMap((k) => QUERIES.map((q) => pickerSections(PLAN_EXERCISES, { query: q, part: null, recent: [], gym: k.kit }).map((s) => [s.title, s.items.map((i) => i.id)])));
  out.pickerNoGym = QUERIES.map((q) => pickerSections(PLAN_EXERCISES, { query: q, part: null, recent: [], gym: undefined }).map((s) => [s.title, s.items.map((i) => i.id)]));
  out.muscle = REGIONS.map((r) => exercisesForMuscle(r as never).map((e) => JSON.stringify(e)));
  return out;
}

afterAll(() => setApproved([]));

describe('verify 3.5e gate', () => {
  it('dump and no candidate leaks with no approvals', async () => {
    const d = JSON.stringify(dump());
    if (process.env.V35E_OUT) writeFileSync(process.env.V35E_OUT, d);
    if (process.env.V35E_HEAD) return; // baseline tree has no candidate file
    const file = await loadCandidateFile();
    expect(file.candidates.length).toBeGreaterThan(250);
    const base = new Set<string>([...PLAN_EXERCISES.map((e) => e.id)]);
    for (const c of file.candidates) {
      if (base.has(c.id)) continue;
      expect(d.includes(`"${c.id}"`), `id ${c.id} leaked`).toBe(false);
      expect(d.includes(c.id), `id substring ${c.id}`).toBe(false);
      expect(d.includes(`exc/${c.id}`), `photo ${c.id}`).toBe(false);
      expect(d.includes(`"${c.name}"`), `name ${c.name}`).toBe(false);
      expect(demoFor(c.id), c.id).toBeNull();
      expect(exerciseNameOf(c.id)?.toLowerCase() === c.name.toLowerCase() && !base.has(c.id), `name lookup ${c.id}`).toBe(false);
      expect(musclesForCatalog(c.id)).toBeNull();
      expect(infoForExercise(c.id).demo).toBeNull();
    }
    for (const p of PATTERNS) expect(approvedLadder(p)).toEqual([]);
    expect(ownerCandidates().length).toBe(file.candidates.length);
  });

  it('approving a subset adds only that subset, rejected/unapproved never', async () => {
    const file = await loadCandidateFile();
    const all = file.candidates.map((c) => c.id);
    const mine = new Set(all.filter((_, i) => i % 3 === 0));
    setApproved(mine);
    const d = JSON.stringify(dump());
    let seen = 0;
    for (const c of file.candidates) {
      const hit = d.includes(`"${c.id}"`) || d.includes(`exc/${c.id}/`);
      if (!mine.has(c.id)) expect(hit, `unapproved ${c.id} leaked`).toBe(false);
      else if (hit) seen++;
    }
    expect(seen).toBeGreaterThan(5);
    setApproved([]);
    setApproved([]);
    expect(JSON.stringify(dump())).toBe(JSON.stringify(JSON.parse(readFileSync('/tmp/v35e/after.json', 'utf8'))));
  });
});
