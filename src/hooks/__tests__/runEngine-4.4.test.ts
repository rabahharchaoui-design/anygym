import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, T0 } from '../../lib/gps/__tests__/fixtures';
import { DEFAULT_RUN_SETUP, readIntervals, type IntervalPlan, type RunSetup, type VoiceEvent, type VoiceSettings } from '../../lib/run';

// The run engine and the voice coach (PLAN 4.4): what the engine asks the voice to say, and when.
// The voice itself is replaced by a list.

let said: Array<{ event: VoiceEvent; settings: VoiceSettings }>;
let watches: Map<number, (p: GeolocationPosition) => void>;

function stubPhone() {
  watches = new Map();
  let nextId = 1;
  const doc = new EventTarget();
  const win = new EventTarget();
  vi.stubGlobal('navigator', { geolocation: { watchPosition: (ok: (p: GeolocationPosition) => void) => (watches.set(nextId, ok), nextId++), clearWatch: (id: number) => void watches.delete(id) } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: doc.addEventListener.bind(doc), removeEventListener: doc.removeEventListener.bind(doc) });
  vi.stubGlobal('window', { setInterval: globalThis.setInterval.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis), addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win) });
}
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise<void>((r) => setImmediate(r));
};
async function freshApp() {
  vi.resetModules();
  stubPhone();
  vi.doMock('../voicePlayer', () => ({ say: (event: VoiceEvent, settings: VoiceSettings) => void said.push({ event, settings }), unlockVoice: () => undefined }));
  return (await import('../runEngine')).runEngine;
}
/** East at 3 m/s, one position a second. */
function run(from: number, to: number) {
  for (let s = from; s <= to; s++) {
    vi.setSystemTime(T0 + s * 1000);
    for (const ok of [...watches.values()]) ok({ coords: { latitude: at(s * 3, 0, s).lat, longitude: at(s * 3, 0, s).lng, accuracy: 5 }, timestamp: T0 + s * 1000 } as GeolocationPosition);
  }
}
const types = () => said.map((s) => s.event.type);
const setup = (patch: Partial<RunSetup>): RunSetup => ({ ...DEFAULT_RUN_SETUP, ...patch });

beforeEach(() => {
  said = [];
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
});
afterEach(async () => {
  const { db } = await import('../../db/schema');
  await db.delete();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock('../voicePlayer');
});

describe('run engine: voice cues', () => {
  it('start, a split per km, pause, resume and the end, each once, with the run\'s voice settings', async () => {
    const engine = await freshApp();
    const voice: VoiceSettings = { on: true, splits: 'second' };
    engine.start(setup({ voice }), 'km');
    expect(said).toEqual([{ event: { type: 'start', first: null }, settings: voice }]);
    run(0, 340);
    expect(types()).toEqual(['start', 'split']);
    expect(said[1]!.event).toMatchObject({ type: 'split', count: 1, unit: 'km' });
    engine.pause();
    engine.pause();
    engine.resume();
    expect(types()).toEqual(['start', 'split', 'paused', 'resumed']);
    // Changed in run settings mid run: the next cue carries the new settings.
    engine.setVoice({ on: false, splits: 'every' });
    run(341, 700);
    expect(said[said.length - 1]).toMatchObject({ event: { type: 'split', count: 2 }, settings: { on: false } });
    await engine.end();
    const last = said[said.length - 1]!.event as Extract<VoiceEvent, { type: 'finished' }>;
    expect(last.type).toBe('finished');
    expect(last.summary).toMatchObject({ unit: 'km' });
    expect(last.summary!.meters).toBeCloseTo(2100, -1);
    expect(last.summary!.paceSec).toBeCloseTo(333, 0);
    // The end is not also said as a pause.
    expect(types().filter((t) => t === 'paused')).toHaveLength(1);
  });
  it('a run with nothing to show ends with no numbers', async () => {
    const engine = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await engine.end();
    expect(said[said.length - 1]!.event).toEqual({ type: 'finished', summary: null });
  });
  it('an interval run: the first block with the start, a cue at each switch on the clock alone, done once', async () => {
    const engine = await freshApp();
    const custom: IntervalPlan = { blocks: [{ name: 'hard', sec: 30 }, { name: 'easy', sec: 30 }], rounds: 2 };
    engine.start(setup({ type: 'intervals', interval: 'custom', custom }), 'km');
    expect(said[0]!.event).toEqual({ type: 'start', first: 'hard' });
    vi.advanceTimersByTime(29_000);
    expect(said).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(said[1]!.event).toEqual({ type: 'interval', name: 'easy', last: false });
    vi.advanceTimersByTime(200_000);
    expect(said.slice(2).map((s) => s.event)).toEqual([{ type: 'interval', name: 'hard', last: true }, { type: 'interval', name: 'easy', last: false }, { type: 'intervals-done' }]);
    expect(readIntervals(engine.get().live!.intervals!).done).toBe(true);
  });
  it('a free run never ticks', async () => {
    const engine = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    const live = engine.get().live;
    vi.advanceTimersByTime(4000);
    expect(engine.get().live).toBe(live);
  });
  it('a reload mid run: nothing old is said again, the block is where it was, and the next switch is said', async () => {
    let engine = await freshApp();
    const chosen = setup({ type: 'intervals', interval: 'beginner', voice: { on: true, splits: 'off' } });
    // The start screen saves the setup as it is picked.
    await (await import('../../db/runSetup')).saveRunSetup(chosen);
    engine.start(chosen, 'km');
    for (let i = 0; i < 14; i++) {
      vi.advanceTimersByTime(5000);
      await settle();
    }
    expect(types()).toEqual(['start', 'interval']);
    // The app is closed (its timers die with it) and opened again 10 minutes later.
    vi.clearAllTimers();
    said = [];
    vi.setSystemTime(T0 + 670_000);
    engine = await freshApp();
    await engine.restore();
    await settle();
    expect(said).toEqual([]);
    const back = engine.get().live!;
    expect(back.closed).toBe(true);
    expect(readIntervals(back.intervals!)).toMatchObject({ index: 1, done: false });
    // Saved every 5 s: the block is at most that far behind where it was.
    expect(back.intervals!.activeMs).toBeGreaterThanOrEqual(65_000);
    expect(back.intervals!.activeMs).toBeLessThanOrEqual(70_000);
    vi.advanceTimersByTime(60_000);
    expect(said).toEqual([]);
    engine.resume();
    vi.advanceTimersByTime(116_000);
    expect(said.map((s) => s.event)).toEqual([{ type: 'resumed' }, { type: 'interval', name: 'run', last: false }]);
    // The saved settings came back with the run.
    expect(said[0]!.settings).toEqual({ on: true, splits: 'off' });
  });
});
