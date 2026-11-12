// Weight math (SPEC 5.4). The only place in the app that does arithmetic on weights.
// Pure functions: no React, no Dexie. Every function works in the gym's own unit.
//
// "Base weight": barbell math and plate loaded machine math share one model.
//   total = base + 2 × sum(perSide) + collars
// where `base` is the bar (barbell), the Smith bar (0 for "count plates only"), or the
// listed starting resistance of a plate loaded machine (0 for "plates only"), and
// `perSide` is the plates on one sleeve or one horn. `null` base = not known yet: the
// total is unknown and the UI shows "2 × 45 + bar"; a number is never guessed.
//
// Precision: sums run on integers at 1e-9 resolution, so 2.5 + 1.25 is exactly 3.75
// and never 3.7500000001. Nothing here rounds to display precision; only the format
// helpers at the bottom do that.
//
// This folder is the only place that does arithmetic on weights. The old single file is split by job;
// every name it exported is re-exported here, so imports of "lib/load" keep working.

export { fitsSleeve } from '../plates';
export { roundToStep, BODYWEIGHT_STEP, convertBodyweight, formatBodyweight, CM_PER_IN, ftInToCm, cmToFtIn } from './body';
export { MAX_ESTIMATE_REPS, estimatedMax, weightForReps, COACH_MIN_ADD, scaledWeight, levelUpWeight, emptyBarWeight, warmUpLadder, loadableUpTo, TEST_SET_CAP, testSetNumber } from './coach';
export type { LevelUpRule, WarmUp } from './coach';
export { pickedWeight, sameLoad, SAME_RESISTANCE_TOLERANCE, sameResistance, cellWeight, comparableWeight, platesOnly } from './compare';
export { dumbbellRangeProblems, parseDumbbellRange } from './dumbbellInput';
export type { DumbbellRangeProblems } from './dumbbellInput';
export { dumbbellTotal, MAX_DUMBBELLS, MIN_DUMBBELL_STEP, MAX_DUMBBELL_STEP, validDumbbellRange, dumbbellsInRange, nearestDumbbell, nextDumbbell, heaviestDumbbell, dumbbellCapIn } from './dumbbells';
export { add } from './exact';
export { formatInOther, formatAmount, formatWeight, formatMathLine, formatTotal, formatTotalCompact } from './format';
export { heaviestHeld, heldChoices, MAX_EXACT_HELD, exactHeldProblem, heldAvailable, exactHeldLoad } from './held';
export { smallestIncrement, roundToLoadable } from './increments';
export type { LoadableOptions } from './increments';
export { loadAt, copyLoad } from './loadAt';
export type { CopyRefusal } from './loadAt';
export { barbellLoad, dumbbellLoad, singleLoad, heldWeightOf, stackLoad, plateMachineLoad, collarsOf, otherOf, collarsSettingOf, bodyweightLoad, timedLoad } from './loads';
export { setLifted, totalLifted, setScore, heavierThan, beatsVolume, heavierBy, gainRatio, biggerGain, weightChange } from './records';
export { sleeveOf } from './setup';
export type { LoadSetup } from './setup';
export { solvePlates, platesForSide, isKnownPlate } from './solver';
export type { SolveOptions, Loading, SolveResult } from './solver';
export { stackTotal, nearestStack, DISPLAY_STACK_MAX, isStackPin, MAX_STACK_PINS, validStackStep, morePins, stackValues } from './stack';
export { nearestLoadable, stepUp, resetWeight, stepDown } from './steps';
export { collarsWeight, sumLoad, enabledPlates, smithBase, machineBase } from './sum';
export type { SumInput, SumResult } from './sum';
export { KG_PER_LB, lbToKg, kgToLb, convertForGym, otherUnit } from './units';
