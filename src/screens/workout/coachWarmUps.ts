// The coach's warm ups in the set table (PLAN 3.8, SPEC 15): added once per workout to the first
// big lift of the day, as warm up rows of their own above the working rows (Draft.auto). They are
// plain rows from then on: swipe one away to skip it, change its weight, or log it (kind warm up,
// so progress and records never count it). Weights come from load.ts (warmUpLadder, loadAt).
import { loadAt, type LoadSetup, type WarmUp } from '../../lib/load';
import { writeDrafts, type Draft } from '../../lib/drafts';
import { rowKey } from '../../lib/setTable';
import { newId } from '../../db/ids';
import type { Load } from '../../db/types';

export const COACH_WARMUPS_KEY = 'anygym-coach-warmups';
type Stored = { sessionId: string; ids: string[] };
type KV = Pick<Storage, 'getItem' | 'setItem'>;

const storage = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** This tab's copy, so a blocked storage still adds them only once while the app is open. */
let memory: Stored | null = null;

function read(kv: KV | null): Stored | null {
  try {
    const v = JSON.parse(kv?.getItem(COACH_WARMUPS_KEY) ?? 'null') as Stored | null;
    if (v && typeof v.sessionId === 'string' && Array.isArray(v.ids)) return v;
  } catch {
    /* unreadable: fall back to memory */
  }
  return memory;
}

/** The coach already added (or offered) warm ups to this exercise in this workout. */
export function warmUpsSeeded(sessionId: string, exerciseId: string, kv: KV | null = storage()): boolean {
  const s = read(kv);
  return s?.sessionId === sessionId && s.ids.includes(exerciseId);
}

function mark(sessionId: string, exerciseId: string, kv: KV | null): void {
  const s = read(kv);
  const next: Stored = { sessionId, ids: [...(s?.sessionId === sessionId ? s.ids : []), exerciseId] };
  memory = next;
  try {
    kv?.setItem(COACH_WARMUPS_KEY, JSON.stringify(next));
  } catch {
    /* memory keeps it */
  }
}

/** The warm up rows as drafts, first slots first (only weights this gym can load). */
export function warmUpDrafts(exerciseId: string, kind: Load['kind'], ups: readonly WarmUp[], setup: LoadSetup, makeId: () => string = newId): Map<string, Draft> {
  const out = new Map<string, Draft>();
  for (const u of ups) {
    const load = loadAt(kind, u.value, setup);
    if (!load) continue;
    out.set(rowKey(exerciseId, out.size), { id: makeId(), load, plates: load.perSide ?? [], unit: setup.unit, pickKind: kind, type: 'warmup', reps: u.reps, rev: 1, auto: true });
  }
  return out;
}

/**
 * Adds the warm ups once: only before anything of this exercise was logged or drafted in this
 * workout. Returns whether rows were added.
 */
export function seedWarmUps(sessionId: string, exerciseId: string, kind: Load['kind'], ups: readonly WarmUp[], setup: LoadSetup, untouched: boolean, kv: KV | null = storage()): boolean {
  if (!ups.length || !untouched || warmUpsSeeded(sessionId, exerciseId, kv)) return false;
  mark(sessionId, exerciseId, kv);
  const drafts = warmUpDrafts(exerciseId, kind, ups, setup);
  if (!drafts.size) return false;
  writeDrafts(sessionId, drafts);
  return true;
}

/** Tests only. */
export function resetWarmUpsMemory(): void {
  memory = null;
}
