// Saves the voice pack for offline, in the background (PLAN 4.4), the way the plan's photos are
// saved (lib/photoWarm.ts): a few clips at a time, in idle time, into the cache the service worker
// reads; never again for a clip already kept; nothing is shown and nothing throws. Until it is done
// each clip is simply fetched the first time it is needed.
import { browserWarmDeps, warmPhotos } from '../lib/photoWarm';
import { wantsLessData } from '../ui/icon3d/icons';
import { allClipUrls, VOICE_CACHE } from './voiceAudio';

let started = false;

/** Once per visit, after the page has loaded. Skipped offline and when the phone asks to save data. */
export function warmVoicePack(): void {
  if (started) return;
  const deps = browserWarmDeps(VOICE_CACHE);
  if (!deps || !deps.online() || wantsLessData(navigator as never, (q) => typeof matchMedia === 'function' && matchMedia(q).matches)) return;
  started = true;
  const stop = new AbortController();
  const leave = () => stop.abort();
  window.addEventListener('pagehide', leave, { once: true });
  window.addEventListener('beforeunload', leave, { once: true });
  const go = () => void warmPhotos(allClipUrls(), deps, stop.signal, 4).catch(() => undefined);
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
