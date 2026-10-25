// Writes an imported history (SPEC 9.3, src/lib/import/importPlan.ts) in one transaction.
// Sessions are imported: true, with importSeq in file order and startedAt = importSeq (an order,
// never a date: src/lib/import/importOrder.ts). Each carries the content hash of its file session,
// so importing the same file twice writes nothing new. Loads are stored exactly as built from the
// file, in the file's unit (never converted).
import type { SettingFill, WriteSession } from '../lib/import/importPlan';
import { newId } from './ids';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type ExerciseSetting, type Session, type WorkoutSet } from './types';
import { isPerGym } from './exerciseSettings';

/** What one import wrote, so Undo can take back exactly that. */
export type ImportResult = {
  sessionIds: string[];
  sets: number;
  /** Answers the import filled in: [exerciseId, gymId], which field and the value written. */
  filled: Array<{ key: [string, string]; field: 'loadType' | 'barId'; value: string }>;
};

/** Hashes of every imported session already stored. */
export async function importedHashes(db: AnyGymDB = defaultDb): Promise<Set<string>> {
  const out = new Set<string>();
  await db.sessions.filter((s) => s.imported && !!s.importHash).each((s) => out.add(s.importHash!));
  return out;
}

export async function writeImport(sessions: readonly WriteSession[], gymId: string, fills: readonly SettingFill[] = [], db: AnyGymDB = defaultDb): Promise<ImportResult> {
  return db.transaction('rw', [db.sessions, db.sets, db.exerciseSettings], async () => {
    const imported = await db.sessions.filter((s) => s.imported).toArray();
    const seen = new Set(imported.map((s) => s.importHash).filter(Boolean));
    // A second import goes after the first, still before every real workout.
    let seq = imported.reduce((m, s) => Math.max(m, s.importSeq ?? 0), 0);
    const result: ImportResult = { sessionIds: [], sets: 0, filled: [] };
    for (const w of sessions) {
      if (seen.has(w.hash) || w.sets.length === 0) continue;
      seen.add(w.hash);
      seq += 1;
      const session: Session = { id: newId(), gymId, startedAt: seq, imported: true, importSeq: seq, importHash: w.hash, exerciseIds: [w.exerciseId] };
      if (w.note) session.note = w.note;
      await db.sessions.add(session);
      const rows = w.sets.map((x, order): WorkoutSet => {
        const set: WorkoutSet = { id: newId(), sessionId: session.id, exerciseId: w.exerciseId, order, kind: x.kind, reps: x.reps, uncertain: x.uncertain };
        if (x.load) set.load = { ...x.load };
        if (x.note) set.note = x.note;
        return set;
      });
      await db.sets.bulkAdd(rows);
      result.sessionIds.push(session.id);
      result.sets += rows.length;
    }
    if (result.sessionIds.length === 0) return result;
    // Fill in how an exercise is loaded only where nothing was answered yet: never override.
    for (const f of fills) {
      const all = await db.exerciseSettings.where('exerciseId').equals(f.exerciseId).toArray();
      if (f.loadType && !all.some((s) => s.loadType !== undefined)) {
        const key: [string, string] = [f.exerciseId, isPerGym(f.loadType) ? gymId : ANY_GYM];
        const had = await db.exerciseSettings.get(key);
        await db.exerciseSettings.put({ ...had, exerciseId: f.exerciseId, gymId: key[1], loadType: f.loadType });
        result.filled.push({ key, field: 'loadType', value: f.loadType });
      }
      if (f.barId && !all.some((s) => s.gymId === gymId && s.barId !== undefined)) {
        const key: [string, string] = [f.exerciseId, gymId];
        const had = await db.exerciseSettings.get(key);
        await db.exerciseSettings.put({ ...had, exerciseId: f.exerciseId, gymId, barId: f.barId });
        result.filled.push({ key, field: 'barId', value: f.barId });
      }
    }
    return result;
  });
}

/**
 * Undo: deletes exactly the sessions (and their sets) one import wrote, and the answers it filled
 * in, but only those still holding the value the import wrote: an answer changed since is kept.
 */
export async function undoImport(result: ImportResult, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sets, db.exerciseSettings], async () => {
    for (const id of result.sessionIds) {
      const s = await db.sessions.get(id);
      if (!s?.imported) continue;
      await db.sets.where('sessionId').equals(id).delete();
      await db.sessions.delete(id);
    }
    for (const { key, field, value } of result.filled) {
      const had = await db.exerciseSettings.get(key);
      if (!had || had[field] !== value) continue;
      const rest: ExerciseSetting = { ...had };
      delete rest[field];
      const { exerciseId: _e, gymId: _g, ...left } = rest;
      if (Object.keys(left).length === 0) await db.exerciseSettings.delete(key);
      else await db.exerciseSettings.put(rest);
    }
  });
}
