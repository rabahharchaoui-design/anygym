// Privacy masks for anything that leaves the phone or reaches G's phone (SPEC 24). Pure, no
// imports: the app and the anygym-api Worker share this one file.
//
// Automatic text (crash messages, stacks, console errors, signatures) is allowlisted, never
// heuristically masked: it becomes an approved error code, a fixed message and our own script
// location ('TypeError: details hidden at index-Ab12.js:40:12'). Arbitrary error text, which can
// hold lower case names or addresses, never passes.
//
// maskText is only for the user's own words in Report a problem: names (First Last or after a
// title), emails, phone numbers, long numbers, ids, URLs and file paths become placeholders.

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

// ---- Automatic text: allowlisted only -----------------------------------------------------------

/** Error names that may appear in automatic reports. Any other name becomes 'Error'. */
export const ERROR_CODES: ReadonlySet<string> = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError', 'AggregateError', 'InternalError',
  'Warning', 'DOMException', 'QuotaExceededError', 'AbortError', 'NotFoundError', 'InvalidStateError', 'DataError', 'ConstraintError',
  'TransactionInactiveError', 'ReadOnlyError', 'VersionError', 'UnknownError', 'TimeoutError', 'NetworkError', 'SecurityError',
  'NotAllowedError', 'NotSupportedError', 'DataCloneError', 'InvalidAccessError', 'OperationError', 'EncodingError', 'NotReadableError',
  'DatabaseClosedError', 'OpenFailedError', 'MissingAPIError', 'BulkError', 'ModifyError', 'PrematureCommitError', 'SubTransactionError',
  'UpgradeError', 'SchemaError', 'InvalidTableError', 'ChunkLoadError',
]);

/** Exact browser messages that carry no personal text and help to tell bugs apart. */
const SAFE_MESSAGES: ReadonlySet<string> = new Set([
  'Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch resource.', 'The operation was aborted.',
  'The user aborted a request.', 'The quota has been exceeded.', 'QuotaExceededError', 'Script error.',
  'Importing a module script failed.', 'Failed to fetch dynamically imported module', 'Database deleted by request of the user',
  'Connection to Indexed Database server lost. Refresh the page to try again', 'Maximum call stack size exceeded.',
]);

export const HIDDEN = 'details hidden';

// Only the scripts the app ships (PLAN 1.7k review): Vite's hashed bundles in assets/
// ('index-Ab12Cd34.js', 'workbox-window.prod.es5-Bd17z0YL.js'), the Workbox runtime
// ('workbox-2fbc6a65.js') and 'sw.js', always with :line:col. Any other file name (which could be
// personal text, 'alice-smith.js') is never a location.
const LOCATION = /^(?:index-[A-Za-z0-9_-]{8}|workbox-window\.prod\.es5-[A-Za-z0-9_-]{8}|workbox-[0-9a-f]{8}|sw)\.js:\d{1,7}:\d{1,7}$/;

/** A script location ('index-Ab12.js:40:12') or null when it is anything else. */
export function scriptLocation(loc: string | null | undefined): string | null {
  const s = (loc ?? '').trim();
  return LOCATION.test(s) ? s : null;
}

const CODES_RE = '[A-Za-z]{1,40}';
const AUTO = new RegExp(`^(${CODES_RE}): (.+?)(?: at (\\S+))?$`);

/** True when the text already is an automatic message this module produced. */
function isAuto(text: string): boolean {
  const m = AUTO.exec(text);
  if (!m || !ERROR_CODES.has(m[1]!)) return false;
  if (m[2] !== HIDDEN && !SAFE_MESSAGES.has(m[2]!)) return false;
  return m[3] === undefined || scriptLocation(m[3]) !== null;
}

/**
 * The automatic form of any error text: an approved code, a fixed message (an exact allowlisted
 * browser message, otherwise 'details hidden') and an optional script location. Idempotent.
 */
export function autoMessage(text: string | null | undefined, location?: string | null): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  const loc = scriptLocation(location);
  if (isAuto(s)) {
    if (!loc || / at \S+$/.test(s)) return s;
    return `${s} at ${loc}`;
  }
  const head = /^(?:Uncaught\s+)?(?:\(in promise\)\s+)?([A-Za-z]{1,40})(?::\s*([\s\S]*))?$/.exec(s);
  const name = head?.[2] !== undefined ? head[1]! : undefined;
  const code = name && ERROR_CODES.has(name) ? name : 'Error';
  const rest = (head?.[2] !== undefined ? head[2] : s).trim();
  const msg = SAFE_MESSAGES.has(rest) ? rest : SAFE_MESSAGES.has(s) ? s : HIDDEN;
  return loc ? `${code}: ${msg} at ${loc}` : `${code}: ${msg}`;
}

