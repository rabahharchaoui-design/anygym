// One lock per workout (PLAN 2.0j): registering a change (db/mutations.ts) and Finishing the workout
// (db/workouts.ts) never interleave, so Finish cannot read the fallback just before another tab
// writes a failed correction into it. Web Locks coordinates every tab of the origin and needs no
// IndexedDB (the very thing that may be failing); without it, tabs of one page context still queue.
const queues = new Map<string, Promise<unknown>>();

type LockManager = { request: <T>(name: string, cb: () => Promise<T>) => Promise<T> };

export function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const name = `anygym-session:${sessionId}`;
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks?.request) return locks.request(name, fn);
  const prev = queues.get(name) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(name, tail);
  void tail.then(() => queues.get(name) === tail && queues.delete(name));
  return run;
}
