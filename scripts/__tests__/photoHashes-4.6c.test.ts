import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decodePhotoHashes, encodePhotoHashes, PHOTO_FRAMES, PHOTO_URL_PATTERN, photoVersionOf, versionedAsset } from '../../src/lib/photoVersion';
// @ts-expect-error plain .mjs script, no types
import { photoHashes } from '../photo-hashes.mjs';

// PLAN 4.6c (2): every exercise photo file has its own version. One changed photo is one new URL;
// the other photos keep theirs from build to build, so a phone downloads only what changed.

const SRC = join(__dirname, '..', '..', 'public', 'ex');
let tmp = '';
afterEach(() => tmp && rmSync(tmp, { recursive: true, force: true }));

/** Every photo URL a build of `root` makes, path to URL. */
function urls(root: string): Map<string, string> {
  const table = decodePhotoHashes(encodePhotoHashes(photoHashes(root, PHOTO_FRAMES)));
  const out = new Map<string, string>();
  for (const dir of readdirSync(root))
    for (const f of PHOTO_FRAMES) {
      if (!existsSync(join(root, dir, f))) continue;
      const path = `ex/${dir}/${f}`;
      out.set(path, versionedAsset(path, photoVersionOf(path, table, 'dev')));
    }
  return out;
}

function copyOf(dirs: string[]): string {
  tmp = mkdtempSync(join(tmpdir(), 'photo-hashes-'));
  for (const d of dirs) cpSync(join(SRC, d), join(tmp, d), { recursive: true });
  return tmp;
}

describe('one version per photo file (PLAN 4.6c 2)', () => {
  const dirs = readdirSync(SRC).sort().slice(0, 3);

  it('every photo gets a URL with its own version, kept by the service worker rule', () => {
    const all = urls(copyOf(dirs));
    expect(all.size).toBe(dirs.length * 4);
    for (const u of all.values()) {
      expect(u).toMatch(/\?v=[0-9a-z]{7}$/);
      expect(PHOTO_URL_PATTERN.test(`/anygym/${u}`)).toBe(true);
    }
    // Different bytes, different versions (the JPG and its WebP twin too).
    expect(new Set([...all.values()].map((u) => u.split('?v=')[1])).size).toBe(all.size);
  });

  it('the same photos make the same URLs in the next build', () => {
    const root = copyOf(dirs);
    expect(urls(root)).toEqual(urls(root));
  });

  it('changing one photo changes exactly that one URL', () => {
    const root = copyOf(dirs);
    const before = urls(root);
    writeFileSync(join(root, dirs[1]!, '1.webp'), Buffer.from('a new photo'));
    const after = urls(root);
    const changed = [...before.keys()].filter((k) => before.get(k) !== after.get(k));
    expect(changed).toEqual([`ex/${dirs[1]}/1.webp`]);
  });

  it('a missing file has no version; a photo the table does not know goes without one', () => {
    const root = copyOf(dirs.slice(0, 1));
    rmSync(join(root, dirs[0]!, '0.jpg'));
    const table = decodePhotoHashes(encodePhotoHashes(photoHashes(root, PHOTO_FRAMES)));
    expect(table.has(`ex/${dirs[0]}/0.jpg`)).toBe(false);
    expect(table.has(`ex/${dirs[0]}/0.webp`)).toBe(true);
    expect(photoVersionOf('ex/Nope/0.jpg', table, 'dev')).toBe('');
    expect(photoVersionOf('ex/Nope/0.jpg', null, 'dev')).toBe('dev');
    expect(photoHashes(join(root, 'none'), PHOTO_FRAMES)).toEqual({});
  });

  it('PLAN D1: frames 2 and 3 of a sequence get their own hashes; a two frame table is as short as before', () => {
    const root = copyOf(dirs.slice(0, 2));
    const before = encodePhotoHashes(photoHashes(root, PHOTO_FRAMES));
    // Every entry of a two frame exercise has exactly its four hashes (no empty tail for frames 2 and 3).
    for (const entry of before.split(';')) expect(entry.split(':')[1]!.split(',')).toHaveLength(4);
    writeFileSync(join(root, dirs[0]!, '2.jpg'), Buffer.from('frame two jpg'));
    writeFileSync(join(root, dirs[0]!, '2.webp'), Buffer.from('frame two webp'));
    writeFileSync(join(root, dirs[0]!, '3.jpg'), Buffer.from('frame three jpg'));
    writeFileSync(join(root, dirs[0]!, '3.webp'), Buffer.from('frame three webp'));
    const table = decodePhotoHashes(encodePhotoHashes(photoHashes(root, PHOTO_FRAMES)));
    for (const f of ['2.jpg', '2.webp', '3.jpg', '3.webp']) {
      const path = `ex/${dirs[0]}/${f}`;
      expect(table.get(path)).toMatch(/^[0-9a-z]{7}$/);
      expect(PHOTO_URL_PATTERN.test(`/anygym/${versionedAsset(path, table.get(path)!)}`)).toBe(true);
    }
    expect(table.has(`ex/${dirs[1]}/2.jpg`)).toBe(false);
    // The other exercise's entry did not change.
    const other = (t: string) => t.split(';').find((e) => e.startsWith(`${dirs[1]}:`));
    expect(other(encodePhotoHashes(photoHashes(root, PHOTO_FRAMES)))).toBe(other(before));
  });
});
