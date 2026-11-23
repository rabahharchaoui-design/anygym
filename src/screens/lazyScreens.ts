// PLAN PB1: the screens kept out of the first download (Today, the tab bar and a workout start stay
// in it). Each is one chunk, precached by the service worker like the rest of the app; the tab
// roots are fetched quietly once the first screen has settled (preloadTabs), so a tap rarely waits.
import { lazyScreen } from '../components/LazyScreen';

// The You tab (M14) and the screens only it opens.
const settings = lazyScreen(() => import('./SettingsScreen').then((m) => m.SettingsScreen));
export const SettingsScreen = settings.Screen;
export const ImportReview = lazyScreen(() => import('./settings/ImportReview').then((m) => m.ImportReview)).Screen;
export const GymsScreen = lazyScreen(() => import('./settings/GymsScreen').then((m) => m.GymsScreen)).Screen;
export const GymDetail = lazyScreen(() => import('./settings/GymDetail').then((m) => m.GymDetail)).Screen;
export const GymEquipment = lazyScreen(() => import('./settings/GymEquipment').then((m) => m.GymEquipment)).Screen;
// The owner's move review (#/review), reached from a link only.
export const ReviewScreen = lazyScreen(() => import('./review/ReviewScreen').then((m) => m.ReviewScreen)).Screen;
export const CandidateReviewScreen = lazyScreen(() => import('./review/CandidateReviewScreen').then((m) => m.CandidateReviewScreen)).Screen;

/** The tab roots' files, fetched after the app has started (a failure is tried again when the tab opens). */
export function preloadTabs(): void {
  void settings.preload();
}
