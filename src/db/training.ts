// One inclusion rule for rotation recovery, Quick and Up next: real, dated, certain working sets.
import { profileFor } from '../data/order';
import { focusFacts } from '../data/focus';
import type { Muscle } from '../lib/order';
import { db as defaultDb, type AnyGymDB } from './schema';

const LOOKBACK = 30 * 24 * 60 * 60 * 1000;
export async function readTraining(now: number, db: AnyGymDB = defaultDb, excludeSession?: string): Promise<Partial<Record<Muscle, number>>> {
  const sessions = (await db.sessions.where('startedAt').between(now - LOOKBACK, now, true, true).toArray()).filter((s) => !s.imported && s.id !== excludeSession);
  const at = new Map(sessions.map((s) => [s.id, s.startedAt]));
  const sets = at.size ? await db.sets.where('sessionId').anyOf([...at.keys()]).toArray() : [];
  const trained: Partial<Record<Muscle, number>> = {};
  for (const row of sets) {
    if (row.kind !== 'work' || row.uncertain || !(row.reps || row.seconds)) continue;
    const p = profileFor(row.exerciseId);
    if (p.role !== 'lift' || !focusFacts(row.exerciseId, p).muscles.length) continue;
    // The actual logged exercise already reflects swaps. Helpers count for recovery, never volume.
    for (const m of [...p.targets, ...p.helpers.filter((m) => m !== 'forearms')]) trained[m] = Math.max(trained[m] ?? 0, at.get(row.sessionId)!);
  }
  return trained;
}
