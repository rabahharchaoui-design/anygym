// The stand-in voice (PLAN 4.4): only when a recorded clip is missing or cannot be played, the
// phone's own voice says the sentence. Pure: this file only picks which installed voice. The best
// one wins: Premium, then Enhanced, then any natural sounding one; the small default ("compact")
// voice is used only when nothing better is installed.
export type VoiceLike = { name: string; lang: string; localService?: boolean; default?: boolean; voiceURI?: string };

/** Novelty and very robotic voices that some phones list under English. */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|eloquence|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;

/** Higher is better. Below zero: never used. */
export function voiceScore(v: VoiceLike, want = 'en-US'): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return -1;
  const text = `${v.name} ${v.voiceURI ?? ''}`.toLowerCase();
  let score = 0;
  if (/premium/.test(text)) score += 400;
  else if (/enhanced/.test(text)) score += 300;
  else if (/natural|neural|siri/.test(text)) score += 200;
  if (/compact/.test(text)) score -= 100;
  if (NOVELTY.test(v.name)) score -= 150;
  if (lang === want.toLowerCase()) score += 40;
  if (v.localService) score += 20;
  if (v.default) score += 5;
  return Math.max(0, score + 150);
}

/** The best installed English voice, or null when there is none (the phone then uses its own default). */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], want = 'en-US'): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = voiceScore(v, want);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}
