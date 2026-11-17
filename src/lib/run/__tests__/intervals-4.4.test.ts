import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { DEFAULT_RUN_SETUP, goalLine, sanitizeRunSetup, type RunSetup } from '../goal';
import {
  BLOCK_NAMES, blockEffort, blockTime, countdown, CUSTOM_BOUNDS, DEFAULT_CUSTOM, planFor, planSeconds, planWords, PRESET_PLANS, readIntervals, sanitizePlan,
  startIntervals, TICK_GAP_MS, tickIntervals, type IntervalPlan, type IntervalState,
} from '../intervals';
import { liveStep, startLive, type LiveAction, type LiveRun } from '../live';
import { parseSnapshot, restoreLive, liveRow, toSnapshot } from '../snapshot';
import { CLIP_IDS } from '../voice/clips';
import type { VoiceEvent } from '../voice/compose';
import { runCues } from '../voice/events';

/** Ticks every 250 ms for `sec` seconds. */
const run = (s: IntervalState, from: number, sec: number, going = true): IntervalState => {
  let out = s;
  for (let t = from; t <= from + sec * 1000; t += 250) out = tickIntervals(out, t, going);
  return out;
};

describe('presets (SPEC 12.7)', () => {
  it('Beginner, Builder, Speed', () => {
    expect(PRESET_PLANS.beginner).toEqual({ blocks: [{ name: 'run', sec: 60 }, { name: 'walk', sec: 120 }], rounds: 8 });
    expect(PRESET_PLANS.builder).toEqual({ blocks: [{ name: 'run', sec: 180 }, { name: 'walk', sec: 60 }], rounds: 6 });
    expect(PRESET_PLANS.speed).toEqual({ blocks: [{ name: 'hard', sec: 60 }, { name: 'easy', sec: 60 }], rounds: 10 });
    expect(planSeconds(PRESET_PLANS.beginner)).toBe(24 * 60);
    expect(planWords(PRESET_PLANS.beginner)).toBe('Run 1 min, walk 2 min, 8 times');
  });
  it('every block name is a recorded word', () => {
    for (const b of BLOCK_NAMES) expect(CLIP_IDS.has(b.id)).toBe(true);
    expect(blockEffort('run')).toBe('push');
    expect(blockEffort('walk')).toBe('ease');
  });
});

describe('custom intervals', () => {
  it('a set inside the bounds is kept; anything else is refused', () => {
    const ok: IntervalPlan = { blocks: [{ name: 'sprint', sec: 30 }, { name: 'rest', sec: 90 }, { name: 'jog', sec: 1800 }], rounds: 20 };
    expect(sanitizePlan(ok)).toEqual(ok);
    expect(sanitizePlan(DEFAULT_CUSTOM)).toEqual(DEFAULT_CUSTOM);
    const bad: unknown[] = [
      null, 'x', { blocks: [], rounds: 3 }, { blocks: [{ name: 'run', sec: 60 }], rounds: 0 }, { blocks: [{ name: 'run', sec: 60 }], rounds: 21 },
      { blocks: [{ name: 'fly', sec: 60 }], rounds: 2 }, { blocks: [{ name: 'run', sec: 45 }], rounds: 2 }, { blocks: [{ name: 'run', sec: 0 }], rounds: 2 },
      { blocks: [{ name: 'run', sec: 1830 }], rounds: 2 }, { blocks: Array(5).fill({ name: 'run', sec: 60 }), rounds: 2 }, { blocks: [null], rounds: 2 }, { blocks: [{ name: 'run', sec: 60 }], rounds: 1.5 },
    ];
    for (const b of bad) expect(sanitizePlan(b), JSON.stringify(b)).toBeNull();
    expect(CUSTOM_BOUNDS.maxBlocks).toBe(4);
  });
  it('the run setup remembers the custom set and says it in words', () => {
    const custom: IntervalPlan = { blocks: [{ name: 'hard', sec: 90 }, { name: 'easy', sec: 30 }], rounds: 1 };
    const setup = sanitizeRunSetup({ type: 'intervals', interval: 'custom', custom });
    expect(setup.interval).toBe('custom');
    expect(setup.custom).toEqual(custom);
    expect(goalLine(setup)).toEqual({ label: 'Custom', detail: 'Hard 1 min 30 s, easy 30 s, once' });
    expect(sanitizeRunSetup({ interval: 'custom', custom: { blocks: [] } }).custom).toEqual(DEFAULT_CUSTOM);
    expect(planFor('custom', custom)).toBe(custom);
    expect(planFor('speed', custom)).toBe(PRESET_PLANS.speed);
    expect([30, 60, 150].map(blockTime)).toEqual(['30 s', '1 min', '2 min 30 s']);
  });
});

