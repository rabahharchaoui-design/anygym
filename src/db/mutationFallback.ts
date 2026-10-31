// The localStorage fallback of changes whose journal write failed (db/mutations.ts, PLAN 2.0e). Kept
// apart so Finish (db/workouts.ts) can read what ANOTHER tab left there without importing mutations.
import type { JournalEntry } from './types';

/** localStorage key of the changes whose journal write failed (the durable fallback). */
export const MUTATION_FALLBACK_KEY = 'anygym-pending-changes';
/** Ids of changes held only in memory or the fallback (never a journal id). */
export const MEMORY_PREFIX = 'mem:';

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const phone = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export const isEntry = (v: unknown): v is JournalEntry => {
  const e = v as JournalEntry;
  return !!e && typeof e.id === 'string' && e.id.startsWith(MEMORY_PREFIX) && typeof e.sessionId === 'string' && typeof e.exerciseId === 'string' && !!e.mutation && typeof e.at === 'number';
};

export function readFallback(ls: KV | null): JournalEntry[] {
  try {
    const v = JSON.parse(ls?.getItem(MUTATION_FALLBACK_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function writeFallback(ls: KV | null, list: JournalEntry[]): void {
  if (!ls) throw new Error('No storage');
  if (list.length) ls.setItem(MUTATION_FALLBACK_KEY, JSON.stringify(list));
  else ls.removeItem(MUTATION_FALLBACK_KEY);
}
