// The coach's writes and small reads (PLAN 3.8, SPEC 15, schema v10). One transaction per change;
// the plan JSON and the logged sets are never written here.
import type { ChangeRecord, CoachTarget, Effort, PlannedChange } from '../lib/coach/types';
import { targetOf } from '../lib/coach/target';
import { clampScale, factorOf, type Outcome } from '../lib/coach/outcome';
import { getProfile } from './intake';
import { newId } from './ids';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { CoachCardRow, CoachLiftRow, EffortRow } from './coachTypes';
import type { Profile } from './types';

// ---------------------------------------------------------------- effort (Easy / Good / Hard)

/** The tap after the last set of an exercise in this workout (null clears it). */
export async function saveEffort(sessionId: string, exerciseId: string, effort: Effort | null, db: AnyGymDB = defaultDb, now = Date.now()): Promise<void> {
  if (effort === null) await db.efforts.delete([sessionId, exerciseId]);
  else await db.efforts.put({ sessionId, exerciseId, effort, at: now });
}

/** This workout's tap for the exercise, and the default: the last tap on it in any workout. */
export async function effortOf(sessionId: string, exerciseId: string, db: AnyGymDB = defaultDb): Promise<{ effort: Effort | null; last: Effort | null }> {
  const own = await db.efforts.get([sessionId, exerciseId]);
  const all = await db.efforts.where('exerciseId').equals(exerciseId).toArray();
  const others = all.filter((e) => e.sessionId !== sessionId).sort((a, b) => b.at - a.at);
  return { effort: own?.effort ?? null, last: others[0]?.effort ?? null };
}

// ---------------------------------------------------------------- cards

export async function closeCard(id: string, state: CoachCardRow['state'], db: AnyGymDB = defaultDb, now = Date.now()): Promise<void> {
  await db.coachCards.put({ id, state, at: now });
}

export async function reopenCard(id: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.coachCards.delete(id);
}

// ---------------------------------------------------------------- changes (targets per lift)

export type Applied = { cardId: string; records: ChangeRecord[] };

/**
 * Applies a card's changes in one transaction: each lift gets its target (it wins over SPEC 6's
 * Next until used, lib/coach/target.ts), each change is recorded old → new with the target it
 * replaced, and the card is marked used. `learned` (per lift key) is kept on the lift's row.
 */
export async function applyChanges(
  cardId: string,
  weekKey: string,
  list: readonly PlannedChange[],
  db: AnyGymDB = defaultDb,
  now = Date.now(),
  learned: Readonly<Record<string, CoachLiftRow['learned']>> = {},
): Promise<Applied> {
  return db.transaction('rw', db.coachLifts, db.coachChanges, db.coachCards, async () => {
    const records: ChangeRecord[] = [];
    for (const c of list) {
      const row = await db.coachLifts.get(c.key);
      const record: ChangeRecord = { ...c, id: newId(), cardId, weekKey, appliedAt: now, prevTarget: row?.target ?? null };
      const next: CoachLiftRow = { key: c.key, exerciseId: c.exerciseId, target: targetOf(c, now), updatedAt: now };
      const knew = learned[c.key] ?? row?.learned;
      // The scale is what resolved outcomes taught the lift (resolveOutcomes): kept, never a snapshot.
      if (knew) next.learned = { ...knew, scale: row?.learned?.scale ?? 1 };
      await db.coachLifts.put(next);
      await db.coachChanges.add(record);
      records.push(record);
    }
    await db.coachCards.put({ id: cardId, state: 'used', at: now });
    return { cardId, records };
  });
}

/** Puts back what one change replaced, while its target is still the one in place. Marked undone either way. */
async function undoOne(rec: ChangeRecord, db: AnyGymDB, now: number): Promise<void> {
  const row = await db.coachLifts.get(rec.key);
  if (row?.target && row.target.setAt === rec.appliedAt && row.target.value === rec.to) {
    const next: CoachLiftRow = { ...row, updatedAt: now };
    if (rec.prevTarget) next.target = rec.prevTarget;
    else delete next.target;
    await db.coachLifts.put(next);
  }
}

