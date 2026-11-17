import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIPS, DEFAULT_VOICE, type Cue, type VoiceEvent } from '../../lib/run';

// The cue queue with its two outputs replaced: the recorded clips (voiceAudio) and the phone's own
// voice (voiceSpeech). Each fake takes a while, so an overlap would show.

type Out = { kind: 'clips' | 'speech'; what: string; from: number; to: number };
let log: Out[];
let clipsWork: (cue: Cue) => boolean;
let now: number;

const tickAll = async () => {
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
    vi.advanceTimersByTime(250);
    now += 250;
    vi.setSystemTime(now);
  }
};

async function fresh() {
  vi.resetModules();
  log = [];
  clipsWork = () => true;
  const busy = (kind: Out['kind'], what: string, ms: number) =>
    new Promise<boolean>((done) => {
      const entry: Out = { kind, what, from: Date.now(), to: 0 };
      log.push(entry);
      setTimeout(() => {
        entry.to = Date.now();
        done(true);
      }, ms);
    });
  vi.doMock('../voiceAudio', () => ({
    playClips: (cue: Cue) => (clipsWork(cue) ? busy('clips', cue.map((c) => c.id).join(' '), 1000) : Promise.resolve(false)),
    unlockAudio: () => undefined,
  }));
  vi.doMock('../voiceSpeech', () => ({ speak: (text: string) => busy('speech', text, 1500) }));
  return import('../voicePlayer');
}

beforeEach(() => {
  now = 1_000_000;
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('../voiceAudio');
  vi.doUnmock('../voiceSpeech');
});

const split: VoiceEvent = { type: 'split', count: 1, unit: 'mi', movingSec: 552, paceSec: 552 };

describe('the voice queue', () => {
  it('says cues in the order they came, one after the other, never two at once', async () => {
    const { say } = await fresh();
    say(split, DEFAULT_VOICE);
    say({ type: 'interval', name: 'walk', last: false }, DEFAULT_VOICE);
    say({ type: 'paused' }, DEFAULT_VOICE);
    await tickAll();
    expect(log.map((o) => o.what)).toEqual(['n1 mile min9 sec12 pace n9 n12', 'walk', 'paused']);
    for (let i = 1; i < log.length; i++) expect(log[i]!.from).toBeGreaterThanOrEqual(log[i - 1]!.to);
    expect(log.every((o) => o.kind === 'clips')).toBe(true);
  });
  it('voice off says nothing; splits can be every second one or none', async () => {
    const { say } = await fresh();
    say(split, { on: false, splits: 'every' });
    say({ type: 'paused' }, { on: false, splits: 'every' });
    say(split, { on: true, splits: 'second' });
    say(split, { on: true, splits: 'off' });
    say({ ...split, count: 2 } as VoiceEvent, { on: true, splits: 'second' });
    await tickAll();
    expect(log.map((o) => o.what)).toEqual(['n2 miles min9 sec12 pace n9 n12']);
  });
  it('a cue whose clips cannot be played is said whole by the phone\'s voice, and only then; never both', async () => {
    const { say } = await fresh();
    clipsWork = (cue) => !cue.some((c) => c.id === 'walk');
    say({ type: 'interval', name: 'walk', last: true }, DEFAULT_VOICE);
    say({ type: 'interval', name: 'run', last: false }, DEFAULT_VOICE);
    await tickAll();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ kind: 'speech', what: 'Last one. Walk.' });
    expect(log[1]).toMatchObject({ kind: 'clips', what: 'run' });
    expect(log[1]!.from).toBeGreaterThanOrEqual(log[0]!.to);
  });
  it('a cue that waited too long behind others is dropped', async () => {
    const { say } = await fresh();
    for (let i = 0; i < 30; i++) say({ type: 'paused' }, DEFAULT_VOICE);
    for (let i = 0; i < 6; i++) await tickAll();
    // Each takes a second; what would start more than 20 s late is never said.
    expect(log.length).toBeGreaterThanOrEqual(5);
    expect(log.length).toBeLessThanOrEqual(22);
    for (const o of log) expect(o.from - 1_000_000).toBeLessThanOrEqual(20_000);
  });
});

describe('the voice pack on the phone', () => {
  it('every clip has an address under voice/ with the pack version; an unknown id has none', async () => {
    vi.resetModules();
    const { allClipUrls, clipUrl, VOICE_CACHE } = await vi.importActual<typeof import('../voiceAudio')>('../voiceAudio');
    expect(allClipUrls()).toHaveLength(CLIPS.length);
    expect(clipUrl('n9')).toMatch(/voice\/n9\.m4a\?v=[0-9a-f]{10}$/);
    expect(clipUrl('nope')).toBeNull();
    // The service worker keeps the clips in the same cache the background save fills, and never precaches them.
    const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');
    expect(config).toContain(`cacheName: '${VOICE_CACHE}'`);
    expect(/globPatterns:[^\n]*m4a/.test(config)).toBe(false);
    const rule = /urlPattern: (\/\\\/voice.*\/),/.exec(config)![1]!;
    const re = new RegExp(rule.slice(1, -1));
    expect(re.test(`https://x.test/anygym/${clipUrl('n9')!.replace(/^\//, '')}`)).toBe(true);
    expect(re.test('https://x.test/anygym/voice/n9.m4a')).toBe(true);
    expect(re.test('https://x.test/anygym/ex/a/0.webp')).toBe(false);
  });
});
