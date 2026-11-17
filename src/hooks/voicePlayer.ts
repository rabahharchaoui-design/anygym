// The voice coach's mouth (PLAN 4.4, SPEC 12.4): cues are said one after the other, never two at
// once. A cue is played with the recorded clips; only if that cannot be done, the phone's own voice
// says the same sentence. Nothing here ever throws or blocks: a cue that cannot be said is skipped.
import { composeCue, cueText, wanted, type VoiceEvent, type VoiceSettings } from '../lib/run';
import { STALE_SEC } from '../lib/run/voice/schedule';
import { playClips, unlockAudio } from './voiceAudio';
import { speak } from './voiceSpeech';

let line: Promise<void> = Promise.resolve();

/** Says what happened, if the settings want it said. Returns at once; the sound follows in its turn. */
export function say(event: VoiceEvent, settings: VoiceSettings): void {
  if (!wanted(event, settings)) return;
  const cue = composeCue(event);
  const asked = Date.now();
  line = line
    .then(async () => {
      // A cue that waited too long behind others is old news by now.
      if (Date.now() - asked > STALE_SEC * 1000) return;
      if (!(await playClips(cue))) await speak(cueText(cue));
    })
    .catch(() => undefined);
}

/** From a tap (Start, Resume, Preview): lets the phone play sound from now on. */
export const unlockVoice = unlockAudio;