/** Undo for one lift (the Leveled up list): its old weight comes back; the change stays as undone. */
export async function undoChange(id: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<ChangeRecord | undefined> {
  return db.transaction('rw', db.coachLifts, db.coachChanges, async () => {
    const rec = await db.coachChanges.get(id);
    if (!rec || rec.undoneAt !== undefined) return rec;
    await undoOne(rec, db, now);
    const done = { ...rec, undoneAt: now };
    await db.coachChanges.put(done);
    return done;
  });
}

/** Undo for a whole card (the toast after a tap): every change goes, and the card can show again. */
export async function undoApplied(applied: Applied, db: AnyGymDB = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.coachLifts, db.coachChanges, db.coachCards, async () => {
    for (const rec of [...applied.records].reverse()) {
      await undoOne(rec, db, now);
      await db.coachChanges.delete(rec.id);
    }
    await db.coachCards.delete(applied.cardId);
  });
}

/**
 * Codex 3.8 #3: stores each raise's outcome once (on its change) and folds its factor into the
 * lift's durable learned scale, so it still counts after the workout leaves the read window.
 */
export async function resolveOutcomes(list: ReadonlyArray<{ id: string; key: string; outcome: Outcome }>, db: AnyGymDB = defaultDb, now = Date.now()): Promise<number> {
  if (!list.length) return 0;
  return db.transaction('rw', db.coachLifts, db.coachChanges, async () => {
    let n = 0;
    for (const o of list) {
      const rec = await db.coachChanges.get(o.id);
      if (!rec || rec.outcome !== undefined) continue;
      await db.coachChanges.put({ ...rec, outcome: o.outcome });
      const row: CoachLiftRow = (await db.coachLifts.get(rec.key)) ?? { key: rec.key, exerciseId: rec.exerciseId, updatedAt: now };
      const was = row.learned;
      await db.coachLifts.put({ ...row, learned: { estimate: was?.estimate ?? null, rate: was?.rate ?? null, scale: clampScale((was?.scale ?? 1) * factorOf(o.outcome)), at: now }, updatedAt: now });
      n++;
    }
    return n;
  });
}

/** Every coach row Today needs, in one read. */
export async function coachRows(db: AnyGymDB = defaultDb): Promise<{ lifts: CoachLiftRow[]; changes: ChangeRecord[]; cards: CoachCardRow[] }> {
  return db.transaction('r', db.coachLifts, db.coachChanges, db.coachCards, async () => ({
    lifts: await db.coachLifts.toArray(),
    changes: await db.coachChanges.toArray(),
    cards: await db.coachCards.toArray(),
  }));
}

/** The coach's targets per lift key (the workout's Next). */
export async function coachTargets(db: AnyGymDB = defaultDb): Promise<Map<string, CoachTarget>> {
  const rows = await db.coachLifts.toArray();
  return new Map(rows.filter((r) => r.target).map((r) => [r.key, r.target!]));
}

// ---------------------------------------------------------------- settings (Settings → Coach)

async function patchCoach(patch: NonNullable<Profile['coach']>, db: AnyGymDB, now: number): Promise<Profile> {
  return db.transaction('rw', db.profile, db.gyms, async () => {
    const existing = await getProfile(db);
    const gyms = await db.gyms.orderBy('createdAt').toArray();
    const unit = (gyms.find((g) => g.isActive) ?? gyms[0])?.unit ?? 'lb';
    const next: Profile = { ...(existing ?? { id: 'me', createdAt: now, defaultUnit: unit }) };
    next.coach = { ...next.coach, ...patch };
    await db.profile.put(next);
    return next;
  });
}

/** Settings → Coach → Auto level up (SPEC 15, off by default). */
export function setAutoLevelUp(on: boolean, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Profile> {
  return patchCoach({ autoLevelUp: on, ...(on ? { autoIntroAt: now } : {}) }, db, now);
}

export type { EffortRow };
