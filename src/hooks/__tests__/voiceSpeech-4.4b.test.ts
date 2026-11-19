// PLAN 4.4b (MINOR): the phone's voice list may be empty until voiceschanged: it is waited for.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { speak } from '../voiceSpeech';

afterEach(() => vi.unstubAllGlobals());

describe('speak (PLAN 4.4b MINOR)', () => {
  it('waits for the voices when the list is still empty, then picks one', async () => {
    let voices: Array<{ name: string; lang: string; localService: boolean; default: boolean }> = [];
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => voices,
      speak: (u: { voice?: { name: string }; onend: () => void }) => {
        spoken.push(u.voice?.name ?? null);
        u.onend();
      },
    });
    const spoken: Array<string | null> = [];
    vi.stubGlobal('window', { speechSynthesis: synth, setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) });
    vi.stubGlobal('SpeechSynthesisUtterance', class { voice?: unknown; lang = ''; onend = () => {}; onerror = () => {}; constructor(public text: string) {} });
    const said = speak('One mile.');
    voices = [{ name: 'Samantha (Enhanced)', lang: 'en-US', localService: true, default: false }];
    synth.dispatchEvent(new Event('voiceschanged'));
    expect(await said).toBe(true);
    expect(spoken).toEqual(['Samantha (Enhanced)']);
  });
});
