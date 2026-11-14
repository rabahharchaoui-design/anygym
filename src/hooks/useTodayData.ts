import { useEffect, useState } from 'react';
import { useLive } from './useLive';
import { db } from '../db/schema';
import { startDb } from '../db/bootstrap';
import { getActiveSession } from '../db/workouts';
import { getPlanState } from '../db/planState';
import { workSetCount } from '../lib/workSets';
import { onlyOnPhone } from '../lib/backup';

export function useTodayData() {
  // Open the database first, outside the live query: awaiting a non Dexie promise inside it would
  // stop it from tracking, and Today would never see a later Change day or finish.
  const [dbOpen, setDbOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setDbOpen(true);
    startDb().then(done, done);
    return () => {
      alive = false;
    };
  }, []);
  const live = useLive(async () => {
    if (!dbOpen) return null;
    const active = await getActiveSession();
    const planState = await getPlanState();
    const activeRows = active ? await db.sets.where('sessionId').equals(active.id).toArray() : [];
    const activeSets = workSetCount(activeRows);
    // The backup reminder (SPEC 9.1): finished workouts and when the last backup was.
    const profile = await db.profile.toCollection().first();
    const done = await db.sessions.filter((s) => s.endedAt !== undefined || s.imported).toArray();
    const last = profile?.lastBackupAt;
    // Only on this phone: finished workouts the last successful backup did not hold, by id (never
    // guessed from dates or from being imported).
    const onlyHere = onlyOnPhone(done.map((s) => s.id), profile?.backedUpSessionIds);
    return { active: active ?? null, planState: planState ?? null, activeSets, activeEmpty: !!active && activeRows.length === 0, finished: done.length, onlyHere, lastBackupAt: last, snoozeUntil: profile?.backupSnoozeUntil };
  }, [dbOpen]);
  return { dbOpen, live };
}
