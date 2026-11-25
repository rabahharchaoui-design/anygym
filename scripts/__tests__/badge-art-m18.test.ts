import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Pluto's final Monolith art (Rabah, Nov 26): every file the manifest promises is really in public/,
// at the size the README gives, and M18 only ever names its own badges.
const PUB = 'public/';
const manifest = JSON.parse(readFileSync(`${PUB}art-manifest.json`, 'utf8'));

/** Width, height and PNG colour type (6 = RGBA) from the file header. */
function png(path: string) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('latin1'), path).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] };
}

describe('Monolith badge art for M18', () => {
  const m18: string[] = manifest.sets.m18;
  const future: string[] = manifest.sets.future_run_and_gym;

  it('lists the 12 M18 badges (16 slugs with tiers) and keeps the 6 run and gym badges out', () => {
    expect(m18).toHaveLength(16);
    expect(future).toEqual(['5k', '10k', 'half-marathon', 'hotel-hero', 'iron-week', 'plate-master']);
    expect(m18.filter((s) => future.includes(s))).toEqual([]);
  });

  it('every M18 badge has its 512, 1024 and locked files, square and transparent', () => {
    for (const slug of m18) {
      for (const [suffix, size] of [['', 512], ['-1024', 1024], ['-locked', 512], ['-locked-1024', 1024]] as const) {
        const file = `${PUB}badges/badge-${slug}${suffix}.png`;
        expect(existsSync(file), file).toBe(true);
        expect(png(file), file).toEqual({ w: size, h: size, type: 6 });
      }
    }
  });

  it('every file the manifest names exists', () => {
    for (const b of Object.values(manifest.badges) as { files: string[] }[]) for (const f of b.files) expect(existsSync(PUB + f), f).toBe(true);
    for (const s of Object.values(manifest.stamps) as { file: string }[]) expect(existsSync(PUB + s.file), s.file).toBe(true);
  });

  it('tier badges carry no numerals, so the app has the 10 / 50 / 100 and 1k / 10k / 100k lb meanings to draw', () => {
    expect(manifest.tier_rule.no_numerals).toBe(true);
    expect(manifest.tier_rule.meanings).toEqual({
      'workouts-t1': '10 sessions', 'workouts-t2': '50 sessions', 'workouts-t3': '100 sessions',
      'lifted-t1': '1,000 lb', 'lifted-t2': '10,000 lb', 'lifted-t3': '100,000 lb',
    });
  });
});

describe('Monolith passport stamps', () => {
  type Band = { rect_px: { x: number; y: number; w: number; h: number }; suggested_max_cap_height_px: number; alignment: string; text_color: string };
  const stamps = Object.entries(manifest.stamps) as [string, { file: string; ink_hex: string; city_band: Band; date_band: Band }][];

  it('has 8 text free 2048 px stamps with the city band above a smaller date band, inside the canvas', () => {
    expect(stamps).toHaveLength(8);
    for (const [name, s] of stamps) {
      expect(png(PUB + s.file), name).toEqual({ w: 2048, h: 2048, type: 6 });
      const c = s.city_band.rect_px, d = s.date_band.rect_px;
      for (const r of [c, d]) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 2048 && r.y + r.h <= 2048, name).toBe(true);
      expect(d.y, name).toBeGreaterThanOrEqual(c.y + c.h);
      expect(s.date_band.suggested_max_cap_height_px, name).toBeLessThan(s.city_band.suggested_max_cap_height_px);
      expect([s.city_band.alignment, s.date_band.alignment]).toEqual(['center', 'center']);
      expect([s.city_band.text_color, s.date_band.text_color]).toEqual([s.ink_hex, s.ink_hex]);
      expect(['#9FD3FF', '#8A9099', '#FFFFFF']).toContain(s.ink_hex);
    }
  });
});