describe('the interval clock', () => {
  it('switches at the exact times of the plan', () => {
    let s = startIntervals(PRESET_PLANS.beginner);
    expect(readIntervals(s)).toMatchObject({ done: false, index: 0, round: 1, rounds: 8, leftMs: 60_000, left: 1 });
    s = run(s, T0, 59.75);
    expect(readIntervals(s)).toMatchObject({ index: 0, leftMs: 250 });
    s = tickIntervals(s, T0 + 60_000, true);
    expect(readIntervals(s)).toMatchObject({ index: 1, round: 1, leftMs: 120_000 });
    expect(readIntervals(s).block).toEqual({ name: 'walk', sec: 120 });
    s = run(s, T0 + 60_000, 120);
    expect(readIntervals(s)).toMatchObject({ index: 2, round: 2 });
    expect(readIntervals(s).block!.name).toBe('run');
  });
  it('the last round is marked, and after the last block it is done for good', () => {
    const plan = PRESET_PLANS.speed;
    const last = { plan, activeMs: 18 * 60_000, at: null };
    expect(readIntervals(last)).toMatchObject({ index: 18, round: 10, lastRound: true });
    expect(readIntervals({ ...last, activeMs: 17 * 60_000 }).lastRound).toBe(false);
    const done = readIntervals({ plan, activeMs: 20 * 60_000, at: null });
    expect(done).toMatchObject({ done: true, index: 20, block: null, leftMs: 0 });
    expect(readIntervals({ plan, activeMs: 99 * 60_000, at: null }).done).toBe(true);
    expect(readIntervals({ plan: { blocks: [{ name: 'run', sec: 60 }], rounds: 1 }, activeMs: 0, at: null }).lastRound).toBe(false);
  });
  it('a pause by hand freezes the block; resume goes on from the same second', () => {
    let s = run(startIntervals(PRESET_PLANS.beginner), T0, 30);
    expect(s.activeMs).toBe(30_000);
    s = run(s, T0 + 30_250, 600, false);
    expect(s.activeMs).toBe(30_000);
    expect(s.at).toBeNull();
    s = run(s, T0 + 700_000, 10);
    expect(s.activeMs).toBe(40_000);
  });
  it('time the app was not running (a long silence between two ticks) is not counted', () => {
    let s = run(startIntervals(PRESET_PLANS.beginner), T0, 20);
    s = tickIntervals(s, T0 + 20_000 + TICK_GAP_MS + 1, true);
    expect(s.activeMs).toBe(20_000);
    s = tickIntervals(s, T0 + 20_000 + TICK_GAP_MS + 251, true);
    expect(s.activeMs).toBe(20_250);
    // A slow tick under the limit counts in full; a clock that steps back changes nothing.
    s = tickIntervals(s, s.at! + TICK_GAP_MS, true);
    expect(s.activeMs).toBe(20_250 + TICK_GAP_MS);
    expect(tickIntervals(s, s.at! - 50, true)).toBe(s);
  });
  it('the countdown is lifted to whole seconds', () => {
    expect([120_000, 119_001, 1000, 1, 0, -5].map(countdown)).toEqual(['2:00', '2:00', '0:01', '0:01', '0:00', '0:00']);
  });
});

