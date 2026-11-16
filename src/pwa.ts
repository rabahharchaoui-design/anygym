// Service worker registration (PLAN checkpoint rule): a new version applies at once only when no
// workout or run is active. Otherwise it waits and Today shows "Update ready".
import { registerSW } from 'virtual:pwa-register';
import { db } from './db/schema';
import { getActiveSession } from './db/workouts';
import { reloadWhenIdle, setUpdateReady, shouldApplyUpdateNow, type Activity } from './lib/pwaUpdate';

async function activity(): Promise<Activity> {
  try {
    const [session, run] = await Promise.all([getActiveSession(), db.runs.filter((r) => r.endedAt === undefined).first()]);
    return { workout: !!session, run: !!run };
  } catch {
    // Storage unreadable: be safe and wait for a tap.
    return { workout: true, run: false };
  }
}

export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  // A first visit has no service worker yet: when it takes this page (clientsClaim) that is not a new
  // version, and nothing reloads. Only a takeover of a page that already had one is an update.
  let controlled = !!navigator.serviceWorker.controller;
  const updateSW = registerSW({
    immediate: true,
    // The plugin would reload unconditionally once the new version controls the page: the
    // activity is checked again right there, so a workout started meanwhile is never reloaded.
    onNeedReload() {
      if (!controlled) {
        controlled = true;
        return;
      }
      void reloadWhenIdle(activity, () => window.location.reload());
    },
    onNeedRefresh() {
      void activity().then(({ workout, run }) => {
        const apply = () => void updateSW(true);
        if (shouldApplyUpdateNow(workout, run)) apply();
        else setUpdateReady(apply, activity);
      });
    },
    onRegisteredSW(_url, registration) {
      // Home Screen apps stay open for days: look for a new version whenever the app comes back.
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    },
  });
}
