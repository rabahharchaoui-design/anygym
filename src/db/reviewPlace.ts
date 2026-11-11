// Where G is in the fast review (PLAN 3.5i), kept on this phone: grid or one by one, and the tiles
// he marked on the screen he is on. The decisions themselves live in Dexie (candidateReviews); this
// is only the unsaved screen, so a reload (offline too) opens exactly where he left off.
import { START_PLACE, parsePlace, type ReviewPlace } from '../lib/candidates/fastReview';

export const PLACE_KEY = 'anygym.reviewPlace';

export function readReviewPlace(): ReviewPlace {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    return raw ? parsePlace(JSON.parse(raw)) : START_PLACE;
  } catch {
    return START_PLACE;
  }
}

export function writeReviewPlace(place: ReviewPlace): void {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // Private mode: the place lasts for this visit.
  }
}
