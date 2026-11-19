// PLAN 4.4b (10): a km that holds a GPS gap is said with its count only; and (MINOR) two splits in
// one step are both said.
import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../../gps/__tests__/fixtures';
import { DEFAULT_RUN_SETUP } from '../../goal';
import { liveStep, startLive, type LiveRun } from '../../live';
import { composeCue, type VoiceEvent } from '../compose';
import { runCues } from '../events';

const start = () => startLive({ id: 'r1', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
const feed = (r: LiveRun, xs: Array<[number, number]>, said: VoiceEvent[]) =>
  xs.reduce((run, [x, s]) => {
    const next = liveStep(run, { type: 'fix', point: at(x, 0, s) });
    said.push(...runCues(run, next));
    return next;
  }, r);
const east = (from: number, to: number, x0: number): Array<[number, number]> => Array.from({ length: to - from + 1 }, (_, i) => [x0 + i * 3, from + i]);

describe('split cues (PLAN 4.4b 10)', () => {
  it('a km that holds a GPS gap: "One kilometer." and nothing more; the next km is said in full', () => {
    const said: VoiceEvent[] = [];
    // 600 m, a 40 s gap bridged over 120 m, then on past 2 km.
    feed(start(), [...east(0, 200, 0), ...east(240, 700, 720)], said);
    const splits = said.filter((e) => e.type === 'split');
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ count: 1, movingSec: null, paceSec: null });
    expect(composeCue(splits[0]!).map((c) => c.id)).toEqual(['n1', 'kilometer']);
    expect(splits[1]).toMatchObject({ count: 2 });
    expect(splits[1]!.type === 'split' && splits[1]!.movingSec).toBeGreaterThan(0);
  });

  it('two splits finished in one step are both said, in order', () => {
    const said: VoiceEvent[] = [];
    const r = feed(start(), east(0, 300, 0), said);
    said.length = 0;
    // A 200 s gap bridged over 1100 m (5.5 m/s): one step past 1 km and 2 km.
    feed(r, [[2003, 500]], said);
    expect(said.filter((e) => e.type === 'split').map((e) => (e.type === 'split' ? e.count : 0))).toEqual([1, 2]);
  });
});
