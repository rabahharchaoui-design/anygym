// The four run types and how the screens say them (SPEC 12.1). Its own tiny file so History's
// list can name a run without the start screen's setup code (goal.ts re-exports it).
export type RunType = 'free' | 'distance' | 'time' | 'intervals';

export const RUN_TYPES: ReadonlyArray<{ value: RunType; label: string }> = [
  { value: 'free', label: 'Free run' },
  { value: 'distance', label: 'Distance' },
  { value: 'time', label: 'Time' },
  { value: 'intervals', label: 'Intervals' },
];

/** The run type as the screens say it. Anything else is just "Run" (never a raw stored word). */
export const runLabel = (type: string): string => RUN_TYPES.find((t) => t.value === type)?.label ?? 'Run';
