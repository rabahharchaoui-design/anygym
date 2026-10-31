// Which body the muscle map shows (SPEC 4.5, PLAN 2.2a): male (default) or female, stored on this
// phone only. Modeled on src/ui/haptics.ts; every storage access is guarded (private mode).
import type { BodyKind } from './bodyArt';

export const BODY_KEY = 'anygym.muscleBody';
const listeners = new Set<() => void>();

function read(): BodyKind {
  try {
    return localStorage.getItem(BODY_KEY) === 'female' ? 'female' : 'male';
  } catch {
    return 'male';
  }
}

let current: BodyKind = typeof window === 'undefined' ? 'male' : read();

export const bodyPref = {
  get: (): BodyKind => current,
  set(body: BodyKind): void {
    current = body;
    try {
      if (body === 'male') localStorage.removeItem(BODY_KEY);
      else localStorage.setItem(BODY_KEY, body);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    for (const l of listeners) l();
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
