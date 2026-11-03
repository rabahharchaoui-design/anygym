#!/usr/bin/env node
// Secret guard (PLAN 2.2f). Fails the build when a credential, private key, bearer string, ntfy topic
// or database URL sits in (a) any git tracked file or (b) the built dist/ folder, or when dist/ ships
// a source map. Node built-ins only. It never prints a matched value: file, line and rule name only.
//
//   node scripts/secret-scan.mjs             scan tracked files and dist/
//   node scripts/secret-scan.mjs --tracked   tracked files only
//   node scripts/secret-scan.mjs --dist      dist/ only (also: --dist-dir <path>, --root <path>)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Strings that look like identifiers but are public on purpose. Each is removed from a line before the
 * rules run, and only an exact match is removed. Never add a value that grants access to anything.
 */
export const ALLOWLIST = [
  {
    value: '745c94d5-efb9-41bf-a4f4-f2e0b84d145f',
    why: 'Cloudflare D1 database id in workers/anygym-api/wrangler.jsonc. It names the database; it grants nothing without an account API token, and the repo already publishes it.',
  },
  {
    value: 'anygym-api.rabahharchaoui.workers.dev',
    why: 'Public workers.dev host of the report Worker. The browser calls it by design (src/lib/reporting/config.ts); the Worker checks origin and rate limits.',
  },
];

// Credential names are assembled from parts, so this file never contains a "name = value" pair for
// the rules below to trip over (the scanner scans itself like any other tracked file, no path skips).
const j = (...p) => p.join('');
const STRONG_NAMES = [j('pass', '(?:word|wd)'), j('sec', 'ret'), j('api[_-]?', 'key'), j('private[_-]?', 'key'), j('access[_-]?', '(?:token|key)'), j('auth[_-]?', 'token'), j('ntfy[_-]?', 'topic'), j('database[_-]?', 'url')].join('|');
const WEAK_NAMES = [j('tok', 'en'), j('k', 'ey')].join('|'); // only with a random looking value
const UNQUOTED_NAMES = [j('pass', '(?:word|wd)'), j('sec', 'ret'), j('tok', 'en'), j('api_?', 'key'), j('private_?', 'key'), j('access_?', 'key'), j('ntfy_?', 'topic'), j('database_?', 'url')].join('|');

/** A value that is a complete, recognized placeholder, never a real secret. Partial matches do not count. */
const PLACEHOLDER = new RegExp(
  '^(?:' +
    [
      '<[^<>]*>', // <your key>
      '%[A-Za-z0-9_]+%', // %VAR%
      '\\$\\{[^}]*\\}', // ${VAR}
      '\\{\\{[^}]*\\}\\}', // {{ secrets.X }}
      '\\$[A-Za-z_][A-Za-z0-9_]*', // $VAR
      'change[-_ ]?me', 'placeholder', 'your[-_ ][a-z0-9_ -]*', 'x{4,}', '\\*{3,}', 'redacted', 'example', 'dummy', 'secret',
    ].join('|') +
    ')$',
  'i',
);

function entropy(v) {
  const n = new Map();
  for (const c of v) n.set(c, (n.get(c) ?? 0) + 1);
  let h = 0;
  for (const k of n.values()) h -= (k / v.length) * Math.log2(k / v.length);
  return h;
}

/**
 * Random looking value (for the weak names token and key, and raw base64url keys such as a VAPID
 * private key): 24+ characters of base64/base64url, a letter and a digit, at least 3.3 bits of
 * entropy per character, and not a plain hyphenated slug. Ordinary ids and words stay below this.
 */
export function looksRandom(v) {
  return v.length >= 24 && /^[A-Za-z0-9_\-+/=]+$/.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v) && entropy(v) >= 3.3 && !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(v);
}

/** The quoted forms: NAME (any prefix, e.g. VAPID_PRIVATE_KEY) then : or =, then a quoted literal with any characters. */
const quoted = (names) => new RegExp(`(?:${names})["'\\]]?\\s*[:=]\\s*(["'\`])((?:(?!\\1)[^\\n]){1,}?)\\1`, 'gi');

/**
 * Rules. `re` is global and runs on each complete line; `accept(match)` can veto a match (placeholders,
 * values that are not random enough). The allowlist is applied first.
 */
