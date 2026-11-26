import { createElement, lazy, useState, type ComponentType } from 'react';
import type { ExerciseInfo } from '../../lib/exerciseInfo';
import { openRetry } from '../../lib/openRetry';

// The muscles and form tips: their own chunk (body maps), mounted after the table (PLAN 2.2d).
// Round 4: the chunk is fetched as soon as this module loads (the app is online then), so opening an
// exercise later, offline before the service worker took over, never asks the network for it. A
// failed fetch is tried again once; if that fails the part shows nothing, and the next exercise
// opened asks again (PLAN R4 6): a failure is never kept for the whole visit.
type Props = { info: ExerciseInfo; photosOk: boolean; known: boolean };
type ExtrasModule = { default: ComponentType<Props> };

let extrasChunk: Promise<typeof import('./ExerciseExtras')> | null = null;
const loadExtras = () => (extrasChunk ??= import('./ExerciseExtras').catch((err: unknown) => {
  extrasChunk = null;
  throw err;
}));
void loadExtras().catch(() => undefined);

const NO_EXTRAS: ExtrasModule = { default: () => null };
const extras = openRetry<ExtrasModule>(loadExtras, NO_EXTRAS, (ms) => new Promise((done) => window.setTimeout(done, ms)));
let Current = lazy(extras.load);

/** One lazy part per exercise open; a new one only after the last open ended with nothing shown. */
export function ExerciseExtras(props: Props) {
  const [Part] = useState(() => {
    if (extras.stale()) Current = lazy(extras.load);
    return Current;
  });
  return createElement(Part, props);
}
