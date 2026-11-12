import { lazy, type ComponentType } from 'react';
import type { ExerciseInfo } from '../../lib/exerciseInfo';

// The muscles and form tips: their own chunk (body maps), mounted after the table (PLAN 2.2d).
// Round 4: the chunk is fetched as soon as this module loads (the app is online then), so opening an
// exercise later, offline before the service worker took over, never asks the network for it. A
// failed fetch is tried again once, then waits for the next exercise to open.
let extrasChunk: Promise<typeof import('./ExerciseExtras')> | null = null;
const loadExtras = () => (extrasChunk ??= import('./ExerciseExtras').catch((err: unknown) => {
  extrasChunk = null;
  throw err;
}));
void loadExtras().catch(() => undefined);
type ExtrasModule = { default: ComponentType<{ info: ExerciseInfo; photosOk: boolean; known: boolean }> };
const NO_EXTRAS: ExtrasModule = { default: () => null };
export const ExerciseExtras = lazy(
  (): Promise<ExtrasModule> =>
    loadExtras().catch(() => new Promise<ExtrasModule>((resolve) => window.setTimeout(() => resolve(loadExtras().catch(() => NO_EXTRAS)), 1500))),
);
