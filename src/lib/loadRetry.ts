// PLAN R1 (1): what Try again does after a screen's file could not load. Reloading the page is the
// sure way back (WebKit keeps a failed module for the life of the page), but a reload must never
// happen while a workout or a run is active: then the file is asked for again in place.
import { shouldApplyUpdateNow, type Activity } from './pwaUpdate';

export type RetryWay = 'reload' | 'in-place';

/** Reload only with signal and nothing active; an unreadable activity counts as active. */
export function retryWay(online: boolean, activity: Activity | null): RetryWay {
  if (!online || !activity) return 'in-place';
  return shouldApplyUpdateNow(activity.workout, activity.run) ? 'reload' : 'in-place';
}

/** Asks for the activity at the moment of the tap, then reloads or retries in place. */
export async function retryLoad(
  online: boolean,
  checkActivity: () => Promise<Activity>,
  reload: () => void,
  inPlace: () => void,
): Promise<RetryWay> {
  let activity: Activity | null = null;
  if (online) {
    try {
      activity = await checkActivity();
    } catch {
      activity = null;
    }
  }
  const way = retryWay(online, activity);
  if (way === 'reload') reload();
  else inPlace();
  return way;
}
