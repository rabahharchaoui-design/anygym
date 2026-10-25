// Privacy masks for anything automatic that leaves the phone or reaches G's phone (SPEC 24): crash
// messages, stacks, console errors and push notifications. Pure, no imports: the app and the
// anygym-api Worker share this one file. Free text is reduced to what is safe to keep: lower case
// words, code identifiers, known error words and our own script locations. Everything else
// (names: First Last or after a title; emails, phone numbers, long numbers, ids, URLs, file
// paths) becomes a placeholder.

export const MASK_MAX = 160;

/** Capitalized words that are safe in error text (sentence starters, browser and library terms). */
const SAFE_WORDS = new Set(
  (
    'A An The This That It No Not Cannot Can Could Did Does Failed Unable Unexpected Invalid Maximum Minified Uncaught Unhandled Load Loading ' +
    'Network Object Undefined Null Script Unknown Fetch Request Response Transaction Database Quota Storage Error Errors Exception Test Crash ' +
    'Promise Array Function String Number Boolean Symbol Date Map Set Proxy Reflect Math Intl Blob File Image Canvas Worker Origin Access ' +
    'Control Allow Status Code Too Many Value Type Range Reference Syntax Internal Aborted Abort Timeout Timed Out Missing Property Properties ' +
    'Expected Got Received Only Must Should Please Try Again Some All Any Out Of Memory Stack Call Size Exceeded Element Node Document Window ' +
    'Navigator Service Is Was Were Has Have Had In On At For From To With Without And Or But If When Then Of Bad Wrong Empty Root Missing ' +
    'React Dexie IndexedDB Safari WebKit Chrome Android iOS iPhone Settings Today Run History Plans Workout Finish Log Set Sets Reps Weight ' +
    'Bar Plates Plate Dumbbells Dumbbell Machine Timer Rest Back Done Send Report Problem Screen Page App AnyGym Help Privacy Gym Gyms Unit Units'
  ).split(' '),
);

const ACRONYMS = new Set(['API', 'JSON', 'URL', 'HTTP', 'HTTPS', 'DOM', 'CSS', 'HTML', 'SVG', 'PWA', 'UI', 'ID', 'IDB', 'CORS', 'UTF', 'JS']);

const SCRIPT = /\.(?:m?js|jsx|tsx?|css)$/;

