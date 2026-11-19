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
import { browserWarmDeps, warmPhotos, type WarmDeps } from '../lib/photoWarm';
import { warmAcrossPageHide } from './warmAcrossPageHide';
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

/**
 * Saves these photos now, in the background. A page going away stops the fetches cleanly (WebKit
 * logs an error for a fetch cut by a page going away); coming back (pageshow) goes on with the rest
 * (PLAN 4.4b 16). Returns the stop for good.
 */
export function startPlanPhotoWarm(urls: string, deps: WarmDeps, win: Parameters<typeof warmAcrossPageHide>[1] = window): () => void {
  return warmAcrossPageHide((signal) => loaded().then((): Promise<{ stopped: boolean }> | { stopped: boolean } => (signal.aborted || !deps.online() ? { stopped: true } : warmPhotos(urls.split('\n'), deps, signal))), win);
}

export function useWarmPlanPhotos(): void {
  const registry = usePlanRegistry().state;
  // The list as one string, so a re-render with the same photos never starts again.
  const urls = useLive(planPhotoUrls, [registry]).data ?? '';
  useEffect(() => {
    const deps = browserWarmDeps();
    if (!urls || !deps || lessData()) return;
    return startPlanPhotoWarm(urls, deps);
  }, [urls]);
}
