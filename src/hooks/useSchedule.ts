import { useLive } from './useLive';
import { useNow } from './useNow';
import { readSchedule, saveWeeklySchedule } from '../db/schedule';
export function useSchedule(enabled: boolean) {
  const now = useNow(30_000);
  const live = useLive(() => enabled ? readSchedule(now) : Promise.resolve(null), [enabled, now]);
  return { ...live, save: (days: Parameters<typeof saveWeeklySchedule>[0]) => saveWeeklySchedule(days) };
}
