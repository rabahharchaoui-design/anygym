// Quick workout ideas: diverse and full (PLAN 3.5b, G Nov 8, extends 3.5a and SPEC 20.3). Pure: no
// JSON, no Dexie, no React. Three things live here:
//   1. STYLES: how a workout is done, not just what it trains (Full body circuit, Superset pump,
//      Strength focus, Cardio and core, Mobility reset, Arms and abs finisher, Easy start), each with
//      its slots, its prescriptions and the honest test of its name;
//   2. DENSITY: the minutes decide the count (15 min: 3 to 4 moves as a circuit, 30: 5 to 6 with 2
//      supersets, 45: 6 to 7, 60: 7 to 9), and the time is fitted with supersets, rounds, sets and
//      rest through the one estimator (plans.ts estimateDayMinutes over quickDayOf);
//   3. the diversity rule and the rotation: no two cards share more than half their primary muscles
//      (the catalog's primary muscles), a style done in the last 2 quick workouts never comes first,
//      and the same 4 cards never show twice in a row.
// Nothing here pads: fewer sure moves than a style needs is a smaller card or no card.
//
// The old single file is split by job (types, estimate, styleHelpers, styles, buildTypes, layout,
// card, spec, batch); this index re-exports every name it exported, so imports of
// "lib/quickStyles" keep working.

export type { StyleId, GroupedItem, StyleDef } from './types';
export { STYLE_ORDER, diverse, rankStyles, chooseBatch } from './batch';
export type { Pickable, BatchInput, Batch } from './batch';
export { quickDayOf, quickMinutes, structureOf, densityFor, SLACK } from './estimate';
export type { Density } from './estimate';
export { lowImpact, realLegs } from './styleHelpers';
export { STYLES } from './styles';
export type { BuildDeps, BuildSpec, Built } from './buildTypes';
export { hangsBodyweight } from './layout';
export { buildCard } from './card';
export { styleSpec } from './spec';
