import { useLive } from './useLive';
import { useNow } from './useNow';
import { readSchedule, saveFixedWeekdays, saveWeeklySchedule } from '../db/schedule';
export function useSchedule(enabled: boolean) {
  const now = useNow(30_000);
  const live = useLive(() => enabled ? readSchedule(now) : Promise.resolve(null), [enabled, now]);
  return { ...live, save: (days: Parameters<typeof saveWeeklySchedule>[0]) => saveWeeklySchedule(days), saveFixed: (days: Parameters<typeof saveFixedWeekdays>[0]) => saveFixedWeekdays(days) };
}
