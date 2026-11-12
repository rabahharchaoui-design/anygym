import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// PLAN 3.6x (SPEC 5.4): weight math lives only in src/lib/load/. This fails when pound and kilogram
// conversion arithmetic shows up anywhere else under src: the conversion factors, a `* 2.2` or
// `/ 2.2` shortcut, or a second definition of KG_PER_LB / LB_PER_KG. Use convertForGym, lbToKg or
// kgToLb from src/lib/load instead.

const ROOT = join(__dirname, '../../..');
const SRC = join(ROOT, 'src');

/** Lines that may match, keyed by "path:trimmed line". Every entry says why. Keep this list short. */
const ALLOW: Record<string, string> = {
  // A drawing size, not a weight: a 100 lb plate is drawn about 2.2 times as thick as a 45.
  'src/lib/plates.ts:{ weight: 100, diameter: LB_BIG_DIAMETER, thickness: LB45_THICKNESS * 2.2, approx: true },':
    'picture thickness scale for the plate drawing, no unit conversion; keep out of load, rename the constant when the duplicates pass touches plates.ts',
};

const FACTORS = /2\.2046|2\.20462|0\.4536|0\.45359|0\.453592/;
const SHORTCUT = /[*/]\s*2\.2(?![0-9])/;
const DEFINITION = /\b(?:KG_PER_LB|LB_PER_KG)\b/;
const SUSPECT = [FACTORS, SHORTCUT, DEFINITION];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const rel = (path: string) => relative(ROOT, path).split('\\').join('/');
const exempt = (name: string) => name.startsWith('src/lib/load/') || name.startsWith('src/data/') || name.includes('/__tests__/') || /\.test\.tsx?$/.test(name);

/** The line without a trailing or whole line // comment and without block comment lines. */
function code(line: string): string {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  return line.replace(/\s\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

describe('weight arithmetic guard (PLAN 3.6x)', () => {
  it('the detector sees conversion arithmetic and leaves ordinary numbers alone', () => {
    const hits = (line: string) => SUSPECT.some((re) => re.test(line));
    for (const bad of ['kg * 2.2046', 'const lb = kg * 2.2;', 'lb / 2.2', 'x * 0.45359237', 'const KG_PER_LB = 0.4536;', 'LB_PER_KG']) expect(hits(bad), bad).toBe(true);
    for (const ok of ['const a = 12.25;', 'x * 22', 'y / 2.25', 'width: 2.2rem', 'const n = 10.2;']) expect(hits(ok), ok).toBe(false);
  });

  it('no unit conversion outside src/lib/load', () => {
    const found: string[] = [];
    const used = new Set<string>();
    for (const path of walk(SRC)) {
      const name = rel(path);
      if (exempt(name)) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!SUSPECT.some((re) => re.test(code(line)))) return;
          const key = `${name}:${line.trim()}`;
          if (ALLOW[key]) used.add(key);
          else found.push(`${name}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(found, `weight conversion outside src/lib/load: route it through load\n${found.join('\n')}`).toEqual([]);
    expect([...used].sort(), 'an allow list entry no longer matches any line: delete it').toEqual(Object.keys(ALLOW).sort());
  });
});
