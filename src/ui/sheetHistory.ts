// Sheets and the Back button (SPEC 13.4). Every open sheet owns one history entry (same URL, the
// router's state kept, plus the sheet's token), so Android Back or the browser's Back closes the
// top sheet only, and a screen with no sheet still navigates as before.
// - Back lands on the entry below a sheet: every sheet above that entry closes (normally just one).
// - A sheet closed by hand (scrim, grabber, Escape, a button) steps back once to use up its entry,
//   so the route never changes and Back never needs an extra press.
// - While that step is in flight, new sheet entries and app navigation (`whenSettled`) wait for it,
//   so "close the sheet, then go somewhere" never races the step back.
// - A sheet that closes because the app navigated away leaves its entry as it is: the route already
//   moved on, and stepping back would undo it.

export type HistoryLike = {
  readonly state: unknown;
  pushState: (data: unknown, unused: string) => void;
  back: () => void;
};

type WindowLike = {
  addEventListener: (type: 'popstate', fn: () => void) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
};

const KEY = 'anygymSheet';

/** How long to wait for the step back before carrying on anyway. */
const STEP_BACK_TIMEOUT_MS = 400;

type Entry = {
  token: string;
  close: () => void;
  pushed: boolean;
  consumed: boolean;
};

export function createSheetHistory(history: HistoryLike, win: WindowLike) {
  const stack: Entry[] = [];
  let stepping = false;
  let stepId = 0;
  let waiting: Array<() => void> = [];
  let seq = 0;

  const tokenOfState = (): string | undefined => {
    const s = history.state as Record<string, unknown> | null;
    return s && typeof s[KEY] === 'string' ? (s[KEY] as string) : undefined;
  };

  const push = (e: Entry) => {
    if (e.consumed || !stack.includes(e)) return;
    const base = (history.state && typeof history.state === 'object' ? history.state : {}) as Record<string, unknown>;
    history.pushState({ ...base, [KEY]: e.token }, '');
    e.pushed = true;
  };

  const flush = () => {
    stepping = false;
    const run = waiting;
    waiting = [];
    for (const fn of run) fn();
  };

  const stepBack = () => {
    stepping = true;
    const id = ++stepId;
    history.back();
    win.setTimeout(() => {
      if (stepping && stepId === id) flush();
    }, STEP_BACK_TIMEOUT_MS);
  };

  win.addEventListener('popstate', () => {
    if (stepping) {
      // Our own step back after a sheet was closed by hand.
      flush();
      return;
    }
    // Back (or a history jump): close every sheet above the entry we landed on.
    const at = tokenOfState();
    const keep = at === undefined ? -1 : stack.findIndex((e) => e.token === at);
    for (let i = stack.length - 1; i > keep; i--) {
      const e = stack[i]!;
      if (!e.pushed) continue;
      e.consumed = true;
      e.close();
    }
  });

  return {
    /** A sheet opened: gives it an entry. Returns the function to call when it closes (any reason). */
    open(close: () => void): () => void {
      const e: Entry = {
        token: `s${++seq}-${Date.now().toString(36)}`,
        close,
        pushed: false,
        consumed: false,
      };
      stack.push(e);
      if (stepping) waiting.push(() => push(e));
      else push(e);
      return () => {
        const i = stack.indexOf(e);
        if (i >= 0) stack.splice(i, 1);
        if (e.consumed || !e.pushed) {
          e.consumed = true;
          return;
        }
        e.consumed = true;
        // Still on this sheet's own entry: closed by hand, so use the entry up.
        if (tokenOfState() === e.token) stepBack();
      };
    },
    /** Runs `fn` now, or right after a step back in flight (app navigation goes through this). */
    whenSettled(fn: () => void): void {
      if (stepping) waiting.push(fn);
      else fn();
    },
    /** Open sheets that own an entry (tests). */
    depth: (): number => stack.length,
  };
}

let shared: ReturnType<typeof createSheetHistory> | null = null;

/** The app wide instance, made on first use (never on the server or in unit tests that do not ask). */
export function sheetHistory(): ReturnType<typeof createSheetHistory> {
  if (!shared) shared = createSheetHistory(window.history, window);
  return shared;
}
