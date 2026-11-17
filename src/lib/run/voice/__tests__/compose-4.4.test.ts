import { describe, expect, it } from 'vitest';
import { METERS_PER_MILE } from '../../../gps';
import { BLOCK_NAMES } from '../../intervals';
import { CLIPS, CLIP_IDS, clipFile, numberWords } from '../clips';
import { composeCue, cueText, distanceClips, GAP_MS, MAX_NUMBER, numberClips, paceClips, previewEvent, splitClips, timeClips, type Cue, type VoiceEvent } from '../compose';
import { DEFAULT_VOICE, sanitizeVoice, wanted } from '../settings';
import manifest from '../manifest.json';

const ids = (cue: Cue) => cue.map((c) => c.id);
const shipped = manifest.clips as Record<string, { file: string; ms: number }>;
const allShipped = (cue: Cue) => cue.every((c) => CLIP_IDS.has(c.id) && shipped[c.id] !== undefined);

describe('the clip list and the shipped pack', () => {
  it('every clip of the list is in the manifest, with its file and a believable length, and nothing else is', () => {
    expect(Object.keys(shipped).sort()).toEqual(CLIPS.map((c) => c.id).sort());
    for (const c of CLIPS) {
      expect(shipped[c.id]!.file).toBe(clipFile(c.id));
      expect(shipped[c.id]!.ms).toBeGreaterThan(150);
      expect(shipped[c.id]!.ms).toBeLessThan(4000);
    }
  });
  it('ids are unique and the pack stays small', () => {
    expect(new Set(CLIPS.map((c) => c.id)).size).toBe(CLIPS.length);
    expect(CLIPS.length).toBeLessThanOrEqual(230);
    expect(manifest.bytes).toBeLessThan(1_250_000);
    expect(manifest.voice).toBe('am_michael');
  });
  it('number words', () => {
    expect([0, 7, 13, 20, 42, 59, 90].map(numberWords)).toEqual(['zero', 'seven', 'thirteen', 'twenty', 'forty two', 'fifty nine', 'ninety']);
  });
});

