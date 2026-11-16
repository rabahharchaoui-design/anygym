// 3.6z A18: every test kept skipped or as an expected failure says why, in one line: a comment just
// above an unconditional skip / fails / fixme, or the reason argument of a conditional test.skip.
// None is ever deleted for this; the reason is what lets the next person decide.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = join('scripts', '__tests__', 'skip-reasons.test.ts');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(test|spec)\.tsx?$/.test(name) || (dir.includes(`${join(ROOT, 'tests')}`) && name.endsWith('.ts'))) out.push(p);
  }
  return out;
}

// Built from parts so this file never matches itself.
const KEPT = new RegExp(`\\b(it|test|describe)\\.(${['sk', 'ip'].join('')}|fails|fixme)\\b`);
const NAMED = new RegExp(`\\b(it|test|describe)\\.(${['sk', 'ip'].join('')}|fails|fixme)(\\.each\\([^)]*\\))?\\(\\s*['"\`]`);
const WITH_REASON = /,\s*(['"`])[^'"`]+\1\s*\)+\s*;?\s*$/;

/** The kept tests without a reason, as "file:line". */
function missingReasons(path: string, text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!KEPT.test(line) || line.trim().startsWith('//')) return;
    const named = NAMED.test(line) || /\bit\.fails\b/.test(line);
    const above = lines.slice(0, i).reverse().find((l) => l.trim() !== '')?.trim() ?? '';
    const ok = named ? above.startsWith('//') : WITH_REASON.test(line) || above.startsWith('//');
    if (!ok) out.push(`${path}:${i + 1}`);
  });
  return out;
}

describe('kept tests say why (3.6z A18)', () => {
  it('the rule: a comment above a named skip, fails or fixme; a reason on a conditional skip', () => {
    const s = ['sk', 'ip'].join('');
    expect(missingReasons('a', `x\nit.${s}('t', () => {});`)).toEqual(['a:2']);
    expect(missingReasons('a', `// the hook is gone\nit.${s}('t', () => {});`)).toEqual([]);
    expect(missingReasons('a', `  (c ? it.fails : it)('t', () => {});`)).toEqual(['a:1']);
    expect(missingReasons('a', `  test.${s}(name !== 'iPhone SE');`)).toEqual(['a:1']);
    expect(missingReasons('a', `  test.${s}(name !== 'iPhone SE', 'SE only');`)).toEqual([]);
  });
  it('every file in src, scripts and tests', () => {
    const all = [join(ROOT, 'src'), join(ROOT, 'scripts'), join(ROOT, 'tests')].flatMap((d) => files(d));
    const missing = all.filter((p) => relative(ROOT, p) !== SELF).flatMap((p) => missingReasons(relative(ROOT, p), readFileSync(p, 'utf8')));
    expect(missing).toEqual([]);
  });
});
