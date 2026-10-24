// Service worker registration (PLAN checkpoint rule): a new version applies at once only when no
// workout or run is active. Otherwise it waits and Today shows "Update ready".
import { registerSW } from 'virtual:pwa-register';
import { db } from './db/schema';
import { getActiveSession } from './db/workouts';
import { setUpdateReady, shouldApplyUpdateNow } from './lib/pwaUpdate';

async function activity(): Promise<{ workout: boolean; run: boolean }> {
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
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void activity().then(({ workout, run }) => {
        const apply = () => void updateSW(true);
        if (shouldApplyUpdateNow(workout, run)) apply();
        else setUpdateReady(apply);
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