/** Only the script locations of a stack, one per line ('index-Ab12.js:40:12'), at most `maxLines`. */
export function stackRefs(stack: string | null | undefined, maxLines = 12): string {
  const out: string[] = [];
  for (const raw of String(stack ?? '').split('\n')) {
    const line = raw.trim();
    // Only stack frames ('fn@url:1:2', '@url:1:2', 'at f (url:1:2)', 'at url:1:2'), never an error
    // header line ('Error: alice-smith.js:1:2' is the message, not a location).
    // A line that is exactly a location is an already cleaned stack.
    if (scriptLocation(line)) {
      out.push(line);
      if (out.length >= maxLines) break;
      continue;
    }
    if (!/^at\s/.test(line) && !/^[^\s:]*@/.test(line)) continue;
    // The script file at the end of the line ('fn@…/index-Ab12.js:40:12', 'at f (index-Ab12.js:1:2)').
    const tail = /([^\s/@()]+)\)?\s*$/.exec(line.trim())?.[1]?.replace(/[?#][^:]*/, '');
    const ref = scriptLocation(tail);
    if (ref) out.push(ref);
    if (out.length >= maxLines) break;
  }
  return out.join('\n');
}

/** The same bug gives the same signature: automatic message plus the first script location. */
export function autoSignature(message: string, stack: string): string {
  const first = stackRefs(stack, 1) || 'no-stack';
  return `${autoMessage(message)} @ ${first}`.slice(0, 300);
}

/**
 * The real screens of the app (src/App.tsx), with ids replaced: '/workout/3f2…/done?x' →
 * '/workout/:id/done'. Anything else is '/unknown'.
 */
export function maskRoute(hashOrPath: string): string {
  const path = (hashOrPath.startsWith('#') ? hashOrPath.slice(1) : hashOrPath).split(/[?#]/)[0] || '/';
  const p = path.split('/').filter(Boolean);
  const [a, b, c] = p;
  if (p.length === 0) return '/';
  if (p.length === 1 && (a === 'run' || a === 'history' || a === 'plans' || a === 'settings')) return `/${a}`;
  if (p.length === 2 && (a === 'history' || a === 'plans')) return `/${a}/:id`;
  if (p.length === 2 && a === 'settings' && b === 'import') return '/settings/import';
  if (p.length === 2 && a === 'dev' && (b === 'plates' || b === 'loads' || b === 'info' || b === 'viewport')) return `/dev/${b}`;
  if (a === 'workout' && p.length === 2) return '/workout/:id';
  if (a === 'workout' && p.length === 3) return c === 'done' ? '/workout/:id/done' : '/workout/:id/:exercise';
  return '/unknown';
}

/** The stack frames that point into our own scripts, as 'index-Ab12.js:40:12'. Others are dropped. */
export function maskStack(stack: string, ownScript: (url: string) => boolean, maxLines = 12, max = 2000): string {
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const m = /([a-z][a-z-]*:\/\/[^\s)]+?)(?::(\d+))?(?::(\d+))?\)?\s*$/i.exec(line.trim());
    if (!m || !ownScript(m[1]!)) continue;
    const ref = scriptLocation(scriptRef(m[1]!, [m[2], m[3]].filter(Boolean).map((n) => `:${n}`).join('')));
    if (!ref) continue;
    frames.push(ref);
    if (frames.length >= maxLines) break;
  }
  return frames.join('\n').slice(0, max);
}

export type PushKind = 'feedback' | 'crash' | 'fixed';

/**
 * The one formatter for every phone push (SPEC 24): fixed copy, the report number and the screen.
 * A bug report adds the first line of the user's own words, masked; a crash only its automatic
 * code and script location.
 */
export function formatPush(kind: PushKind, r: { id?: number; message?: string | null; route?: string | null }): { title: string; body: string } {
  const ref = `Report #${r.id ?? '?'} · Screen: ${maskRoute(r.route ?? '/')}`;
  if (kind === 'fixed') return { title: 'AnyGym: bug fixed', body: `${ref}\nClose and reopen the app to get it.` };
  if (kind === 'crash') return { title: 'AnyGym: new crash', body: `${autoMessage(r.message)}\n${ref}` };
  const first = (r.message ?? '').split('\n').find((l) => l.trim()) ?? '';
  const line = maskText(first, 80) || 'No text';
  return { title: 'AnyGym: new bug report', body: `${line}\n${ref}` };
}