/** A script reference: keep only the file name and line:col ('index-Ab12.js:40:12'). */
function scriptRef(url: string, rest: string): string | null {
  const path = url.replace(/^[a-z]+:\/\/[^/\s]*/i, '').split(/[?#]/)[0] ?? '';
  const file = path.split('/').pop() ?? '';
  if (!SCRIPT.test(file)) return null;
  const pos = /^((?::\d+){0,2})/.exec(rest)?.[1] ?? '';
  return `${file}${pos}`;
}

const safe = (w: string) => SAFE_WORDS.has(w) || ACRONYMS.has(w);

/**
 * Names: runs of two or more capitalized words (First Last), and a word after a title (Mr, Dr,
 * Coach). A single capitalized word stays ("Bench press froze", "Smith machine stuck").
 */
function maskNames(s: string): string {
  return s
    .replace(/\b(Mr|Mrs|Ms|Miss|Dr|Coach)(\.?)(\s+)[A-Z][A-Za-z'’-]*/g, (_m, t: string, dot: string, sp: string) => `${t}${dot}${sp}[name]`)
    .replace(/\b[A-Z][a-z'’-]+(?:[ \t]+[A-Z][a-z'’-]+)+\b/g, (run) => {
      const words = run.split(/([ \t]+)/);
      // Only consecutive words that are not common words count as a name.
      const idx = words.map((w, i) => (i % 2 === 0 && !safe(w) ? i : -1));
      return words
        .map((w, i) => {
          if (i % 2 === 1 || idx[i] === -1) return w;
          const prev = idx[i - 2] ?? -1;
          const next = idx[i + 2] ?? -1;
          return prev !== -1 || next !== -1 ? '[name]' : w;
        })
        .join('');
    });
}

/**
 * Masks one piece of automatic text and cuts it to `max` characters. Emails, phone numbers, digit
 * runs of 6 or more, ids, URLs (script URLs keep their file name and line), file paths and
 * runs of capitalized words that look like names are replaced.
 */
export function maskText(input: string, max = MASK_MAX): string {
  let s = String(input)
    // URLs: our scripts keep file:line:col, any other URL (and its path) is dropped.
    .replace(/\b(?:https?|blob|file|webpack|chrome-extension):\/\/[^\s)'"]*/gi, (m) => {
      const pos = /((?::\d+){1,2})$/.exec(m)?.[1] ?? '';
      const url = pos ? m.slice(0, -pos.length) : m;
      return scriptRef(url, pos) ?? '[url]';
    })
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    // File system paths that are not plain script names.
    .replace(/(?:^|\s)(?:~|\/(?:Users|home|private|var|tmp|data|storage|sdcard))\/\S*/g, ' [path]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b(?=[A-Za-z0-9_-]{20,}\b)(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]+\b/g, '[id]')
    // Phone numbers: 7+ digits with spaces, dots, dashes or brackets between them.
    .replace(/\+?\(?\d(?:[\s().-]*\d){6,}/g, '[phone]')
    .replace(/\d{6,}/g, '[n]')
    // Query strings left on anything else.
    .replace(/\?[^\s)]*=[^\s)]*/g, '');
  s = maskNames(s).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** A route with its ids replaced: '/workout/3f2…/done?x' → '/workout/:id/done'. */
export function maskRoute(hashOrPath: string): string {
  const path = (hashOrPath.startsWith('#') ? hashOrPath.slice(1) : hashOrPath).split(/[?#]/)[0] || '/';
  const parts = path.split('/').filter(Boolean);
  const out = parts.map((seg, i) => {
    const prev = parts[i - 1];
    if (prev === 'workout' || prev === 'history' || prev === 'plans') return ':id';
    return /^[a-z][a-z-]{0,47}$/.test(seg) || seg === ':id' ? seg : ':id';
  });
  return `/${out.join('/')}`.slice(0, 120);
}

/** The stack frames that point into our own scripts, as 'fn@index-Ab12.js:40:12'. Others are dropped. */
export function maskStack(stack: string, ownScript: (url: string) => boolean, maxLines = 12, max = 2000): string {
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const m = /([a-z][a-z-]*:\/\/[^\s)]+?)(?::(\d+))?(?::(\d+))?\)?\s*$/i.exec(line.trim());
    if (!m || !ownScript(m[1]!)) continue;
    const ref = scriptRef(m[1]!, [m[2], m[3]].filter(Boolean).map((n) => `:${n}`).join(''));
    if (!ref) continue;
    const fn = /^(?:at\s+)?([\w$.<>]+)(?:@|\s+\()/.exec(line.trim())?.[1];
    frames.push(fn && /^[\w$.<>]{1,60}$/.test(fn) ? `${fn}@${ref}` : ref);
    if (frames.length >= maxLines) break;
  }
  return frames.join('\n').slice(0, max);
}

export type PushKind = 'feedback' | 'crash' | 'fixed';

/** The one formatter for every phone push (SPEC 24): masked, short, never personal. */
export function formatPush(kind: PushKind, r: { id?: number; message?: string | null; route?: string | null }): { title: string; body: string } {
  const screen = `Screen: ${maskRoute(r.route ?? '/')}`;
  if (kind === 'fixed') return { title: 'AnyGym: bug fixed', body: `Report #${r.id ?? '?'} · ${screen}\nClose and reopen the app to get it.` };
  const first = (r.message ?? '').split('\n').find((l) => l.trim()) ?? '';
  const line = maskText(first, 80) || 'No text';
  return { title: kind === 'feedback' ? 'AnyGym: new bug report' : 'AnyGym: new crash', body: `${line}\n${screen}` };
}
