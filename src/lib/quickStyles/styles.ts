// STYLES: how a workout is done, each with its slots, prescriptions and the honest test of its name.
import { isCompound, isHeavy } from '../order';
import { ARMS, COMPOUND_FILL, CORE_FILL, grouped, has, LOWER_FILL, lowImpact, mainPair, PULL, PUSH, realLegs, s, timedOr, UPPER_FILL } from './styleHelpers';
import type { StyleDef, StyleId } from './types';

export const STYLES: Record<StyleId, StyleDef> = {
  circuit: {
    id: 'circuit',
    title: 'Full body circuit',
    effort: 3,
    // Round 4 (B4): a big leg lift leads (on its own, at its own rest), then legs, a push and a pull take turns.
    variants: [
      { key: 'a', label: 'squat first', slots: [s('squat'), s('horizontal push'), s('horizontal pull'), s('hinge'), s('vertical push'), s('vertical pull'), s('core'), s('glutes'), s('lateral delt'), s('hamstrings isolation'), s('biceps'), s('triceps')] },
      { key: 'b', label: 'hinge first', slots: [s('hinge'), s('vertical push'), s('vertical pull'), s('squat'), s('horizontal push'), s('horizontal pull'), s('core'), s('calves'), s('lateral delt'), s('triceps'), s('biceps')] },
      { key: 'c', label: 'glutes first', slots: [s('glutes'), s('horizontal push'), s('vertical pull'), s('hamstrings isolation'), s('vertical push'), s('horizontal pull'), s('core'), s('quads isolation'), s('rear delt')] },
    ],
    shape: (m) => (m <= 20 ? 'circuit' : 'tri'),
    reps: { compound: [8, 12], other: [10, 15] },
    sets: (newer) => timedOr(newer, 2, 3),
    maxSets: (newer) => timedOr(newer, 3, 5),
    rest: { group: 60, single: 60, floor: 45, cap: 120 },
    // Round 4 (B4): one heavy lift at most, and only a leg lift (it leads, on its own, at full rest).
    only: (p) => !isHeavy(p) || realLegs(p),
    maxHeavy: 1,
    honest: (ps, items) => ps.some(realLegs) && has(ps, PUSH) && has(ps, PULL) && isCompound(ps[0]!) && grouped(items, (n) => n >= 3),
  },
  pump: {
    id: 'pump',
    title: 'Pairs, back to back',
    effort: 2,
    // Round 4 (M6): pairs built around a main push and pull (or a hip and a pull), one calf move at most.
    variants: [
      { key: 'upper', label: 'chest and back', slots: [s('horizontal push'), s('horizontal pull'), s('vertical push'), s('vertical pull'), s('lateral delt'), s('rear delt'), s('biceps'), s('triceps'), s('chest isolation'), s('biceps', true), s('triceps', true), ...CORE_FILL] },
      { key: 'lower', label: 'legs and back', slots: [s('glutes'), s('vertical pull'), s('hamstrings isolation'), s('horizontal pull'), s('quads isolation'), s('lateral delt'), s('calves'), s('rear delt'), ...CORE_FILL] },
      { key: 'shoulders', label: 'shoulders and legs', slots: [s('vertical push'), s('hamstrings isolation'), s('lateral delt'), s('quads isolation'), s('rear delt'), s('calves'), s('glutes'), ...CORE_FILL] },
    ],
    shape: () => 'pairs',
    noFallback: true,
    reps: { compound: [8, 12], other: [10, 15] },
    maxSets: (newer) => timedOr(newer, 3, 5),
    rest: { group: 60, single: 60, floor: 45, cap: 90 },
    only: (p) => !isHeavy(p),
    honest: (ps, items) => mainPair(ps, items) && ps.filter((p) => p.pattern === 'calves').length <= 1,
  },
  strength: {
    id: 'strength',
    title: 'Strength focus',
    chip: 'Strength',
    effort: 3,
    // Round 4 (B5): a 4th and a 5th lift (an upper press and a pull) come before any extra set.
    // A second press or row of another kind fills a gym with few big lifts (a hotel: dumbbell and cable).
    variants: [
      { key: 'legs', label: 'legs first', slots: [s('squat'), s('hinge'), s('horizontal push'), s('horizontal pull'), s('glutes'), s('vertical push'), s('vertical pull'), ...COMPOUND_FILL] },
      { key: 'upper', label: 'upper first', slots: [s('horizontal push'), s('horizontal pull'), s('vertical push'), s('vertical pull'), s('squat'), s('hinge'), ...COMPOUND_FILL] },
      { key: 'posterior', label: 'hips first', slots: [s('hinge'), s('glutes'), s('vertical push'), s('vertical pull'), s('hinge', true), s('horizontal push'), ...COMPOUND_FILL] },
    ],
    minMinutes: 30,
    shape: () => 'straight',
    goals: ['strength'],
    noFallback: true,
    // Fewer moves, heavier, longer rest: never more than this, whatever the minutes.
    maxMoves: (m) => (m <= 37 ? 3 : m <= 52 ? 4 : 5),
    maxSets: () => 5,
    rest: { group: 150, single: 150, floor: 150, cap: 180 },
    honest: (ps) => ps.length >= 3 && ps.every((p) => isCompound(p)),
  },
  cardioCore: {
    id: 'cardioCore',
    title: 'Cardio and core',
    effort: 2,
    // No cardio move has a demo we are sure of yet: with only abs moves the name would not be true.
    variants: [{ key: 'a', label: 'cardio and abs', slots: [s('core'), s('core', true), s('core', true), s('core', true)] }],
    shape: () => 'circuit',
    noFallback: true,
    maxSets: () => 4,
    rest: { group: 60, single: 45, floor: 30, cap: 90 },
    honest: (ps) => ps.some((p) => p.role === 'cardio') && ps.some((p) => p.pattern === 'core'),
  },
  mobility: {
    id: 'mobility',
    title: 'Mobility reset',
    chip: 'Low impact',
    effort: 1,
    // Stretches only, and none has a demo we are sure of yet: never offered until one has.
    variants: [{ key: 'a', label: 'stretches', slots: [s('core')] }],
    shape: () => 'circuit',
    noFallback: true,
    maxSets: () => 3,
    rest: { group: 30, single: 30, floor: 15, cap: 60 },
    honest: (ps) => ps.length >= 3 && ps.every((p) => p.role === 'stretch' || p.role === 'dynamic'),
  },
  armsAbs: {
    id: 'armsAbs',
    title: 'Arms and abs',
    effort: 2,
    // Arms (biceps and triceps) and abs only: true to its name, and clear of a pump's shoulders and chest.
    variants: [
      { key: 'a', label: 'arms and abs', slots: [s('biceps'), s('triceps'), s('core'), s('biceps', true), s('triceps', true), s('core', true), s('biceps', true), s('triceps', true)] },
      { key: 'b', label: 'arms, shoulders and abs', slots: [s('biceps'), s('triceps'), s('core'), s('lateral delt'), s('rear delt'), s('core', true), s('biceps', true), s('triceps', true)] },
    ],
    shape: (m) => (m <= 20 ? 'circuit' : 'pairs'),
    noFallback: true,
    reps: { compound: [8, 12], other: [10, 15] },
    maxSets: (newer) => timedOr(newer, 3, 5),
    rest: { group: 45, single: 45, floor: 30, cap: 90 },
    honest: (ps, items) =>
      ps.every((p) => p.pattern !== null && (ARMS.has(p.pattern) || p.pattern === 'core')) && ps.some((p) => p.pattern === 'core') && ps.some((p) => p.pattern === 'biceps' || p.pattern === 'triceps') && grouped(items, (n) => n >= 2),
  },
  easy: {
    id: 'easy',
    title: 'Easy start',
    chip: 'Low impact',
    effort: 1,
    variants: [
      { key: 'full', label: 'whole body', slots: [s('squat'), s('horizontal pull'), s('horizontal push'), s('vertical pull'), s('hamstrings isolation'), s('lateral delt'), s('core'), s('quads isolation'), s('core', true), ...UPPER_FILL] },
      { key: 'upper', label: 'upper body', slots: [s('horizontal pull'), s('horizontal push'), s('vertical pull'), s('lateral delt'), s('biceps'), s('triceps'), s('core'), s('rear delt'), s('core', true), ...UPPER_FILL] },
      { key: 'legs', label: 'legs', slots: [s('squat'), s('hamstrings isolation'), s('glutes'), s('quads isolation'), s('calves'), s('core'), s('core', true), ...LOWER_FILL] },
    ],
    shape: (m) => (m <= 20 ? 'circuit' : 'straight'),
    reps: { compound: [10, 12], other: [10, 15] },
    sets: () => 2,
    maxSets: () => 3,
    rest: { group: 60, single: 60, floor: 45, cap: 90 },
    only: lowImpact,
    maxHeavy: 1,
    honest: (ps) => ps.length >= 3,
  },
};
