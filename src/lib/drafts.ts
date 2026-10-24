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
  /** Edit count: a Log set write clears only the version it submitted, never newer edits (PLAN 1.10d). */
  rev?: number;
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
  if (d.rev !== undefined && !isNum(d.rev)) return false;
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

/**
 * The session level memory copy, one per storage (the phone's localStorage, or none): the source
 * of truth while the app is open, so a storage write that fails (full or blocked) never loses a
 * pending weight, reps or running hold when switching cards. Once a workout has a copy it is
 * complete (filled from storage first), and every storage write is that whole copy, never a merge
 * into what storage held: a draft only memory kept comes back after a reload once storage works
 * again, and a cleared draft stays cleared.
 */
type Memory = { session: string | null; drafts: Map<string, Draft>; failed: boolean };
const memories = new WeakMap<object, Memory>();
const NO_STORAGE = {};

function memoryOf(s: StorageLike | null): Memory {
  const k = s ?? NO_STORAGE;
  let m = memories.get(k);
  if (!m) {
    m = { session: null, drafts: new Map(), failed: false };
    memories.set(k, m);
  }
  return m;
}

/** The complete copy of this workout's drafts; other workouts are dropped (only one is in progress). */
function sessionCopy(m: Memory, sessionId: string, s: StorageLike | null): Map<string, Draft> {
  if (m.session !== sessionId) {
    m.session = sessionId;
    m.drafts = new Map();
    const stored = s ? (read(s)[sessionId] ?? {}) : {};
    for (const [ex, d] of Object.entries(stored)) if (validDraft(d)) m.drafts.set(ex, d);
  }
  return m.drafts;
}

type FailListener = () => void;
const failListeners = new Set<FailListener>();

/** Called once (per storage) when drafts can no longer be saved for a reload. Returns the unsubscribe. */
export function onDraftStorageFail(fn: FailListener): () => void {
  failListeners.add(fn);
  return () => void failListeners.delete(fn);
}

export const DRAFTS_NOT_SAVED = 'Drafts will not survive a reload on this phone';

/** Mirrors the whole memory copy to storage. False when that failed (storage full, blocked or missing). */
function mirror(m: Memory, s: StorageLike | null): boolean {
  let ok = false;
  if (s) {
    try {
      if (m.session && m.drafts.size) s.setItem(KEY, JSON.stringify({ [m.session]: Object.fromEntries(m.drafts) }));
      else s.removeItem(KEY);
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok && !m.failed) {
    m.failed = true;
    for (const fn of [...failListeners]) fn();
  }
  return ok;
}

export function loadDraft(sessionId: string, exerciseId: string, s = storage()): Draft | null {
  const m = memoryOf(s);
  if (m.session === sessionId) return m.drafts.get(exerciseId) ?? null;
  if (!s) return null;
  const d = read(s)[sessionId]?.[exerciseId];
  return validDraft(d) ? d : null;
}

/** Keeps the draft in memory at once, then mirrors it to storage. False when only memory has it. */
export function saveDraft(sessionId: string, exerciseId: string, draft: Draft, s = storage()): boolean {
  const m = memoryOf(s);
  sessionCopy(m, sessionId, s).set(exerciseId, draft);
  return mirror(m, s);
}

export function clearDraft(sessionId: string, exerciseId: string, s = storage()): void {
  const m = memoryOf(s);
  sessionCopy(m, sessionId, s).delete(exerciseId);
  mirror(m, s);
}

/**
 * A Log set write landed with the draft version `rev` (PLAN 1.10d). If the draft was not edited
 * since, it is cleared; if it was (weight, reps or a hold changed during the write), those edits
 * are kept under the next set's id. Returns the kept draft, or null when cleared.
 */
export function settleDraft(sessionId: string, exerciseId: string, rev: number | undefined, nextId: string, s = storage()): Draft | null {
  const now = loadDraft(sessionId, exerciseId, s);
  if (!now || now.rev === rev) {
    clearDraft(sessionId, exerciseId, s);
    return null;
  }
  const kept = { ...now, id: nextId };
  saveDraft(sessionId, exerciseId, kept, s);
  return kept;
}

/** Drops every draft of a workout (Finish). */
export function clearSessionDrafts(sessionId: string, s = storage()): void {
  const m = memoryOf(s);
  if (m.session === sessionId) {
    m.session = null;
    m.drafts = new Map();
  }
  if (!s) return;
  const next = { ...read(s) };
  delete next[sessionId];
  try {
    if (Object.keys(next).length) s.setItem(KEY, JSON.stringify(next));
    else s.removeItem(KEY);
  } catch {
    /* memory is already clear */
  }
}
