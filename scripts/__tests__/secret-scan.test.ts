import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { ALLOWLIST, scanContent } from '../secret-scan.mjs';

const SCAN = join(process.cwd(), 'scripts', 'secret-scan.mjs');
// Every fake secret is assembled at run time, so this file itself stays clean for the scan.
const j = (...p: string[]) => p.join('');
const FAKE_LIST: Array<[string, string]> = [
  ['aws-access-key', `const k = "${j('AKIA', 'ABCDEFGHIJKLMNOP')}";`],
  ['github-token', `token ${j('ghp', '_', 'a'.repeat(36))}`],
  ['private-key', `${j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----')}`],
  ['bearer-string', `Authorization: ${j('Bear', 'er ')}${'Ab1'.repeat(10)}`],
  ['database-url', `url=${j('post', 'gres')}://app:pw@db.example.com:5432/app`],
  ['ntfy-topic-url', `curl ${j('https://ntfy', '.sh/')}${j('my', '-private-', 'topic42')}`],
  ['literal-credential', `${j('NTFY', '_TOPIC')} = "${j('abc', 'def', 'ghi')}"`],
  ['literal-credential', `const ${j('pass', 'word')} = "${'x9'.repeat(5)}";`],
];
const FAKES = Object.fromEntries(FAKE_LIST) as Record<string, string>;

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'scan-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (...args: string[]) => spawnSync('node', [SCAN, ...args], { encoding: 'utf8' });
const dist = () => {
  mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
  return join(dir, 'dist');
};

describe('scanContent', () => {
  for (const [rule, text] of FAKE_LIST) {
    it(`catches ${rule}`, () => {
      expect(scanContent(`ok\n${text}\nok`).map((f: { rule: string; line: number }) => [f.rule, f.line])).toContainEqual([rule, 2]);
    });
  }
  it('passes ordinary code, env references and placeholders', () => {
    const clean = [
      'const token = newId();',
      'curl "ntfy.sh/$(cat ~/.config/anygym/topic)"',
      'Authorization: Bearer ${token}',
      'const password = process.env.PASSWORD;',
      'postgres is a database',
      'const url = "https://example.com/a";',
    ].join('\n');
    expect(scanContent(clean)).toEqual([]);
  });
  it('lets the documented public identifiers through, each with a reason', () => {
    for (const a of ALLOWLIST) {
      expect(a.why.length).toBeGreaterThan(20);
      expect(scanContent(`database_id: "${a.value}"`)).toEqual([]);
    }
  });
  it('flags sourceMappingURL only in dist mode', () => {
    const t = '//# sourceMapping' + 'URL=app.js.map';
    expect(scanContent(t)).toEqual([]);
    expect(scanContent(t, { dist: true })[0].rule).toBe('source-map-comment');
  });
});

describe('CLI on dist', () => {
  it('passes a clean build', () => {
    const d = dist();
    writeFileSync(join(d, 'index.html'), '<html><body>hello</body></html>');
    writeFileSync(join(d, 'assets', 'a.js'), 'console.log(1)');
    const r = run('--dist', '--dist-dir', d);
    expect(r.status).toBe(0);
  });
  for (const [rule, text] of FAKE_LIST) {
    it(`fails on ${rule}, names file and line, never prints the value`, () => {
      const d = dist();
      writeFileSync(join(d, 'assets', 'a.js'), `x\n${text}\n`);
      const r = run('--dist', '--dist-dir', d);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`assets/a.js:2 ${rule}`);
      const secret = text.match(/[A-Za-z0-9_-]{12,}/g) ?? [];
      for (const s of secret) if (s !== 'const' && !/^(Authorization|curl)/.test(s)) expect(r.stdout + r.stderr).not.toContain(s);
    });
  }
  it('fails on a .map file even when it is empty', () => {
    const d = dist();
    writeFileSync(join(d, 'assets', 'a.js.map'), '{}');
    const r = run('--dist', '--dist-dir', d);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('source-map-file');
  });
  it('fails on a sourceMappingURL comment', () => {
    const d = dist();
    writeFileSync(join(d, 'assets', 'a.js'), 'a();\n//# sourceMapping' + 'URL=a.js.map\n');
    const r = run('--dist', '--dist-dir', d);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/a.js:2 source-map-comment');
  });
  it('errors (nonzero) when dist is missing, and on unknown flags', () => {
    expect(run('--dist', '--dist-dir', join(dir, 'nope')).status).toBe(2);
    expect(run('--bogus').status).toBe(2);
  });
});

