// The set being entered, per workout and exercise (SPEC 13.3: a reload or switching exercises
// never loses it). Holds what the user picked (weight, plates, reps) and a running hold as
// stopwatch timestamps, so the time stays right across a reload. Cleared once the set is logged.
// No weight math here: the card rebuilds the load through load.ts from what is stored.
import type { Load } from '../db/types';
import type { Stopwatch } from './timer';

export type Draft = {
  /** Id the set will be logged with (double tap safe across a reload). */
  id: string;
  load: Load | null;
  /** Plates per side on a bar or machine horn, kept even while the bar weight is unknown. */
  plates?: number[];
  reps?: number;
  watch?: Stopwatch;
};

const KEY = 'anygym-drafts';

type Store = Record<string, Record<string, Draft>>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const storage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validDraft(v: unknown): v is Draft {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  if (typeof d.id !== 'string' || !d.id) return false;
  if (d.load !== null && (typeof d.load !== 'object' || !isNum((d.load as Load).total))) return false;
  if (d.plates !== undefined && !(Array.isArray(d.plates) && d.plates.every(isNum))) return false;
  if (d.reps !== undefined && !isNum(d.reps)) return false;
  if (d.watch !== undefined) {
    const w = d.watch as Record<string, unknown>;
    if (!w || typeof w !== 'object' || !isNum(w.accumulated) || !(w.startedAt === null || isNum(w.startedAt))) return false;
  }
  return true;
}

function read(s: StorageLike): Store {
  try {
    const v = JSON.parse(s.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

function write(s: StorageLike, store: Store): void {
  try {
    if (Object.keys(store).length) s.setItem(KEY, JSON.stringify(store));
    else s.removeItem(KEY);
  } catch {
    /* storage full or blocked: the draft lives only in memory */
  }
}

export function loadDraft(sessionId: string, exerciseId: string, s = storage()): Draft | null {
  if (!s) return null;
  const d = read(s)[sessionId]?.[exerciseId];
  return validDraft(d) ? d : null;
}

export function saveDraft(sessionId: string, exerciseId: string, draft: Draft, s = storage()): void {
  if (!s) return;
  const store = read(s);
  // Only the workout in progress keeps drafts; older ones are dropped on the way.
  write(s, { [sessionId]: { ...(store[sessionId] ?? {}), [exerciseId]: draft } });
}

export function clearDraft(sessionId: string, exerciseId: string, s = storage()): void {
  if (!s) return;
  const store = read(s);
  const own = { ...(store[sessionId] ?? {}) };
  delete own[exerciseId];
  const next = { ...store };
  if (Object.keys(own).length) next[sessionId] = own;
  else delete next[sessionId];
  write(s, next);
}

/** Drops every draft of a workout (Finish). */
export function clearSessionDrafts(sessionId: string, s = storage()): void {
  if (!s) return;
  const next = { ...read(s) };
  delete next[sessionId];
  write(s, next);
}
