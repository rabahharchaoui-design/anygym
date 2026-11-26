// Earned badges on this phone (PLAN M18a, schema 12): one row per badge id with the date earned and
// the workout that earned it. Never awarded twice: the id is the primary key and the write reads
// and adds in one transaction, so a double Finish, a reload during Finish or a second tab adds
// nothing the second time, and a badge already stored keeps its first date.
import { BADGE_IDS, newBadges, type BadgeId, type EarnedBadge } from '../lib/badges';
import { db as defaultDb, type AnyGymDB } from './schema';

/** Every badge earned, oldest first. */
export async function listBadges(db: AnyGymDB = defaultDb): Promise<EarnedBadge[]> {
  return db.badges.orderBy('earnedAt').toArray();
}

/**
 * Stores the badges of `earned` that are not stored yet, earned at `now` by `sessionId`, and returns
 * only those (in the order given). Already owned ones are left exactly as they are.
 */
export async function awardBadges(earned: readonly BadgeId[], sessionId: string, now: number, db: AnyGymDB = defaultDb): Promise<EarnedBadge[]> {
  if (!earned.length) return [];
  return db.transaction('rw', db.badges, async () => {
    const owned = (await db.badges.bulkGet([...earned])).filter((b): b is EarnedBadge => !!b).map((b) => b.id);
    const rows = newBadges(earned, owned).map((id) => ({ id, earnedAt: now, sessionId }));
    if (rows.length) await db.badges.bulkAdd(rows);
    return rows;
  });
}

/** The badges a given workout earned, in catalog order (what its finish screen shows again after a reload). */
export async function badgesOfSession(sessionId: string, db: AnyGymDB = defaultDb): Promise<EarnedBadge[]> {
  return (await db.badges.filter((b) => b.sessionId === sessionId).toArray()).sort((a, b) => BADGE_IDS.indexOf(a.id) - BADGE_IDS.indexOf(b.id));
}
