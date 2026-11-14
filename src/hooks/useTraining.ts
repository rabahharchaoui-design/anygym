import { useLive } from './useLive';
import { readTraining } from '../db/training';
import { trainedWithin, TIRED_MS } from '../lib/quickWhy';
export function useTraining(enabled: boolean, excludeSession: string) {
  return useLive(async () => enabled ? trainedWithin(await readTraining(Date.now(), undefined, excludeSession), Date.now(), TIRED_MS) : [], [enabled, excludeSession]);
}
