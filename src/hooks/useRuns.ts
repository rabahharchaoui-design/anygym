// Finished runs for the screens (PLAN 4.6): the history rows, a run's detail, the records and the
// heatmap all read through here, so no screen opens the database itself. Live: a new run, a
// restore or a delete shows at once. The distance unit is the profile's (the one Settings shows).
import { listFinishedRuns } from '../db/runs';
import { readRunUnit } from '../db/runUnit';
import type { Run } from '../db/types';
import type { DistanceUnit } from '../lib/intake/answers';
import { useLive, type Live } from './useLive';

/** Every finished run, newest start first, and the unit to show them in. */
export function useFinishedRuns(): Live<{ runs: Run[]; unit: DistanceUnit }> {
  return useLive(async () => {
    const [runs, unit] = await Promise.all([listFinishedRuns(), readRunUnit()]);
    return { runs, unit };
  }, []);
}