export const RULES = [
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  { id: 'openai-or-sk-key', re: /\bsk-(?:proj-|live-|ant-)?[A-Za-z0-9_-]{24,}/g },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'stripe-key', re: /\b[sr]k_(?:live|test)_[0-9A-Za-z]{16,}/g },
  { id: 'private-key', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'bearer-string', re: /\bBearer\s+(?!(?:token|\$\{|<|\{|your|xxx|\*|\.\.\.))[A-Za-z0-9\-._~+/]{20,}=*/gi },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: 'database-url', re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver|libsql):\/\/[A-Za-z0-9_.~%+-]+(?::[^\s@'"`]*)?@?[A-Za-z0-9_.-]*/g },
  { id: 'ntfy-topic-url', re: /\bntfy\.sh\/(?!\$|<|\{|%)[A-Za-z0-9][A-Za-z0-9_-]{2,}/gi },
  // password / secret / api key / private key (also VAPID_PRIVATE_KEY and any prefix) with a quoted literal of 8+ characters.
  { id: 'literal-credential', re: quoted(STRONG_NAMES), accept: (m) => m[2].length >= 8 && !PLACEHOLDER.test(m[2].trim()) },
  // token or key with a long random looking quoted value (see looksRandom).
  { id: 'random-token-literal', re: quoted(WEAK_NAMES), accept: (m) => looksRandom(m[2]) },
  {
    // Unquoted dotenv, shell, YAML-less and URL query forms: NAME=value with no spaces around the =.
    // Environment references ($VAR, ${VAR}, %VAR%, <...>), code (parentheses, dots) and short values pass.
    id: 'unquoted-credential',
    re: new RegExp(`(?:^|[\\s;&|?])(?:export\\s+)?([A-Za-z0-9_]*(?:${UNQUOTED_NAMES}))=([A-Za-z0-9_\\-+/=~!@#^*]{8,})(?=$|[\\s;&|"'\`,)])`, 'gi'),
    accept: (m) => !/public/i.test(m[1]) && !PLACEHOLDER.test(m[2]),
  },
];

const MAP_FILE = /\.map$/i;
const SOURCE_MAP_COMMENT = /sourceMappingURL\s*=/;

/** Findings for one text: [{ rule, line }]. Pure, so tests can call it directly. */
export function scanContent(text, { dist = false } = {}) {
  const found = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]; // always the complete line, however long (minified bundles are one line)
    for (const a of ALLOWLIST) if (line.includes(a.value)) line = line.split(a.value).join('allowlisted');
    for (const rule of RULES) {
      for (const m of line.matchAll(rule.re)) {
        if (!rule.accept || rule.accept(m)) {
          found.push({ rule: rule.id, line: i + 1 });
          break;
        }
      }
    }
    if (dist && SOURCE_MAP_COMMENT.test(line)) found.push({ rule: 'source-map-comment', line: i + 1 });
  }
  return found;
}

function scanFile(abs, rel, dist) {
  const out = [];
  if (dist && MAP_FILE.test(rel)) out.push({ file: rel, rule: 'source-map-file', line: 1 });
  // latin1 keeps every byte (images, fonts, video) scannable without a decode error.
  const text = readFileSync(abs).toString('latin1');
  for (const f of scanContent(text, { dist })) out.push({ file: rel, ...f });
  return out;
}

export function trackedFiles(root) {
  const raw = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  return raw.toString('utf8').split('\0').filter(Boolean);
}

export function scanTracked(root) {
  const findings = [];
  let files = 0;
  for (const rel of trackedFiles(root)) {
    const abs = join(root, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue; // tracked but deleted in the working tree
    }
    if (!st.isFile()) continue;
    files++;
    findings.push(...scanFile(abs, rel, false));
  }
  return { findings, files };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

export function scanDist(distDir) {
  let st;
  try {
    st = statSync(distDir);
  } catch {
    throw new Error(`dist folder not found: ${distDir} (run vite build first)`);
  }
  if (!st.isDirectory()) throw new Error(`not a folder: ${distDir}`);
  const findings = [];
  const files = walk(distDir);
  for (const abs of files) findings.push(...scanFile(abs, relative(distDir, abs), true));
  return { findings, files: files.length };
}

function report(label, { findings, files }) {
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.rule < b.rule ? -1 : 1)));
  for (const f of findings) console.error(`secret-scan: ${label} ${f.file}:${f.line} ${f.rule}`);
  console.log(`secret-scan: ${label} ${files} files, ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  return findings.length;
}

export function main(argv = process.argv.slice(2)) {
  let root = process.cwd();
  let distDir;
  let tracked = false;
  let dist = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tracked') tracked = true;
    else if (a === '--dist') dist = true;
    else if (a === '--root') root = resolve(argv[++i] ?? '');
    else if (a === '--dist-dir') distDir = resolve(argv[++i] ?? '');
    else {
      console.error(`secret-scan: unknown argument ${a}`);
      return 2;
    }
  }
  if (!tracked && !dist) tracked = dist = true;
  try {
    let bad = 0;
    if (tracked) bad += report('tracked', scanTracked(root));
    if (dist) bad += report('dist', scanDist(distDir ?? join(root, 'dist')));
    return bad > 0 ? 1 : 0;
  } catch (e) {
    console.error(`secret-scan: ${e instanceof Error ? e.message : 'failed'}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