describe('every value the app can say resolves to shipped clips', () => {
  it('whole numbers 0 to 999', () => {
    for (let n = 0; n <= MAX_NUMBER; n++) expect(allShipped(numberClips(n)), String(n)).toBe(true);
    expect(ids(numberClips(12))).toEqual(['n12']);
    expect(ids(numberClips(65))).toEqual(['n60', 'n5']);
    expect(ids(numberClips(70))).toEqual(['n70']);
    expect(ids(numberClips(100))).toEqual(['n1', 'hundred']);
    expect(ids(numberClips(112))).toEqual(['n1', 'hundred', 'n12']);
    expect(ids(numberClips(999))).toEqual(['n9', 'hundred', 'n90', 'n9']);
    expect(ids(numberClips(5000))).toEqual(ids(numberClips(999)));
  });
  it('every time from 0 seconds to 100 hours', () => {
    for (let s = 0; s <= 4 * 3600; s++) expect(allShipped(timeClips(s)), String(s)).toBe(true);
    for (let s = 4 * 3600; s <= 100 * 3600; s += 61) expect(allShipped(timeClips(s)), String(s)).toBe(true);
    expect(ids(timeClips(552))).toEqual(['min9', 'sec12']);
    expect(ids(timeClips(540))).toEqual(['min9']);
    expect(ids(timeClips(45))).toEqual(['sec45']);
    expect(ids(timeClips(0))).toEqual(['sec0']);
    expect(ids(timeClips(3600))).toEqual(['n1', 'hour']);
    expect(ids(timeClips(2 * 3600 + 5 * 60 + 1))).toEqual(['n2', 'hours', 'min5', 'sec1']);
    expect(ids(timeClips(3605))).toEqual(['n1', 'hour', 'sec5']);
    // The last part ends the sentence; the parts before it end on a comma.
    expect(timeClips(552).map((c) => c.gap)).toEqual(['comma', 'stop']);
  });
  it('every pace from 1 second to an hour per unit; none when unknown or slower', () => {
    for (let s = 1; s < 3600; s++) {
      const p = paceClips(s);
      expect(p.length, String(s)).toBeGreaterThan(0);
      expect(allShipped(p), String(s)).toBe(true);
    }
    expect(ids(paceClips(552))).toEqual(['n9', 'n12']);
    expect(ids(paceClips(545))).toEqual(['n9', 'oh5']);
    expect(ids(paceClips(540))).toEqual(['min9']);
    expect(ids(paceClips(42))).toEqual(['sec42']);
    expect(ids(paceClips(551.6))).toEqual(['n9', 'n12']);
    expect(paceClips(null)).toEqual([]);
    expect(paceClips(3600)).toEqual([]);
    expect(paceClips(Number.NaN)).toEqual([]);
    expect(paceClips(0)).toEqual([]);
  });
  it('every split count and every distance to one decimal, miles and km', () => {
    for (const unit of ['mi', 'km'] as const) {
      for (let n = 1; n <= MAX_NUMBER; n++) expect(allShipped(splitClips(n, unit))).toBe(true);
      for (let tenths = 0; tenths <= 3000; tenths++) expect(allShipped(distanceClips((tenths / 10) * (unit === 'mi' ? METERS_PER_MILE : 1000), unit)), `${tenths} ${unit}`).toBe(true);
    }
    expect(ids(splitClips(1, 'mi'))).toEqual(['n1', 'mile']);
    expect(ids(splitClips(2, 'mi'))).toEqual(['n2', 'miles']);
    expect(ids(splitClips(1, 'km'))).toEqual(['n1', 'kilometer']);
    expect(ids(splitClips(42, 'km'))).toEqual(['n42', 'kilometers']);
    expect(ids(distanceClips(5000, 'km'))).toEqual(['n5', 'kilometers']);
    expect(ids(distanceClips(3190, 'km'))).toEqual(['n3', 'point', 'n1', 'kilometers']);
    expect(ids(distanceClips(1000, 'km'))).toEqual(['n1', 'kilometer']);
    expect(ids(distanceClips(900, 'km'))).toEqual(['n0', 'point', 'n9', 'kilometers']);
    expect(ids(distanceClips(2.5 * METERS_PER_MILE, 'mi'))).toEqual(['n2', 'point', 'n5', 'miles']);
  });
  it('every event', () => {
    const events: VoiceEvent[] = [
      { type: 'start', first: null },
      ...BLOCK_NAMES.flatMap((b): VoiceEvent[] => [{ type: 'start', first: b.id }, { type: 'interval', name: b.id, last: false }, { type: 'interval', name: b.id, last: true }]),
      { type: 'intervals-done' },
      { type: 'paused' },
      { type: 'resumed' },
      { type: 'auto-paused' },
      { type: 'halfway', say: { kind: 'time', movingSec: 842 } },
      { type: 'goal', say: { kind: 'distance', meters: 4321, unit: 'km' } },
      { type: 'goal', say: { kind: 'distance', meters: 20, unit: 'mi' } },
      { type: 'finished', summary: null },
      { type: 'finished', summary: { meters: 5020, unit: 'km', movingSec: 1684, paceSec: 335 } },
      { type: 'finished', summary: { meters: 5020, unit: 'mi', movingSec: 1684, paceSec: null } },
      previewEvent('mi'),
      previewEvent('km'),
    ];
    for (const e of events) {
      const cue = composeCue(e);
      expect(cue.length, e.type).toBeGreaterThan(0);
      expect(allShipped(cue), JSON.stringify(e)).toBe(true);
      expect(cue.every((c) => c.gap in GAP_MS)).toBe(true);
    }
  });
});

