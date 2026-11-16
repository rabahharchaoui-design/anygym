// PLAN 3.6k (audit A4): once the first load has settled and a plan exists, the current plan's photos
// are saved for offline in the background (lib/photoWarm.ts); again whenever the plan, its build or
// an "Always use this" pick changes. Skipped offline and when the phone asks to save data. Nothing
// is shown: a photo that fails is tried again on the next launch.
import { useEffect } from 'react';
import { db } from '../db/schema';
import { getPlanState } from '../db/planState';
import { assetUrl, demoFor } from '../data/exerciseInfo';
import { planById } from '../data/plans';
import { alwaysPicksFor, planExerciseIds, planPhotoPaths } from '../lib/planPhotos';
import { browserWarmDeps, warmPhotos } from '../lib/photoWarm';
import { wantsLessData } from '../ui/icon3d/icons';
import { useLive } from './useLive';
import { usePlanRegistry } from './usePlanRegistry';

async function planPhotoUrls(): Promise<string> {
  const state = await getPlanState();
  const plan = planById(state?.planId);
  if (!state || !plan) return '';
  const picks = alwaysPicksFor(plan.id, await db.exerciseSettings.toArray());
  return planPhotoPaths(planExerciseIds(plan, picks), demoFor, 'webp').map(assetUrl).join('\n');
}

const loaded = () =>
  new Promise<void>((done) => {
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', () => done(), { once: true });
  });

const lessData = () => wantsLessData(navigator as never, (q) => typeof matchMedia === 'function' && matchMedia(q).matches);

export function useWarmPlanPhotos(): void {
  const registry = usePlanRegistry().state;
  // The list as one string, so a re-render with the same photos never starts again.
  const urls = useLive(planPhotoUrls, [registry]).data ?? '';
  useEffect(() => {
    const deps = browserWarmDeps();
    if (!urls || !deps || lessData()) return;
    const stop = new AbortController();
    // A reload or a closed tab cancels the fetches cleanly (WebKit logs an error for a fetch cut by a page going away).
    const leave = () => stop.abort();
    window.addEventListener('pagehide', leave, { once: true });
    window.addEventListener('beforeunload', leave, { once: true });
    void loaded()
      .then(() => (stop.signal.aborted || !deps.online() ? undefined : warmPhotos(urls.split('\n'), deps, stop.signal)))
      .catch(() => undefined);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('beforeunload', leave);
      stop.abort();
    };
  }, [urls]);
}
