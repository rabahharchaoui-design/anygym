// The stand-in voice (PLAN 4.4): the phone's own speech, used only when the recorded clips of a cue
// cannot be played. The best installed voice is picked by lib/run/voice/speech.ts.
import { pickVoice } from '../lib/run/voice/speech';

/** Longer than any sentence the coach says: a phone that never reports the end does not hold the queue. */
const GIVE_UP_MS = 15_000;

/** How long an empty voice list is waited for (PLAN 4.4b MINOR): phones fill it in a moment after start. */
const VOICES_WAIT_MS = 1000;

/** The installed voices; an empty list is waited for until voiceschanged (or VOICES_WAIT_MS). */
function voicesOf(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length || typeof synth.addEventListener !== 'function') return Promise.resolve(now);
  return new Promise((done) => {
    const ready = () => {
      window.clearTimeout(timer);
      synth.removeEventListener('voiceschanged', ready);
      done(synth.getVoices());
    };
    const timer = window.setTimeout(ready, VOICES_WAIT_MS);
    synth.addEventListener('voiceschanged', ready);
  });
}

/** Says the words. Resolves when they ended (true) or could not be said (false). */
export async function speak(text: string): Promise<boolean> {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined' || !text) return false;
  const voices = await voicesOf(synth).catch(() => [] as SpeechSynthesisVoice[]);
  return new Promise<boolean>((done) => {
    let over = false;
    const end = (ok: boolean) => {
      if (over) return;
      over = true;
      window.clearTimeout(timer);
      done(ok);
    };
    const timer = window.setTimeout(() => end(false), GIVE_UP_MS);
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(voices);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'en-US';
      u.onend = () => end(true);
      u.onerror = () => end(false);
      synth.speak(u);
    } catch {
      end(false);
    }
  });
}
