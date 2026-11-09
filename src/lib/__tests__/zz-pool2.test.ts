import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import { requiresOf } from '../swap';
it('pool2', () => {
  const rows: string[] = [];
  for (const [pat, l] of Object.entries(SWAP_DATA.patterns)) for (const c of l.candidates) {
    const id = c.planId ?? c.id;
    rows.push(`${pat} | ${id} | cat:${c.id} | demo:${demoFor(id) ? 'Y' : '-'} | ${JSON.stringify(requiresOf(SWAP_DATA, id))}`);
  }
  appendFileSync('/tmp/pool2.txt', rows.join('\n') + '\n');
});
