// The recorded voice through Web Audio (PLAN 4.4): each clip is fetched and decoded once, then the
// clips of a cue are scheduled back to back on the audio clock (lib/run/voice/schedule.ts), so they
// sound like one sentence. Web Audio on purpose, never an <audio> element: on an iPhone an <audio>
// element takes the sound away from the user's music; Web Audio plays on top of it.
import { VOICE_DIR, type Cue } from '../lib/run';
import { nextStart, planCue, soundBounds } from '../lib/run/voice/schedule';
import manifest from '../lib/run/voice/manifest.json';

/** The cache the service worker keeps the clips in (vite.config.ts names the same one; a test checks it). */
export const VOICE_CACHE = 'run-voice';

type Loaded = { buffer: AudioBuffer; start: number; sec: number };
type AudioSessionLike = { type: string };

const files = manifest.clips as Record<string, { file: string; ms: number; v?: string }>;

/**
 * The address of a clip, or null for an id the pack does not hold. Each clip carries its own version
 * (a hash of its bytes, PLAN 4.6c 5): a new clip is fetched again on its own, the rest stay cached.
 */
export function clipUrl(id: string): string | null {
  const c = files[id];
  return c ? `${import.meta.env.BASE_URL}${VOICE_DIR}/${c.file}?v=${c.v ?? manifest.version}` : null;
}
export const allClipUrls = (): string[] => Object.keys(files).map((id) => clipUrl(id)!);

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let lastEnd = 0;
const loaded = new Map<string, Promise<Loaded | null>>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    // iPhone (Safari 16.4 and later): "ambient" is the kind of sound that plays over other apps'
    // music without stopping it, and that the silent switch mutes. It is what Web Audio does by
    // itself; saying so keeps the phone from ever treating the voice as a music player.
    const session = (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
    if (session && session.type !== 'ambient') session.type = 'ambient';
  } catch {
    // Not settable here: Web Audio's own default applies.
  }
  try {
    ctx = new AC();
    // A little lift into a limiter: the voice has to be heard over music that is not turned down.
    const gain = ctx.createGain();
    gain.gain.value = 1.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    gain.connect(limiter);
    limiter.connect(ctx.destination);
    out = gain;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a tap: phones only let sound start after one. Safe to call any number of times. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
}

const decode = (c: AudioContext, data: ArrayBuffer) =>
  new Promise<AudioBuffer>((done, fail) => {
    // The callback form works on every Safari; newer browsers also return a promise.
    const p = c.decodeAudioData(data, done, fail) as Promise<AudioBuffer> | undefined;
    p?.then(done, fail);
  });

function load(id: string): Promise<Loaded | null> {
  const known = loaded.get(id);
  if (known) return known;
  const job = (async (): Promise<Loaded | null> => {
    const c = context();
    const url = clipUrl(id);
    if (!c || !url) return null;
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const buffer = await decode(c, await res.arrayBuffer());
    return { buffer, ...soundBounds(buffer.getChannelData(0), buffer.sampleRate) };
  })().catch(() => null);
  loaded.set(id, job);
  // A clip that failed is tried again the next time it is needed.
  void job.then((l) => l === null && loaded.delete(id));
  return job;
}

const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, Math.max(0, ms)));

/**
 * Plays a cue with the recorded clips. False, with nothing played, when any clip is missing or
 * cannot be decoded, or when the phone will not let sound start: the caller then uses the stand-in
 * voice for the whole sentence (never half and half). Resolves when the cue has ended.
 */
export async function playClips(cue: Cue): Promise<boolean> {
  const c = context();
  if (!c || !out) return false;
  const clips = await Promise.all(cue.map((clip) => load(clip.id)));
  if (clips.some((l) => l === null)) return false;
  if (c.state !== 'running') await c.resume().catch(() => undefined);
  if (c.state !== 'running') return false;
  const plan = planCue(cue, (id) => clips[cue.findIndex((x) => x.id === id)]!.sec, nextStart(c.currentTime, lastEnd));
  plan.clips.forEach((t, i) => {
    const l = clips[i]!;
    const src = c.createBufferSource();
    src.buffer = l.buffer;
    src.connect(out!);
    src.start(t.at, l.start, l.sec);
  });
  lastEnd = plan.end;
  await wait((plan.end - c.currentTime) * 1000);
  return true;
}
