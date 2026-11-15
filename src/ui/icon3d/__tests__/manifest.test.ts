// PLAN 3.6i: the exported 3D icons. Every icon the app can show exists in both formats, is small,
// has the size the manifest says and clear corners; the manifest covers every goal, place and style.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { GOALS, PLACES } from '../../../lib/intake/options';
import { STYLE_ORDER } from '../../../lib/quickStyles';
import { ICONS_3D, WIRED_GROUPS, icon3d, icon3dUrl, wantsLessData } from '../icons';

const file = (name: string, format: 'avif' | 'webp') => fileURLToPath(new URL(`../../../../public/${icon3dUrl(name, format, '')}`, import.meta.url));
const names = Object.keys(ICONS_3D);
const wired = names.filter((n) => WIRED_GROUPS.includes(ICONS_3D[n]!.group));
const MAX = 40 * 1024;

describe('3D icon manifest (PLAN 3.6i)', () => {
  it('has one icon for every goal, place and Quick workout style, and nothing else is wired', () => {
    const want = [...GOALS.map((g) => `goal-${g.id}`), ...PLACES.map((p) => `place-${p.id}`), ...STYLE_ORDER.map((s) => `style-${s}`)];
    expect([...wired].sort()).toEqual([...new Set(want)].sort());
    expect(wired).toHaveLength(20);
    for (const n of wired) expect(ICONS_3D[n]!.path).toBe('');
  });

  it('art that waits for its screen stays out of the precached folder and is not offered to the app', () => {
    const waiting = names.filter((n) => !wired.includes(n));
    expect(waiting.sort()).toEqual(['passport-ink', 'passport-paper', 'run-faster5k', 'run-first10k', 'run-first5k']);
    for (const n of waiting) {
      expect(ICONS_3D[n]!.path).toBe('later/');
      expect(icon3d(n)).toBeUndefined();
    }
    expect(icon3d(undefined)).toBeUndefined();
    expect(icon3d('goal-nope')).toBeUndefined();
    expect(icon3d('goal-muscle')).toBe(ICONS_3D['goal-muscle']);
  });

  it.each(names)('%s exists in both formats with the bytes the manifest says', (n) => {
    for (const format of ['avif', 'webp'] as const) {
      expect(existsSync(file(n, format)), `${n}.${format}`).toBe(true);
      expect(statSync(file(n, format)).size).toBe(ICONS_3D[n]![format]);
    }
  });

  it.each(wired)('%s is under 40 KB, the stated size, square at 3x its slot, with clear corners', async (n) => {
    const entry = ICONS_3D[n]!;
    expect(entry.width).toBe(entry.height);
    expect(entry.slot).toBe({ goal: 48, place: 48, style: 44 }[entry.group]);
    expect(entry.width).toBe(entry.slot! * 3);
    for (const format of ['avif', 'webp'] as const) {
      expect(entry[format]).toBeLessThan(MAX);
      const { data, info } = await sharp(file(n, format)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([entry.width, entry.height]);
      const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
      const last = info.width - 1;
      // Corners fully clear, and the art is really there in the middle rows.
      for (const [x, y] of [[0, 0], [last, 0], [0, last], [last, last]] as const) expect(alpha(x, y), `${n}.${format} corner ${x},${y}`).toBeLessThanOrEqual(2);
      let solid = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 200) solid++;
      expect(solid / (info.width * info.height)).toBeGreaterThan(0.1);
      // No clipped glow: the outermost ring of pixels is clear all the way round.
      let edge = 0;
      for (let i = 0; i <= last; i++) edge = Math.max(edge, alpha(i, 0), alpha(i, last), alpha(0, i), alpha(last, i));
      expect(edge, `${n}.${format} edge`).toBeLessThanOrEqual(8);
    }
  });

  it('the wired set is small enough to precache in both formats', () => {
    const total = wired.reduce((sum, n) => sum + ICONS_3D[n]!.avif + ICONS_3D[n]!.webp, 0);
    expect(total).toBeLessThan(300 * 1024);
  });

  it('serves a file from its folder under the app base', () => {
    expect(icon3dUrl('goal-muscle', 'avif', '/anygym/')).toBe('/anygym/icons3d/goal-muscle.avif');
    expect(icon3dUrl('run-first5k', 'webp', '/anygym/')).toBe('/anygym/icons3d/later/run-first5k.webp');
  });

  it('saves data when the phone asks for it', () => {
    const no = () => false;
    expect(wantsLessData(undefined, no)).toBe(false);
    expect(wantsLessData({}, no)).toBe(false);
    expect(wantsLessData({ connection: { saveData: false } }, no)).toBe(false);
    expect(wantsLessData({ connection: { saveData: true } }, no)).toBe(true);
    expect(wantsLessData({}, (q) => q === '(prefers-reduced-data: reduce)')).toBe(true);
  });
});
