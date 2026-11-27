// Saves the voice pack for offline, in the background (PLAN 4.4), the way the plan's photos are
// saved (lib/photoWarm.ts): a few clips at a time, in idle time, into the cache the service worker
// reads; never again for a clip already kept; nothing is shown and nothing throws. Until it is done
// each clip is simply fetched the first time it is needed.
import { browserWarmDeps, warmPhotos } from '../lib/photoWarm';
import { wantsLessData } from '../ui/icon3d/icons';
import { allClipUrls, VOICE_CACHE } from './voiceAudio';
import { warmAcrossPageHide } from './warmAcrossPageHide';

let started = false;

/** Once per visit, after the page has loaded. Skipped when the phone asks to save data. Opened
 *  offline, nothing is fetched then; the save goes once on the next online or pageshow (PLAN R4 3). */
export function warmVoicePack(): void {
  if (started) return;
  const deps = browserWarmDeps(VOICE_CACHE);
  if (!deps || wantsLessData(navigator as never, (q) => typeof matchMedia === 'function' && matchMedia(q).matches)) return;
  started = true;
  // A page going away stops the fetches cleanly; coming back (pageshow) goes on with the rest (PLAN 4.4b 7).
  const go = () => warmAcrossPageHide((signal) => (deps.online() ? warmPhotos(allClipUrls(), deps, signal, 4) : Promise.resolve({ stopped: true })));
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
