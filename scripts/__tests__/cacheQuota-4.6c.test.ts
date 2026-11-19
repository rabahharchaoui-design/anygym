import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PLAN 4.6c (6): when the phone runs out of room, the photo and voice caches may be emptied (they
// fill again as photos show and the Run tab saves the voice), instead of the save failing.

const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const optionsOf = (cache: string) => new RegExp(`options: \\{ cacheName: '${cache}',[^\\n]*\\}`).exec(config)?.[0] ?? '';

describe('runtime caches give way when storage is full (PLAN 4.6c 6)', () => {
  it.each(['exercise-photos', 'run-voice'])('%s purges on a quota error', (cache) => {
    expect(optionsOf(cache)).toMatch(/expiration: \{[^}]*purgeOnQuotaError: true/);
  });
});
