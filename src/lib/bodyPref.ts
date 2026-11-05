// Which body the muscle map shows (SPEC 4.5, PLAN 2.2a): male (default) or female, stored on this
// phone only. Modeled on src/ui/haptics.ts; every storage access is guarded (private mode).
import type { BodyKind } from './bodyArt';

export const BODY_KEY = 'anygym.muscleBody';
/** Set once the muscle map has asked (PLAN 3.3): it asks one time, never again. */
export const ASK_KEY = 'anygym.muscleBodyAsked';
const listeners = new Set<() => void>();

function read(): BodyKind {
  try {
    return localStorage.getItem(BODY_KEY) === 'female' ? 'female' : 'male';
  } catch {
    return 'male';
  }
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let current: BodyKind = typeof window === 'undefined' ? 'male' : read();
/** Which map holds this visit's question, so a screen of several asks once. */
let askOwner: string | null = null;
let chosenThisVisit = false;

export const bodyPref = {
  get: (): BodyKind => current,
  set(body: BodyKind): void {
    current = body;
    chosenThisVisit = true;
    try {
      // Stored either way: a stored Male is a choice, no key is no choice yet.
      localStorage.setItem(BODY_KEY, body);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    for (const l of listeners) l();
  },
  /** The user has chosen (a stored key; male without one is only the default). */
  picked(): boolean {
    const v = stored(BODY_KEY);
    return chosenThisVisit || v === 'male' || v === 'female';
  },
  /** True for the one map that asks: no choice yet, never asked before. Remembers the ask. */
  claimAsk(id: string): boolean {
    if (askOwner === id) return true;
    if (askOwner !== null || bodyPref.picked() || stored(ASK_KEY)) return false;
    askOwner = id;
    try {
      localStorage.setItem(ASK_KEY, '1');
    } catch {
      // Private mode: asked for this visit.
    }
    return true;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Re-read storage (tests, or another tab). */
  reload(): void {
    current = read();
    for (const l of listeners) l();
  },
};
