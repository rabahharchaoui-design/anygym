import { describe, expect, it } from 'vitest';
import { composeCue, GAP_MS } from '../compose';
import { CUE_GAP_SEC, nextStart, planCue, soundBounds } from '../schedule';
import { pickVoice, voiceScore } from '../speech';

describe('planCue: clips back to back, like one sentence', () => {
  const cue = composeCue({ type: 'split', count: 1, unit: 'mi', movingSec: 552, paceSec: 552 });
  const plan = planCue(cue, () => 0.5, 10);
  it('each clip starts when the one before ended plus its small gap', () => {
    expect(plan.clips.map((c) => c.id)).toEqual(cue.map((c) => c.id));
    expect(plan.clips[0]!.at).toBe(10);
    for (let i = 1; i < plan.clips.length; i++) {
      const prev = plan.clips[i - 1]!;
      expect(plan.clips[i]!.at).toBeCloseTo(prev.at + prev.sec + GAP_MS[cue[i - 1]!.gap] / 1000, 9);
    }
  });
  it('never overlaps, and the pause after the last clip is not part of the cue', () => {
    for (let i = 1; i < plan.clips.length; i++) expect(plan.clips[i]!.at).toBeGreaterThanOrEqual(plan.clips[i - 1]!.at + plan.clips[i - 1]!.sec);
    const last = plan.clips[plan.clips.length - 1]!;
    expect(plan.end).toBeCloseTo(last.at + last.sec, 9);
  });
  it('gaps stay tight: a word gap is tens of milliseconds, a stop well under half a second', () => {
    expect(GAP_MS.word).toBeLessThanOrEqual(60);
    expect(GAP_MS.comma).toBeLessThanOrEqual(220);
    expect(GAP_MS.stop).toBeLessThanOrEqual(450);
  });
  it('an empty cue takes no time', () => {
    expect(planCue([], () => 1, 3)).toEqual({ clips: [], end: 3 });
  });
});

describe('the queue: one cue after the other', () => {
  it('starts at once when nothing plays, after the playing cue otherwise', () => {
    expect(nextStart(5, 0)).toBeCloseTo(5.06, 9);
    expect(nextStart(5, 8)).toBeCloseTo(8 + CUE_GAP_SEC, 9);
    const first = planCue(composeCue({ type: 'interval', name: 'run', last: false }), () => 0.5, nextStart(5, 0));
    const second = planCue(composeCue({ type: 'paused' }), () => 0.6, nextStart(5.01, first.end));
    expect(second.clips[0]!.at).toBeGreaterThanOrEqual(first.end + CUE_GAP_SEC);
  });
});

describe('soundBounds: silence at both ends of a decoded clip is not played', () => {
  it('finds the sound', () => {
    const s = new Float32Array(1000);
    s.fill(0.2, 300, 700);
    const b = soundBounds(s, 1000);
    expect(b.start).toBeCloseTo(0.296, 6);
    expect(b.sec).toBeCloseTo(0.408, 6);
  });
  it('a clip with no silence, and a silent clip, are played whole', () => {
    expect(soundBounds(new Float32Array(500).fill(0.5), 1000)).toEqual({ start: 0, sec: 0.5 });
    expect(soundBounds(new Float32Array(500), 1000)).toEqual({ start: 0, sec: 0.5 });
  });
});

describe('the stand-in voice: the best installed one, never the compact default when a better one exists', () => {
  const compact = { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', localService: true, default: true };
  const enhanced = { name: 'Samantha (Enhanced)', lang: 'en-US', voiceURI: 'com.apple.voice.enhanced.en-US.Samantha', localService: true };
  const premium = { name: 'Zoe (Premium)', lang: 'en-US', voiceURI: 'com.apple.voice.premium.en-US.Zoe', localService: true };
  const british = { name: 'Daniel (Enhanced)', lang: 'en-GB', voiceURI: 'com.apple.voice.enhanced.en-GB.Daniel', localService: true };
  const french = { name: 'Thomas (Premium)', lang: 'fr-FR', localService: true };
  const novelty = { name: 'Zarvox', lang: 'en-US', localService: true };
  it('premium over enhanced over compact', () => {
    expect(pickVoice([compact, enhanced, premium])).toBe(premium);
    expect(pickVoice([compact, enhanced])).toBe(enhanced);
    expect(pickVoice([enhanced, compact])).toBe(enhanced);
  });
  it('an enhanced voice of another English beats the compact default', () => {
    expect(pickVoice([compact, british])).toBe(british);
    expect(pickVoice([british, enhanced])).toBe(enhanced);
  });
  it('only the compact one installed: it is used; other languages never; none: null', () => {
    expect(pickVoice([compact, french, novelty])).toBe(compact);
    expect(pickVoice([french])).toBeNull();
    expect(pickVoice([])).toBeNull();
    expect(voiceScore(french)).toBe(-1);
    expect(voiceScore({ name: 'x', lang: 'en_US' })).toBeGreaterThan(0);
  });
});