describe('CLI on tracked files', () => {
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  it('scans tracked files including unstaged edits, and ignores untracked ones', () => {
    git('init', '-q');
    writeFileSync(join(dir, 'a.txt'), 'clean\n');
    writeFileSync(join(dir, 'untracked.txt'), FAKES['aws-access-key']!);
    git('add', 'a.txt');
    expect(run('--tracked', '--root', dir).status).toBe(0);
    writeFileSync(join(dir, 'a.txt'), `clean\n${FAKES['github-token']}\n`);
    const r = run('--tracked', '--root', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('a.txt:2 github-token');
  });
});

describe('Codex review fixes (2.2f)', () => {
  const rules = (t: string, o?: { dist?: boolean }) => scanContent(t, o).map((f: { rule: string }) => f.rule);
  const RAND = 'aB3dE5gH7jK9mN1pQ3sT5vX7zC9eF2hJ4'; // random looking, 33 chars

  it('the scanner and its own test, tracked in a git repo, scan clean: no path skips', () => {
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    git('init', '-q');
    mkdirSync(join(dir, 'scripts', '__tests__'), { recursive: true });
    for (const file of ['scripts/secret-scan.mjs', 'scripts/__tests__/secret-scan.test.ts']) writeFileSync(join(dir, file), readFileSync(join(process.cwd(), file)));
    git('add', '.');
    const r = run('--tracked', '--root', dir);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('scans complete lines: a key or sourceMappingURL after 200,000 characters is still found', () => {
    const pad = 'a;'.repeat(150_000);
    expect(rules(`${pad}x="${j('AKIA', 'ABCDEFGHIJKLMNOP')}"`)).toContain('aws-access-key');
    expect(rules(`${pad}\n//# sourceMapping` + 'URL=x.map', { dist: true })).toContain('source-map-comment');
    expect(rules(`${pad}//# sourceMapping` + 'URL=x.map', { dist: true })).toContain('source-map-comment');
  });

  it('catches unquoted dotenv and shell assignments', () => {
    expect(rules(`${j('NTFY', '_TOPIC')}=anygym-xyz-private`)).toContain('unquoted-credential');
    expect(rules(`export ${j('CLOUDFLARE_API_', 'TOKEN')}=${RAND}`)).toContain('unquoted-credential');
    expect(rules(`${j('DATABASE', '_URL')}=${RAND}`)).toContain('unquoted-credential');
    expect(rules(`curl "https://x.test/?${j('tok', 'en')}=${RAND}"`)).toContain('unquoted-credential');
  });

  it('does not flag environment references, code or public keys', () => {
    expect(rules(`${j('NTFY', '_TOPIC')}=$NTFY`)).toEqual([]);
    expect(rules(`${j('API_', 'KEY')}=\${{ secrets.X }}`)).toEqual([]);
    expect(rules(`${j('API_', 'KEY')}=%API%`)).toEqual([]);
    expect(rules(`const ${j('tok', 'en')}=newId();`)).toEqual([]);
    expect(rules(`${j('VAPID_PUBLIC_', 'KEY')}=${RAND}`)).toEqual([]);
  });

  it('catches underscore-prefixed names and long random token assignments', () => {
    expect(rules(`const ${j('VAPID_PRIVATE', '_KEY')} = "${RAND}";`)).toContain('literal-credential');
    expect(rules(`const ${j('tok', 'en')} = "${RAND}";`)).toContain('random-token-literal');
    expect(rules(`const ${j('k', 'ey')} = 'exercise-barbell-back-squat-variation'`)).toEqual([]);
    expect(rules(`const ${j('tok', 'en')} = "abcdefghijklmnop"`)).toEqual([]);
  });

  it('catches passwords with spaces and punctuation; only complete placeholders pass', () => {
    expect(rules(`const ${j('pass', 'word')} = "correct<horse9";`)).toContain('literal-credential');
    expect(rules(`${j('pass', 'word')}: 'two words here!'`)).toContain('literal-credential');
    expect(rules(`${j('pass', 'word')}: "% off sale 100"`)).toContain('literal-credential');
    for (const ok of ['<your key>', '%PASSWORD_VAR%', '${PASSWORD}', 'changeme', '{{ secrets.PW }}'])
      expect(rules(`${j('pass', 'word')} = "${ok}"`)).toEqual([]);
  });
});
