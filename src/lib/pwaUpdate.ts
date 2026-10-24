// App updates must never interrupt a workout or a run (PLAN checkpoint rule). Apply a new version
// right away only when neither is active; otherwise hold it and show "Update ready" on Today.

export function shouldApplyUpdateNow(activeWorkout: boolean, activeRun: boolean): boolean {
  return !activeWorkout && !activeRun;
}

type Listener = (ready: boolean) => void;

let apply: (() => void) | null = null;
const listeners = new Set<Listener>();

/** Called by the service worker registration when an update is waiting and was deferred. */
export function setUpdateReady(applyUpdate: (() => void) | null): void {
  apply = applyUpdate;
  listeners.forEach((l) => l(apply !== null));
}

export function isUpdateReady(): boolean {
  return apply !== null;
}

export function applyUpdate(): void {
  apply?.();
}

export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