const setup = (patch: Partial<RunSetup> = {}): RunSetup => ({ ...DEFAULT_RUN_SETUP, ...patch });
const start = (patch: Partial<RunSetup> = {}, unit: 'km' | 'mi' = 'km') => startLive({ id: 'r1', now: T0, setup: setup(patch), unit, autoPause: true });
/** Every step of a run, with what the voice says at each. */
function play(runAt: LiveRun, actions: LiveAction[]): { run: LiveRun; said: VoiceEvent[] } {
  const said: VoiceEvent[] = [];
  let r = runAt;
  for (const a of actions) {
    const next = liveStep(r, a);
    said.push(...runCues(r, next));
    r = next;
  }
  return { run: r, said };
}
const ticks = (fromSec: number, toSec: number): LiveAction[] => Array.from({ length: (toSec - fromSec) * 4 + 1 }, (_, i) => ({ type: 'tick', now: T0 + fromSec * 1000 + i * 250 }));
const east = (from: number, to: number, speed = 3, x0 = 0): LiveAction[] => Array.from({ length: to - from + 1 }, (_, i) => ({ type: 'fix', point: at(x0 + i * speed, 0, from + i) }));

describe('intervals in the live run', () => {
  it('only an interval run has blocks; a tick changes nothing on any other run', () => {
    const free = start();
    expect(free.intervals).toBeNull();
    expect(liveStep(free, { type: 'tick', now: T0 + 1000 })).toBe(free);
    expect(start({ type: 'intervals', interval: 'builder' }).intervals!.plan).toEqual(PRESET_PLANS.builder);
    const custom: IntervalPlan = { blocks: [{ name: 'jog', sec: 30 }], rounds: 2 };
    expect(start({ type: 'intervals', interval: 'custom', custom }).intervals!.plan).toEqual(custom);
  });
  it('a cue at every switch, "last one" on the last round, and "done" once', () => {
    const custom: IntervalPlan = { blocks: [{ name: 'run', sec: 60 }, { name: 'walk', sec: 30 }], rounds: 2 };
    const { run: r, said } = play(start({ type: 'intervals', interval: 'custom', custom }), ticks(0, 400));
    expect(said).toEqual([
      { type: 'interval', name: 'walk', last: false },
      { type: 'interval', name: 'run', last: true },
      { type: 'interval', name: 'walk', last: false },
      { type: 'intervals-done' },
    ]);
    expect(readIntervals(r.intervals!).done).toBe(true);
  });
  it('pause freezes the block, and says so; no switch is said while paused', () => {
    const iv = start({ type: 'intervals', interval: 'speed' });
    const a = play(iv, [...ticks(0, 50), { type: 'pause' }, ...ticks(51, 300)]);
    expect(a.said).toEqual([{ type: 'paused' }]);
    expect(a.run.intervals!.activeMs).toBe(50_000);
    const b = play(a.run, [{ type: 'resume' }, ...ticks(301, 312)]);
    expect(b.said).toEqual([{ type: 'resumed' }, { type: 'interval', name: 'easy', last: false }]);
  });
  it('a reload mid run: the clock comes back where it was, no old cue again, the next switch is not missed', () => {
    const iv = play(start({ type: 'intervals', interval: 'beginner' }), [...east(0, 10), ...ticks(0, 100)]);
    expect(iv.said.filter((e) => e.type === 'interval')).toEqual([{ type: 'interval', name: 'walk', last: false }]);
    const snap = parseSnapshot(JSON.stringify(toSnapshot(iv.run)), 'r1');
    expect(snap!.intervals).toEqual({ plan: PRESET_PLANS.beginner, activeMs: 100_000, at: null });
    const back = restoreLive(liveRow(iv.run), snap, { unit: 'km', autoPause: true });
    expect(back.intervals).toEqual({ plan: PRESET_PLANS.beginner, activeMs: 100_000, at: null });
    // An hour later, still paused: nothing moves, nothing is said.
    const waiting = play(back, ticks(3700, 3710));
    expect(waiting.said).toEqual([]);
    const on = play(waiting.run, [{ type: 'resume' }, ...ticks(3711, 3711 + 81)]);
    expect(on.said).toEqual([{ type: 'resumed' }, { type: 'interval', name: 'run', last: false }]);
  });
  it('without a snapshot a preset starts again and a custom set runs on free; nonsense is dropped', () => {
    const iv = start({ type: 'intervals', interval: 'speed' });
    expect(restoreLive(liveRow(iv), null, { unit: 'km', autoPause: true }).intervals).toEqual(startIntervals(PRESET_PLANS.speed));
    const custom = start({ type: 'intervals', interval: 'custom', custom: DEFAULT_CUSTOM });
    expect(liveRow(custom).intervalPreset).toBe('custom');
    expect(restoreLive(liveRow(custom), null, { unit: 'km', autoPause: true }).intervals).toBeNull();
    const broken = JSON.stringify({ ...toSnapshot(iv), intervals: { plan: { blocks: [], rounds: 1 }, activeMs: 5 } });
    expect(parseSnapshot(broken, 'r1')!.intervals).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...toSnapshot(iv), intervals: { plan: PRESET_PLANS.speed, activeMs: -1 } }), 'r1')!.intervals).toBeNull();
  });
});

