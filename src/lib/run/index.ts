// Run start screen logic (PLAN 4.2, SPEC 12.1, 12.10). The front door of this folder. Pure.
//   goal.ts       run types, goals, picker values, what is remembered
//   gpsStatus.ts  the GPS chip: status and plain words
//   mapSource.ts  the tile host and the map data credit
//   mapStyle.ts   the dark map style in the app palette (imported by the lazy map only, not from here)
export * from './goal';
export * from './gpsStatus';
export * from './mapSource';
