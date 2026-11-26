import { useEffect, useMemo, useState } from 'react';
import { readRecoveryLog } from '../db/training';
import type { LoggedWorkout } from '../lib/recovery';
import type { QuickDeps, QuickInput } from '../lib/quick';
import { targetRows, type TargetRow } from '../lib/quickTargets';

// PLAN Q3a0: what the Quick target rows (Q3a1) read: the eight targets in menu order, each with its
// Recommended tag or "Trained yesterday" fact from the log and the workout it starts, or why it cannot.
// The log is read once when the screen opens, so the menu never reshuffles while the person chooses;
// the workouts are built again for each time chip. Not read by any screen yet.

export type QuickTargets = { rows: TargetRow[] | null; failed: boolean };

/** Read the log once (`now` fixed at the first read). */
export function useRecoveryLog(): { log: { workouts: LoggedWorkout[]; now: number } | null; failed: boolean } {
  const [log, setLog] = useState<{ workouts: LoggedWorkout[]; now: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const now = Date.now();
    readRecoveryLog(now)
      .then((workouts) => alive && setLog({ workouts, now }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { log, failed };
}

/** The target rows for this gym and time (`input` null while the gym or answers load). */
export function useQuickTargets(input: QuickInput | null, deps: QuickDeps): QuickTargets {
  const { log, failed } = useRecoveryLog();
  const rows = useMemo(() => (log && input ? targetRows(log.workouts, log.now, input, deps) : null), [log, input, deps]);
  return { rows, failed };
}
