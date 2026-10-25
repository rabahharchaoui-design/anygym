// App updates must never interrupt a workout or a run (PLAN checkpoint rule). Apply a new version
// right away only when neither is active; otherwise hold it and show "Update ready" on Today.
// Tapping "Update ready" checks again right before reloading: a workout started since the chip
// appeared keeps the update waiting.

export function shouldApplyUpdateNow(activeWorkout: boolean, activeRun: boolean): boolean {
  return !activeWorkout && !activeRun;
}

export type Activity = { workout: boolean; run: boolean };

type Listener = (ready: boolean) => void;

let apply: (() => void) | null = null;
let check: (() => Promise<Activity>) | null = null;
const listeners = new Set<Listener>();

/**
 * Called by the service worker registration when an update is waiting and was deferred.
 * `checkActivity` is asked again right before the update is applied.
 */
export function setUpdateReady(applyUpdate: (() => void) | null, checkActivity: (() => Promise<Activity>) | null = null): void {
  apply = applyUpdate;
  check = applyUpdate ? checkActivity : null;
  listeners.forEach((l) => l(apply !== null));
}

export function isUpdateReady(): boolean {
  return apply !== null;
}

/**
 * Applies the waiting update if nothing is active now. Resolves true when it was applied, false
 * when nothing waits or a workout or run is active (the update stays ready). An unreadable state
 * counts as active.
 */
export async function applyUpdate(): Promise<boolean> {
  const run = apply;
  if (!run) return false;
  if (check) {
    let now: Activity;
    try {
      now = await check();
    } catch {
      return false;
    }
    if (!shouldApplyUpdateNow(now.workout, now.run)) return false;
  }
  run();
  return true;
}

export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The new version took control and the page would reload now (PLAN 1.7k). Activity is checked
 * again at this very moment, not only before asking for the update: a workout or run started in
 * between keeps the page as it is, and the reload waits behind "Update ready". An unreadable state
 * counts as active. Resolves true when it reloaded.
 */
export async function reloadWhenIdle(checkActivity: () => Promise<Activity>, reload: () => void): Promise<boolean> {
  let now: Activity;
  try {
    now = await checkActivity();
  } catch {
    now = { workout: true, run: false };
  }
  if (shouldApplyUpdateNow(now.workout, now.run)) {
    reload();
    return true;
  }
  setUpdateReady(reload, checkActivity);
  return false;
}
