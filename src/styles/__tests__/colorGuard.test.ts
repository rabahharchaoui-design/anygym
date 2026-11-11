import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHEET_BG } from '../../lib/plateColors';

// PLAN 3.5t (Titanium Glass): every colour in the app comes from src/styles/tokens.css. This fails
// when a raw colour (hex, rgb(), hsl()) is written anywhere else under src, and when the old lime
// comes back anywhere in src, public or index.html.

const ROOT = join(__dirname, '../../..');
const SRC = join(ROOT, 'src');
const TOKENS = 'src/styles/tokens.css';

/** Fixed inks that cannot follow the theme. Keep this list short; say why for each. */
const ALLOW = [
  'src/components/load/BarSvg.tsx', // the steel of the drawn barbell: a picture of real metal
  'src/lib/plateColors.ts', // the paint of real plates (red 55s, blue 45s...), a real world colour code
  'src/lib/__tests__/plateColors.test.ts', // checks those paints
  'src/lib/bodyArt/', // third party body drawings (MIT), their own data; the app paints them from tokens
  'src/styles/__tests__/colorGuard.test.ts', // this file
];

const TEXT = /\.(css|ts|tsx|js|jsx|mjs|svg|html|json|webmanifest|md|txt)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.test(name)) out.push(path);
  }
  return out;
}

/** The file without its comments (block comments everywhere, line comments in code files). */
function code(path: string): string {
  let text = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\.(ts|tsx|js|jsx|mjs)$/.test(path)) text = text.replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
  return text;
}

// A hex colour is # and 3, 4, 6 or 8 hex digits, not part of a longer word (so "#/workout" routes,
// url(#gradient-id) references and CSS ids are not colours).
const HEX = /(?<![\w&(/])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const FUNC = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;
const LIME = /d4ff3a|e0ff6a|212[\s,]+255[\s,]+58/i;

const rel = (path: string) => relative(ROOT, path).split('\\').join('/');

describe('Titanium Glass colour guard (PLAN 3.5t)', () => {
  it('the detector sees colours and leaves routes, ids and tokens alone', () => {
    const hits = (line: string) => [...(line.match(HEX) ?? []), ...(line.match(FUNC) ?? [])].length;
    for (const bad of ['color: #fff;', 'fill="#0E0E10"', "stroke: '#9fd3ff80'", 'background: rgb(0 0 0 / 0.5)', 'rgba(255, 255, 255, 0.1)', 'hsl(210 100% 81%)']) expect(hits(bad), bad).toBeGreaterThan(0);
    for (const ok of ["navigate('#/workout')", 'fill="url(#bar-cyl)"', 'color: var(--accent);', 'color-mix(in srgb, var(--accent) 12%, transparent)', 'href="#/add"', '&#8203;']) expect(hits(ok), ok).toBe(0);
  });

  it('no raw colour under src outside tokens.css', () => {
    const found: string[] = [];
    for (const path of walk(SRC)) {
      const name = rel(path);
      if (name === TOKENS || ALLOW.some((a) => name.startsWith(a))) continue;
      if (name.endsWith('.json')) continue; // data, not styling (exercise names can hold a "#")
      code(path)
        .split('\n')
        .forEach((line, i) => {
          const hits = [...(line.match(HEX) ?? []), ...(line.match(FUNC) ?? [])];
          if (hits.length) found.push(`${name}:${i + 1}  ${hits.join(' ')}`);
        });
    }
    expect(found, `raw colours outside ${TOKENS}: use a token (or color-mix of tokens)\n${found.join('\n')}`).toEqual([]);
  });

  it('the old lime is nowhere in src, public or index.html', () => {
    const found: string[] = [];
    for (const path of [...walk(SRC), ...walk(join(ROOT, 'public')), join(ROOT, 'index.html')]) {
      if (rel(path) === 'src/styles/__tests__/colorGuard.test.ts') continue;
      if (LIME.test(readFileSync(path, 'utf8'))) found.push(rel(path));
    }
    expect(found).toEqual([]);
  });

  it('the tokens are Titanium Glass: ice blue accent with dark text on it, amber and red kept', () => {
    const css = readFileSync(join(ROOT, TOKENS), 'utf8');
    const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase();
    expect(token('accent')).toBe('#9fd3ff');
    expect(token('on-accent')).toBe('#0f1114');
    expect(token('text')).toBe('#f2f4f7');
    expect(token('text-2')).toBe('#a9b2bd');
    expect(token('amber')).toBe('#ffb020');
    expect(token('red')).toBe('#ff4d4d');
    expect(token('accent-glow')).toContain('159 211 255');
    expect(token('accent-soft')).toContain('159 211 255');
    // The plate contrast check (src/lib/plateColors.ts) uses the sheet colour: the two stay equal.
    expect(token('sheet-bg')).toBe(SHEET_BG.toLowerCase());
    // Reduce Transparency gets solid fills and no blur.
    expect(css).toMatch(/prefers-reduced-transparency: reduce[\s\S]*--glass-blur: none/);
  });
});
