import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// PLAN 1.10f, SPEC 0.6: no personal names in anything the app ships (plans, UI strings, assets).
// Scans every text file under src/, data/, public/ and index.html. Test files are not shipped and
// are skipped. The live GitHub Pages / repo URL is allowed. The one other exception is the old
// plan id in the schema migration, which maps saved data to the renamed plan and is never shown.

const ROOT = join(__dirname, '../../..');
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|icns|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|zip)$/i;
const ALLOWED: Record<string, RegExp> = {
  [join('src', 'db', 'schema.ts')]: /'ohrabah-split'/g,
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') walk(p, out);
    } else if (!BINARY.test(name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * The personal names found in `text`, after removing URLs on github.io / github.com and the
 * public report API host on workers.dev (SPEC 24), which carry the account name.
 */
export function personalNames(text: string): string[] {
  const clean = text.replace(/\S*github\.(io|com)\S*/gi, '').replace(/\S*\.workers\.dev\S*/gi, '');
  return [...clean.matchAll(/ohrabah|harchaoui|\brabah\b/gi)].map((m) => m[0]);
}

describe('personalNames', () => {
  it('finds the names in any case and ignores GitHub URLs', () => {
    expect(personalNames('The OhRabah Split')).toEqual(['OhRabah']);
    expect(personalNames('by Rabah Harchaoui')).toEqual(['Rabah', 'Harchaoui']);
    expect(personalNames('https://rabahharchaoui-design.github.io/anygym/')).toEqual([]);
    expect(personalNames('github.com/rabahharchaoui-design/anygym')).toEqual([]);
    expect(personalNames("'https://anygym-api.rabahharchaoui.workers.dev'")).toEqual([]);
    expect(personalNames('Classic 5 Day Split')).toEqual([]);
  });
});

describe('no personal names in shipped files', () => {
  const files = [...walk(join(ROOT, 'src'), []), ...walk(join(ROOT, 'data'), []), ...walk(join(ROOT, 'public'), []), join(ROOT, 'index.html')];

  it('scans the plan files and the UI', () => {
    const rel = files.map((f) => relative(ROOT, f).split(sep).join('/'));
    expect(rel).toContain('data/plans/five-day-split.json');
    expect(rel).toContain('data/plans/six-week-volume.json');
    expect(rel).toContain('index.html');
    expect(rel.some((f) => f.startsWith('src/screens/'))).toBe(true);
  });

  it('no file contains OhRabah, Harchaoui or Rabah', () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      let text = readFileSync(f, 'utf8');
      if (text.includes('\u0000')) continue;
      const allowed = ALLOWED[rel];
      if (allowed) text = text.replace(allowed, '');
      for (const name of personalNames(text)) hits.push(`${rel}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it('the plans name no author and credit no person', () => {
    for (const f of files.filter((p) => p.includes(`${sep}plans${sep}`) && p.endsWith('.json'))) {
      const plan = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
      expect(plan.author, f).toBeUndefined();
      expect(String(plan.source ?? ''), f).not.toMatch(/\bG's\b|\bG\b/);
      expect(String(plan.summary ?? ''), f).not.toMatch(/\bG's\b|\bG\b/);
    }
  });
});
