import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../lib/run/voice/manifest.json';
import { allClipUrls, clipUrl } from '../voiceAudio';
// @ts-expect-error plain .mjs script, no types
import { shortHash } from '../../../scripts/short-hash.mjs';

// PLAN 4.6c (5): each voice clip carries its own version (a hash of its own bytes), so one new clip
// is downloaded again on its own, never the whole pack of 220.

type Clip = { file: string; ms: number; v?: string };
const clips = manifest.clips as Record<string, Clip>;

describe('one version per voice clip (PLAN 4.6c 5)', () => {
  it("every clip's version is the hash of its own file, and its address carries it", () => {
    for (const [id, c] of Object.entries(clips)) {
      const bytes = readFileSync(new URL(`../../../public/voice/${c.file}`, import.meta.url));
      expect(c.v, id).toBe(shortHash(bytes));
      expect(clipUrl(id)).toMatch(new RegExp(`voice/${c.file.replace('.', '\\.')}\\?v=${c.v}$`));
    }
  });

  it('clips with different sounds have different addresses, no shared pack version', () => {
    const versions = allClipUrls().map((u) => u.split('?v=')[1]);
    expect(new Set(versions).size).toBeGreaterThan(versions.length * 0.95);
    expect(versions).not.toContain(manifest.version);
  });
});