describe('what the voice says during a run', () => {
  it('each km: the count, the moving time at the line, that km\'s pace', () => {
    // 3 m/s: a km every 333.3 s.
    const { said } = play(start(), east(0, 700));
    const splits = said.filter((e) => e.type === 'split');
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ type: 'split', count: 1, unit: 'km' });
    const first = splits[0] as Extract<VoiceEvent, { type: 'split' }>;
    expect(first.movingSec).toBeCloseTo(333.3, 0);
    expect(first.paceSec).toBeCloseTo(333.3, 0);
    const second = splits[1] as Extract<VoiceEvent, { type: 'split' }>;
    expect(second.count).toBe(2);
    expect(second.movingSec).toBeCloseTo(666.7, 0);
    expect(second.paceSec).toBeCloseTo(333.3, 0);
  });
  it('halfway and the goal, once each, with the time so far on a Distance run', () => {
    const { said } = play(start({ type: 'distance', distance: { value: 1, unit: 'km' } }), east(0, 400));
    const goal = said.filter((e) => e.type === 'halfway' || e.type === 'goal');
    expect(goal.map((e) => e.type)).toEqual(['halfway', 'goal']);
    expect(goal[0]).toMatchObject({ say: { kind: 'time' } });
    expect((goal[0] as { say: { movingSec: number } }).say.movingSec).toBeCloseTo(167, 0);
  });
  it('a Time run says the distance so far', () => {
    const { said } = play(start({ type: 'time', timeMin: 5 }), east(0, 320));
    const goal = said.filter((e) => e.type === 'halfway' || e.type === 'goal');
    expect(goal.map((e) => e.type)).toEqual(['halfway', 'goal']);
    expect(goal[1]).toMatchObject({ say: { kind: 'distance', unit: 'km' } });
    expect((goal[1] as { say: { meters: number } }).say.meters).toBeCloseTo(900, -1);
  });
  it('pause and resume by hand, standing still and moving again', () => {
    const moving = play(start(), east(0, 30)).run;
    expect(play(moving, [{ type: 'pause' }, { type: 'pause' }, { type: 'resume' }]).said).toEqual([{ type: 'paused' }, { type: 'resumed' }]);
    const stand: LiveAction[] = Array.from({ length: 20 }, (_, i) => ({ type: 'fix', point: at(90, 0, 31 + i) }));
    const stood = play(moving, stand);
    expect(stood.said).toEqual([{ type: 'auto-paused' }]);
    expect(play(stood.run, east(51, 56, 3, 93)).said).toEqual([{ type: 'resumed' }]);
  });
  it('a step that changes nothing says nothing', () => {
    const r = start();
    expect(runCues(r, r)).toEqual([]);
    expect(runCues(r, liveStep(r, { type: 'gps', trouble: 'denied' }))).toEqual([]);
  });
});
