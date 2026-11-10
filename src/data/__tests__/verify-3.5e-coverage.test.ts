// Tester PLAN 3.5e: recompute the coverage numbers from the data, independent of src/lib/candidates/coverage.ts.
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PATTERN_FILE } from '../patterns';
import { photoEligibility } from '../exerciseInfo';
import { PRESET_KITS } from '../../lib/candidates/presets';
import { PATTERNS, supports, workoutIdOf } from '../../lib/swap';

type C = { id: string; pattern: string; ladder: boolean; requires: string[][] };
const CANDS = (JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { candidates: C[] }).candidates;

describe('coverage recompute', () => {
  it('prints', () => {
    const sure = PATTERNS.flatMap((p) => PATTERN_FILE.patterns[p].candidates.filter((c) => photoEligibility(c.planId ? undefined : c.id) !== 'none' || (c.planId && photoEligibility(c.id) !== 'none')).map((c) => ({ id: workoutIdOf(c), pattern: p as string, requires: c.requires as string[][] })));
    const lines: string[] = [];
    for (const k of PRESET_KITS) {
      const t = sure.filter((m) => supports(m.requires as never, k.kit)).length;
      const ladAll = CANDS.filter((c) => c.ladder && supports(c.requires as never, k.kit)).length;
      const allC = CANDS.filter((c) => supports(c.requires as never, k.kit)).length;
      lines.push(`${k.id}: sure today ${t}; + ladder cands ${ladAll} = ${t + ladAll}; all cands ${allC} (total ${t + allC})`);
    }
    const pat: string[] = [];
    for (const p of [...PATTERNS, 'cardio', 'mobility', 'power', 'accessory']) {
      const s = sure.filter((m) => m.pattern === p).length;
      const c = CANDS.filter((x) => x.pattern === p).length;
      pat.push(`${p}: ${s} -> ${s + c}`);
    }
    console.log(lines.join('\n') + '\n' + pat.join('\n'));
  });
});