describe('the sentences', () => {
  it('a mile split, as SPEC 12.4 words it', () => {
    const cue = composeCue({ type: 'split', count: 1, unit: 'mi', movingSec: 552, paceSec: 552 });
    expect(ids(cue)).toEqual(['n1', 'mile', 'min9', 'sec12', 'pace', 'n9', 'n12']);
    expect(cue.map((c) => c.gap)).toEqual(['word', 'stop', 'comma', 'stop', 'word', 'word', 'stop']);
    expect(cueText(cue)).toBe('One mile. Nine minutes, Twelve seconds. Pace Nine Twelve');
  });
  it('a km split with a pace under ten seconds past the minute', () => {
    expect(ids(composeCue({ type: 'split', count: 3, unit: 'km', movingSec: 925, paceSec: 305 }))).toEqual(['n3', 'kilometers', 'min15', 'sec25', 'pace', 'n5', 'oh5']);
  });
  it('a split that holds a GPS gap says no pace', () => {
    expect(ids(composeCue({ type: 'split', count: 2, unit: 'km', movingSec: 600, paceSec: null }))).toEqual(['n2', 'kilometers', 'min10']);
  });
  it('start, intervals, pause, goal, finish', () => {
    expect(ids(composeCue({ type: 'start', first: null }))).toEqual(['run_started']);
    expect(ids(composeCue({ type: 'start', first: 'hard' }))).toEqual(['run_started', 'hard']);
    expect(ids(composeCue({ type: 'interval', name: 'walk', last: false }))).toEqual(['walk']);
    expect(ids(composeCue({ type: 'interval', name: 'run', last: true }))).toEqual(['last_one', 'run']);
    expect(ids(composeCue({ type: 'intervals-done' }))).toEqual(['intervals_done']);
    expect(ids(composeCue({ type: 'paused' }))).toEqual(['paused']);
    expect(ids(composeCue({ type: 'resumed' }))).toEqual(['resumed']);
    expect(ids(composeCue({ type: 'auto-paused' }))).toEqual(['auto_paused']);
    expect(ids(composeCue({ type: 'halfway', say: { kind: 'time', movingSec: 842 } }))).toEqual(['halfway', 'min14', 'sec2']);
    expect(ids(composeCue({ type: 'goal', say: { kind: 'distance', meters: 4321, unit: 'km' } }))).toEqual(['goal_reached', 'n4', 'point', 'n3', 'kilometers']);
    expect(ids(composeCue({ type: 'goal', say: { kind: 'distance', meters: 20, unit: 'km' } }))).toEqual(['goal_reached']);
    expect(ids(composeCue({ type: 'finished', summary: null }))).toEqual(['run_finished']);
    expect(ids(composeCue({ type: 'finished', summary: { meters: 5020, unit: 'km', movingSec: 1684, paceSec: 335 } }))).toEqual(['run_finished', 'n5', 'kilometers', 'min28', 'sec4', 'pace', 'n5', 'n35', 'per_kilometer']);
    expect(ids(composeCue({ type: 'finished', summary: { meters: 1700, unit: 'mi', movingSec: 600, paceSec: null } }))).toEqual(['run_finished', 'n1', 'mile', 'min10']);
  });
});

describe('voice settings', () => {
  const split = (count: number): VoiceEvent => ({ type: 'split', count, unit: 'km', movingSec: 300 * count, paceSec: 300 });
  it('reads back, with the default for anything not understood', () => {
    expect(sanitizeVoice(undefined)).toEqual(DEFAULT_VOICE);
    expect(sanitizeVoice({ on: false, splits: 'second' })).toEqual({ on: false, splits: 'second' });
    expect(sanitizeVoice({ on: 'yes', splits: 'hourly' })).toEqual(DEFAULT_VOICE);
    expect(DEFAULT_VOICE).toEqual({ on: true, splits: 'every' });
  });
  it('off says nothing at all', () => {
    for (const e of [split(1), { type: 'interval', name: 'run', last: false }, { type: 'paused' }] as VoiceEvent[]) expect(wanted(e, { on: false, splits: 'every' })).toBe(false);
  });
  it('every split, every second split, or no splits; the other cues stay', () => {
    expect([1, 2, 3, 4].map((n) => wanted(split(n), { on: true, splits: 'every' }))).toEqual([true, true, true, true]);
    expect([1, 2, 3, 4].map((n) => wanted(split(n), { on: true, splits: 'second' }))).toEqual([false, true, false, true]);
    expect([1, 2].map((n) => wanted(split(n), { on: true, splits: 'off' }))).toEqual([false, false]);
    expect(wanted({ type: 'interval', name: 'walk', last: false }, { on: true, splits: 'off' })).toBe(true);
    expect(wanted({ type: 'goal', say: { kind: 'time', movingSec: 60 } }, { on: true, splits: 'off' })).toBe(true);
  });
});
