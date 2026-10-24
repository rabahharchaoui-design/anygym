// Stopwatch for timed sets (SPEC 5.2). Pure: time comes in as `now` (Date.now()), so the
// reading stays right when the tab is backgrounded and intervals are throttled.

export type Stopwatch = {
  /** Date.now() when the current run started, or null when stopped. */
  startedAt: number | null;
  /** Milliseconds from earlier runs (stop then start again resumes). */
  accumulated: number;
};

export const STOPPED: Stopwatch = { startedAt: null, accumulated: 0 };

export function elapsedMs(w: Stopwatch, now: number): number {
  return w.accumulated + (w.startedAt === null ? 0 : Math.max(0, now - w.startedAt));
}

export function startWatch(w: Stopwatch, now: number): Stopwatch {
  return w.startedAt === null ? { startedAt: now, accumulated: w.accumulated } : w;
}

export function stopWatch(w: Stopwatch, now: number): Stopwatch {
  return w.startedAt === null ? w : { startedAt: null, accumulated: elapsedMs(w, now) };
}

/** Whole seconds shown and stored (a second counts once it is complete). */
export function wholeSeconds(ms: number): number {
  return Math.floor(Math.max(0, ms) / 1000);
}

/** "m:ss" style clock with two digit minutes: 0 → "00:00", 75 → "01:15", 3725 → "62:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Fraction of the target ring filled, 0 to 1. 0 when there is no target. */
export function ringProgress(ms: number, targetSeconds: number | undefined): number {
  if (!targetSeconds || targetSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, ms / (targetSeconds * 1000)));
}

/** Workout clock: "4:05", "59:59", then "1:00:00". */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
