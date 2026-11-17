import { describe, expect, it } from 'vitest';
import { METERS_PER_MILE } from '../../gps';
import {
  CUSTOM_DISTANCE, CUSTOM_TIME_MIN, DEFAULT_RUN_SETUP, DISTANCE_PRESETS, INTERVAL_PRESETS, RUN_TYPES, TIME_PRESETS_MIN,
  customDistanceValues, customTimeValues, distanceLabel, goalLine, goalMeters, goalSeconds, isDistanceGoal, isDistancePreset,
  isTimeGoal, isTimePreset, parseRunSetup, sameDistance, sanitizeRunSetup, timeLabel, withUnit,
} from '../goal';

describe('run goal: picker values (SPEC 12.1)', () => {
  it('lists the four run types in SPEC order', () => {
    expect(RUN_TYPES.map((t) => t.label)).toEqual(['Free run', 'Distance', 'Time', 'Intervals']);
  });
  it('has the SPEC presets: 3 mi, 5 km, 10 km and 20, 30, 45 min', () => {
    expect(DISTANCE_PRESETS.map(distanceLabel)).toEqual(['3 mi', '5 km', '10 km']);
    expect(TIME_PRESETS_MIN).toEqual([20, 30, 45]);
  });
  it('custom wheels run in even steps over the whole range, with no float dust', () => {
    const d = customDistanceValues();
    expect(d[0]).toBe(CUSTOM_DISTANCE.min);
    expect(d.at(-1)).toBe(CUSTOM_DISTANCE.max);
    expect(d).toHaveLength(100);
    expect(d.every((v) => Number.isInteger(v * 2))).toBe(true);
    const t = customTimeValues();
    expect(t[0]).toBe(CUSTOM_TIME_MIN.min);
    expect(t.at(-1)).toBe(CUSTOM_TIME_MIN.max);
    expect(t).toHaveLength(36);
  });
  it('every preset is a value the custom wheel also has', () => {
    for (const p of DISTANCE_PRESETS) expect(customDistanceValues()).toContain(p.value);
    for (const m of TIME_PRESETS_MIN) expect(customTimeValues()).toContain(m);
  });
  it('names the SPEC 12.7 interval presets', () => {
    expect(INTERVAL_PRESETS.map((p) => p.id)).toEqual(['beginner', 'builder', 'speed']);
  });
});

describe('run goal: labels and lengths', () => {
  it('writes distances as picked', () => {
    expect(distanceLabel({ value: 2.5, unit: 'mi' })).toBe('2.5 mi');
    expect(distanceLabel({ value: 10, unit: 'km' })).toBe('10 km');
  });
  it('writes times in minutes, then hours', () => {
    expect(timeLabel(45)).toBe('45 min');
    expect(timeLabel(60)).toBe('1 h');
    expect(timeLabel(90)).toBe('1 h 30 min');
    expect(timeLabel(180)).toBe('3 h');
  });
  it('gives meters through the gps unit lengths and seconds for time', () => {
    expect(goalMeters({ value: 5, unit: 'km' })).toBe(5000);
    expect(goalMeters({ value: 3, unit: 'mi' })).toBeCloseTo(3 * METERS_PER_MILE, 9);
    expect(goalSeconds(30)).toBe(1800);
  });
  it('knows presets from custom values', () => {
    expect(isDistancePreset({ value: 5, unit: 'km' })).toBe(true);
    expect(isDistancePreset({ value: 5, unit: 'mi' })).toBe(false);
    expect(isTimePreset(30)).toBe(true);
    expect(isTimePreset(35)).toBe(false);
    expect(sameDistance({ value: 3, unit: 'mi' }, { value: 3, unit: 'km' })).toBe(false);
  });
  it('a unit switch keeps the number on the wheel', () => {
    expect(withUnit({ value: 7.5, unit: 'km' }, 'mi')).toEqual({ value: 7.5, unit: 'mi' });
  });
  it('says what the run is in one line', () => {
    expect(goalLine(DEFAULT_RUN_SETUP)).toEqual({ label: 'No goal', detail: 'Run as far as you like' });
    expect(goalLine({ ...DEFAULT_RUN_SETUP, type: 'distance' })).toEqual({ label: '5 km', detail: null });
    expect(goalLine({ ...DEFAULT_RUN_SETUP, type: 'time', timeMin: 90 })).toEqual({ label: '1 h 30 min', detail: null });
    expect(goalLine({ ...DEFAULT_RUN_SETUP, type: 'intervals', interval: 'speed' })).toEqual({ label: 'Speed', detail: '1 min hard, 1 min easy, 10 times' });
  });
});

describe('run goal: what is remembered', () => {
  it('starts as a free run so Start needs no setup', () => {
    expect(DEFAULT_RUN_SETUP.type).toBe('free');
    expect(sanitizeRunSetup(DEFAULT_RUN_SETUP)).toEqual(DEFAULT_RUN_SETUP);
  });
  it('round trips a saved setup', () => {
    const s = { type: 'distance', distance: { value: 3, unit: 'mi' }, timeMin: 45, interval: 'builder', autoPause: false } as const;
    expect(parseRunSetup(JSON.stringify(s))).toEqual(s);
    // A setup saved before the auto pause switch existed (4.2) reads back with it on (SPEC 12.3).
    expect(parseRunSetup(JSON.stringify({ ...s, autoPause: undefined })).autoPause).toBe(true);
  });
  it('falls back part by part, never as a whole', () => {
    expect(sanitizeRunSetup({ type: 'time', distance: { value: -1, unit: 'km' }, timeMin: 45, interval: 'nope', autoPause: 'yes' })).toEqual({ type: 'time', distance: DEFAULT_RUN_SETUP.distance, timeMin: 45, interval: 'beginner', autoPause: true });
    expect(sanitizeRunSetup({ type: 'swim', timeMin: 33 })).toEqual(DEFAULT_RUN_SETUP);
  });
  it('bad or missing text gives the default', () => {
    for (const t of [null, undefined, '', '{', 'null', '7', '"x"', '[]']) expect(parseRunSetup(t)).toEqual(DEFAULT_RUN_SETUP);
  });
  it('refuses goals off the wheel', () => {
    expect(isDistanceGoal({ value: 5.25, unit: 'km' })).toBe(false);
    expect(isDistanceGoal({ value: 50.5, unit: 'km' })).toBe(false);
    expect(isDistanceGoal({ value: 5, unit: 'yd' })).toBe(false);
    expect(isDistanceGoal(null)).toBe(false);
    expect(isDistanceGoal({ value: Number.NaN, unit: 'km' })).toBe(false);
    expect(isTimeGoal(0)).toBe(false);
    expect(isTimeGoal(185)).toBe(false);
    expect(isTimeGoal(32)).toBe(false);
    expect(isTimeGoal('30')).toBe(false);
    expect(isTimeGoal(180)).toBe(true);
  });
});
