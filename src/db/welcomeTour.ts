// The first visit welcome's one flag (PLAN 3.5u), on the profile row so it rides in the backup. It
// is armed only by a first intake's "Looks good"; anyone from before has no flag and never sees it.
import { getProfile } from './intake';
import { db as defaultDb, type AnyGymDB } from './schema';

/** After a first intake: show the welcome once. Never arms twice, and never without a profile. */
export async function armWelcomeTour(db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const p = await getProfile(db);
    if (!p || p.welcomeTour !== undefined) return;
    await db.profile.put({ ...p, welcomeTour: 'pending' });
  });
}

/** Finished or skipped: never shown again (a reload, a later backup restore of this state). */
export async function finishWelcomeTour(db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const p = await getProfile(db);
    if (!p || p.welcomeTour !== 'pending') return;
    await db.profile.put({ ...p, welcomeTour: 'done' });
  });
}
