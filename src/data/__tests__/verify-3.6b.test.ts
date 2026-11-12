import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { profileFor } from '../order';
import { isHeavy } from '../../lib/order';
import { PLAN_EXERCISES } from '../planExercises';
import { CATALOG_NAMES } from '../importMatch';

describe('verify 3.6b main lift classification', () => {
  it('prints', () => {
    const ids = new Map<string, string>();
    for (const e of PLAN_EXERCISES) ids.set(e.id, e.name);
    const cn = CATALOG_NAMES as unknown as Record<string, string> | Array<{ id: string; name: string }>;
    if (Array.isArray(cn)) for (const c of cn) ids.set(c.id, c.name);
    else for (const [k, v] of Object.entries(cn)) ids.set(k, String(v));
    const re = /squat|bench|deadlift|overhead|military|shoulder press|row|curl|raise|extension|press/i;
    const heavy: string[] = [], notHeavy: string[] = [];
    for (const [id, name] of ids) {
      if (!re.test(name + id)) continue;
      const p = profileFor(id, name);
      (isHeavy(p) ? heavy : notHeavy).push(`${id} | ${name} | ${p.pattern} ${(p as { implement?: string }).implement} tier${p.tier} load${p.load}`);
    }
    writeFileSync('/tmp/v36b-heavy.txt', 'TOTAL ' + ids.size + '\nHEAVY\n' + heavy.join('\n') + '\nNOT HEAVY\n' + notHeavy.join('\n'));
  });
});
