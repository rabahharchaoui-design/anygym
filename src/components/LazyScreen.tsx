import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { appActivity } from '../pwa';
import { retryLoad } from '../lib/loadRetry';
import { LoadError } from './LoadError';
import styles from './LazyScreen.module.css';

/** Screens read what they need from the URL, so a lazy screen takes no props. */
type Load = () => Promise<ComponentType>;

/**
 * PLAN PB1: a screen kept out of the first download. Its chunk is fetched when the screen opens
 * (or earlier with preload()), and is in the service worker precache like every other chunk, so it
 * opens with no signal after the first visit. While it loads the page stays plain graphite (no
 * spinner, nothing that could flash on a fast switch). A failed fetch (no signal before the app was
 * saved) shows the usual load error with Try again, never a blank screen.
 */
export function lazyScreen(load: Load): { Screen: ComponentType; preload: () => Promise<unknown> } {
  let made: ComponentType | null = null;
  const fetchScreen = () =>
    load().then(
      (C) => ({ default: C }),
      (cause: unknown) => Promise.reject(new ScreenLoadError(cause)),
    );
  const current = () => (made ??= lazy(fetchScreen));
  const reset = () => {
    made = null;
  };
  function Screen() {
    const [attempt, setAttempt] = useState(0);
    const C = current();
    return (
      <LoadBoundary key={attempt} onRetry={() => retry(() => { reset(); setAttempt((n) => n + 1); })}>
        <Suspense fallback={<div className={styles.wait} aria-busy="true" data-testid="screen-wait" />}>
          <C />
        </Suspense>
      </LoadBoundary>
    );
  }
  return { Screen, preload: () => load().catch(() => undefined) };
}

type BoundaryProps = { onRetry: () => void; children: ReactNode };

/** Catches only the failed chunk fetch of its screen; any other error goes on to the app's net. */
class LoadBoundary extends Component<BoundaryProps, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('render failed') };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Not a missing file: thrown again so the app's own safety net handles it as before.
    if (!isChunkLoadError(error)) throw error;
    return (
      <div className={styles.failed}>
        <LoadError text="Could not open this screen. Check your signal." onRetry={this.props.onRetry} />
      </div>
    );
  }
}

/**
 * Try again. WebKit remembers a module that failed to fetch for the life of the page, so asking
 * again in place may fail again: with signal and nothing active the page is loaded afresh on the
 * same address (all data is saved; this screen had not opened yet). While a workout or a run is
 * active the page is never reloaded (PLAN R1): the file is asked for again in place, as with no
 * signal, which at worst shows this error again rather than losing the run.
 */
function retry(inPlace: () => void): void {
  void retryLoad(navigator.onLine, appActivity, () => window.location.reload(), inPlace);
}

/** The screen's file could not be fetched (marked where the import fails, so no other error is mistaken for it). */
export class ScreenLoadError extends Error {
  constructor(cause: unknown) {
    super('screen file could not load', { cause });
    this.name = 'ScreenLoadError';
  }
}

function isChunkLoadError(error: unknown): boolean {
  return error instanceof ScreenLoadError;
}
