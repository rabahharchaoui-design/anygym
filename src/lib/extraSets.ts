// "+ Add set" (PLAN 1.7c): rows added to an exercise beyond the plan's sets, per workout, so a
// reload shows the same table (SPEC 13.3). Only one workout is in progress, so only one is kept.
const KEY = 'anygym-extra-sets';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Stored = { sessionId: string; extra: Record<string, number> };

const storage = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Memory copy: a blocked storage still keeps the rows while the app is open. */
let memory: Stored | null = null;

function read(kv: KV | null): Stored | null {
  if (memory) return memory;
  try {
    const v = JSON.parse(kv?.getItem(KEY) ?? 'null') as Stored | null;
    if (v && typeof v.sessionId === 'string' && v.extra && typeof v.extra === 'object') memory = v;
  } catch {
    /* corrupt: none */
  }
  return memory;
}

export function extraSets(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  const s = read(kv);
  const n = s?.sessionId === sessionId ? s.extra[exerciseId] : undefined;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
}

export function addExtraSet(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  const s = read(kv);
  const extra = s?.sessionId === sessionId ? { ...s.extra } : {};
  extra[exerciseId] = (extra[exerciseId] ?? 0) + 1;
  memory = { sessionId, extra };
  try {
    kv?.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* memory keeps it */
  }
  return extra[exerciseId]!;
}

export function clearExtraSets(kv: KV | null = storage()): void {
  memory = null;
  try {
    kv?.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/** Tests only. */
export function resetExtraSetsMemory(): void {
  memory = null;
}
