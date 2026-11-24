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

// The Run tab (PLAN 4.2), a run's detail and the records (they bring the map and the share card).
// PLAN R1: through lazyScreen too, so a file that cannot load shows the load error in place of
// that screen, never the app wide "Something went wrong".
const run = lazyScreen(() => import('./run/RunScreen').then((m) => m.RunScreen));
export const RunScreen = run.Screen;
export const RunDetail = lazyScreen(() => import('./history/RunDetail').then((m) => m.RunDetail)).Screen;
export const RunRecords = lazyScreen(() => import('./history/RunRecords').then((m) => m.RunRecords)).Screen;

/** The Run tab's file, fetched right after the app starts so it is there before the tab is tapped. */
export const preloadRun = run.preload;

/** The tab roots' files, fetched after the app has started (a failure is tried again when the tab opens). */
export function preloadTabs(): void {
  void settings.preload();
}
