// PLAN 4.4: the voice coach in tests. The player's two outputs are replaced before the app loads:
// Web Audio (every clip that is scheduled is written down with its id, start time and length) and
// the phone's own speech (every sentence is written down with the voice it was given). The clips
// themselves are still fetched from the built app, so a missing file is seen like on a phone.
import type { Page } from '../fixtures';

export type PlayedClip = { id: string; at: number; dur: number };
export type Spoken = { text: string; voice: string | null };
type VoiceLog = { clips: PlayedClip[]; speech: Spoken[]; flashes: string[] };

export async function stubVoice(page: Page) {
  await page.addInitScript(() => {
    const log: VoiceLog = { clips: [], speech: [], flashes: [] };
    (window as unknown as { __voice: VoiceLog }).__voice = log;
    // Which file an ArrayBuffer came from, so a decoded clip knows its id.
    const from = new WeakMap<ArrayBuffer, string>();
    const original = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function (this: Response) {
      const data = await original.call(this);
      from.set(data, this.url);
      return data;
    };
    type FakeBuffer = { id: string; duration: number; sampleRate: number; getChannelData: () => Float32Array };
    const param = () => ({ value: 0 });
    class FakeContext {
      state = 'running';
      destination = {};
      get currentTime() {
        return Date.now() / 1000;
      }
      resume() {
        return Promise.resolve();
      }
      createGain() {
        return { gain: param(), connect: () => undefined };
      }
      createDynamicsCompressor() {
        return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: () => undefined };
      }
      decodeAudioData(data: ArrayBuffer, ok?: (b: FakeBuffer) => void) {
        const id = /voice\/([^./?]+)\.m4a/.exec(from.get(data) ?? '')?.[1] ?? '?';
        // Half a second of sound with a little silence on both sides, like a decoded file.
        const samples = new Float32Array(600);
        samples.fill(0.5, 50, 550);
        const buffer: FakeBuffer = { id, duration: 0.6, sampleRate: 1000, getChannelData: () => samples };
        ok?.(buffer);
        return Promise.resolve(buffer);
      }
      createBufferSource() {
        const src = {
          buffer: null as FakeBuffer | null,
          connect: () => undefined,
          start: (at: number, _offset: number, dur: number) => void log.clips.push({ id: src.buffer!.id, at, dur }),
        };
        return src;
      }
    }
    const w = window as unknown as Record<string, unknown>;
    w.AudioContext = FakeContext;
    w.webkitAudioContext = FakeContext;
    w.SpeechSynthesisUtterance = class {
      text: string;
      voice: { name: string } | null = null;
      lang = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        // The small default voice first, a better one after it: the better one must be picked.
        getVoices: () => [
          { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', localService: true, default: true },
          { name: 'Ava (Premium)', lang: 'en-US', voiceURI: 'com.apple.voice.premium.en-US.Ava', localService: true, default: false },
        ],
        speak: (u: { text: string; voice: { name: string } | null; onend: (() => void) | null }) => {
          log.speech.push({ text: u.text, voice: u.voice?.name ?? null });
          setTimeout(() => u.onend?.(), 800);
        },
      },
    });
    // The colour flash at an interval switch lives a third of a second: every one that appears is written down.
    new MutationObserver((changes) => {
      for (const c of changes)
        c.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.dataset.testid === 'interval-flash') log.flashes.push(n.dataset.effort ?? '');
        });
    }).observe(document, { childList: true, subtree: true });
  });
}

const read = (page: Page) => page.evaluate(() => (window as unknown as { __voice: VoiceLog }).__voice);
/** The ids of every clip scheduled so far, in order. */
export const playedIds = async (page: Page) => (await read(page)).clips.map((c) => c.id);
export const played = async (page: Page) => (await read(page)).clips;
export const spoken = async (page: Page) => (await read(page)).speech;
export const flashes = async (page: Page) => (await read(page)).flashes;
