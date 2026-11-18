// Run start screen logic (PLAN 4.2, SPEC 12.1, 12.10). The front door of this folder. Pure.
//   goal.ts       run types, goals, picker values, what is remembered
//   gpsStatus.ts  the GPS chip: status and plain words
//   mapSource.ts  the tile host and the map data credit
//   format.ts    distance and pace as printed (the one place)
//   intervals.ts  interval presets, a custom set and the interval clock (PLAN 4.4)
//   voice/        the voice coach: the clip list, the sentences, the settings (PLAN 4.4)
//   live.ts      the live run: one state, one step at a time (PLAN 4.3)
//   liveClock.ts the time on the screen between two positions, and when it next changes (PLAN 4.4a)
//   snapshot.ts  a live run written down and read back after the app closed
//   progress.ts  progress toward a Distance or Time goal
//   summary.ts   the finished row and the summary read from it
//   routeGeo.ts  the route as map coordinates: solid pieces, dashed joins
//   hold.ts      press and hold (End, unlock) and what a locked screen allows
//   dim.ts       pocket mode dimming
//   mapStyle.ts   the dark map style in the app palette (imported by the lazy map only, not from here)
export * from './goal';
export * from './intervals';
export * from './voice/clips';
export * from './voice/compose';
export * from './voice/settings';
export * from './voice/events';
export * from './voice/schedule';
export * from './voice/speech';
export * from './gpsStatus';
export * from './mapSource';
export * from './format';
export * from './live';
export * from './liveClock';
export * from './snapshot';
export * from './progress';
export * from './summary';
export * from './hold';
export * from './dim';
export * from './routeGeo';
