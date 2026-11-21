import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RADIUS_ALLOW } from './radiusAllow';

// PLAN M0 (Monolith, SPEC 10): corners come only from the radius tokens in src/styles/tokens.css
// (0 to 4 px). This fails when a corner is written as a raw length anywhere else under src (a CSS
// border radius in px, rem or em, a React borderRadius number, a Skeleton radius={n}) or when it
// uses --radius-pill, which Monolith removed. 50%, inherit and 0 stay allowed: a dot or a ring is
// round in real life. SVG rx in drawings is picture geometry, not a corner rule, so it is not read.
// PLAN M10 emptied radiusAllow.ts: there are no exceptions left.

const ROOT = join(__dirname, '../../..');
const SRC = join(ROOT, 'src');
const OWN = ['src/styles/tokens.css', 'src/styles/base.css'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') walk(path, out);
    } else if (/\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const rel = (path: string) => relative(ROOT, path).split('\\').join('/');

function code(path: string): string {
  let text = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\.tsx?$/.test(path)) text = text.replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
  return text;
}

const LENGTH = /(?<![\w.-])(?:\d*\.)?\d*[1-9]\d*(?:\.\d+)?(?:px|rem|em)\b/;
const CSS_RADIUS = /border(?:-(?:top|bottom|start|end))?(?:-(?:left|right|start|end))?-radius\s*:\s*([^;}]+)/g;
const JS_RADIUS = /\bborderRadius\s*:\s*(['"]?[\d.]+(?:px|rem|em)?['"]?)|\bradius=\{\s*(\d*\.?\d+)\s*\}/g;

/** The raw corners on one line of code. */
function rawCorners(line: string, css: boolean): string[] {
  const found: string[] = [];
  if (css) {
    for (const m of line.matchAll(CSS_RADIUS)) {
      const value = m[1] ?? '';
      if (LENGTH.test(value) || value.includes('--radius-pill')) found.push(m[0].trim());
    }
  } else {
    for (const m of line.matchAll(JS_RADIUS)) if (Number.parseFloat((m[1] ?? m[2] ?? '').replace(/['"]/g, '')) > 0) found.push(m[0].trim());
  }
  return found;
}

function offenders(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const path of walk(SRC)) {
    const name = rel(path);
    if (OWN.includes(name)) continue;
    const css = name.endsWith('.css');
    code(path)
      .split('\n')
      .forEach((line, i) => {
        for (const hit of rawCorners(line, css)) out.set(name, [...(out.get(name) ?? []), `${i + 1}: ${hit}`]);
      });
  }
  return out;
}

describe('Monolith corner guard (PLAN M0)', () => {
  it('the radius tokens are square: 0 to 4 px, and there is no pill radius', () => {
    const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(css).not.toMatch(/--radius-pill\s*:/);
    const radii = [...css.matchAll(/--radius-[\w-]+:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(radii.length).toBeGreaterThan(2);
    for (const value of radii) expect(Number.parseFloat(value), value).toBeLessThanOrEqual(4);
  });

  it('the detector sees raw corners and leaves tokens, circles and zero alone', () => {
    for (const bad of ['border-radius: 14px;', 'border-top-left-radius: 2px', 'border-radius: 28px 28px 0 0;', 'border-radius: 1rem;', 'border-radius: var(--radius-pill);'])
      expect(rawCorners(bad, true), bad).not.toEqual([]);
    for (const ok of ['border-radius: var(--radius-md);', 'border-radius: 50%;', 'border-radius: 0;', 'border-radius: inherit;', 'transition: border-radius 200ms ease;', 'border-radius: 0px;'])
      expect(rawCorners(ok, true), ok).toEqual([]);
    for (const bad of ['style={{ borderRadius: 12 }}', "borderRadius: '8px'", '<Skeleton height={76} radius={20} />']) expect(rawCorners(bad, false), bad).not.toEqual([]);
    for (const ok of ['borderRadius: lit.radius', 'borderRadius: radius', '<rect rx={4} />', 'radius={0}']) expect(rawCorners(ok, false), ok).toEqual([]);
  });

  it('no raw corner under src outside the token files and the shrinking allow list', () => {
    const found = [...offenders()].filter(([name]) => !RADIUS_ALLOW.includes(name)).map(([name, hits]) => `${name}\n  ${hits.join('\n  ')}`);
    expect(found, `raw corners: use var(--radius-sm|md|lg) from src/styles/tokens.css\n${found.join('\n')}`).toEqual([]);
  });

  it('the allow list only shrinks: every listed file still has a raw corner (remove it once fixed)', () => {
    const now = offenders();
    const fixed = RADIUS_ALLOW.filter((name) => !now.has(name));
    expect(fixed, 'these files are clean now: delete them from src/styles/__tests__/radiusAllow.ts').toEqual([]);
    expect(new Set(RADIUS_ALLOW).size).toBe(RADIUS_ALLOW.length);
    // M0 started with this many; the number may only go down.
    expect(RADIUS_ALLOW.length).toBeLessThanOrEqual(RADIUS_ALLOW_MAX);
  });
});

// M0 started at 93; M10 emptied it.
// PLAN M10: only true circles stay round, each marked data-round="ok" in its markup: the GPS dot
// (GpsChip, the map's "you are here" dot), the record dot (ResumeBar) and the hold timer's
// progress ring (TimedInput). A new 50% corner anywhere else is a pill or a round button.
const ROUND_OK = ['src/components/load/TimedInput.module.css', 'src/screens/run/Run.module.css', 'src/screens/run/RunMap.module.css', 'src/ui/ResumeBar.module.css'];

describe('Monolith circles (PLAN M10)', () => {
  it('a 50% corner lives only in the files of the true circles', () => {
    const round = walk(SRC)
      .filter((path) => path.endsWith('.css') && /radius\s*:\s*50%/.test(code(path)))
      .map(rel)
      .sort();
    expect(round).toEqual([...ROUND_OK].sort());
  });
});

const RADIUS_ALLOW_MAX = 0;
