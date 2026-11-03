// iOS style navigation (SPEC 13.2, 23.1). Every screen change goes through `go`, which picks how
// it moves: push (new screen in from the right, the old one 30% left and dimmed), pop (the
// reverse), tab (crossfade with a small rise, never a slide), expand (a card grows into the next
// screen) or none. The View Transitions API animates snapshots, so the old screen is never kept in
// the DOM; the CSS for each kind lives in src/styles/transitions.css (crossfades for reduced motion).
import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';
import { sheetHistory } from './sheetHistory';

export type NavKind = 'push' | 'pop' | 'tab' | 'expand' | 'fade' | 'down' | 'none';

/** Tab roots are depth 0; screens pushed on top of them are deeper. */
export function depthOf(path: string): number {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/run' || p === '/history' || p === '/plans') return 0;
  const workout = /^\/workout\/[^/]+(\/(.+))?$/.exec(p);
  if (workout) return workout[2] && workout[2] !== 'done' ? 2 : 1;
  if (p.startsWith('/settings/')) return 2;
  return 1;
}

/** How moving from one path to another should look when the caller does not say. */
export function kindBetween(from: string, to: string): NavKind {
  if (from === to) return 'none';
  const a = depthOf(from);
  const b = depthOf(to);
  if (a === 0 && b === 0) return 'tab';
  if (b > a) return 'push';
  if (b < a) return 'pop';
  return 'fade';
}

export const supportsViewTransitions = (): boolean =>
  typeof document !== 'undefined' && typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function';

type VT = {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
};

/**
 * Runs a DOM changing update inside a view transition of the given kind (or plainly when
 * unsupported). `async: true` for history steps (go(-1)): the new screen arrives after popstate.
 */
/**
 * PLAN 2.2e round 3 (critic B2): a screen that needs a read before it can be drawn whole (Finish)
 * holds the arriving snapshot until it is ready, so the page slides in complete, never empty and
 * then filled. Call during the arriving screen's first commit (a layout effect); call the returned
 * release once drawn. A hold never blocks longer than HOLD_MAX_MS.
 */
const holds = new Set<Promise<void>>();
const HOLD_MAX_MS = 350;
export function holdTransition(): () => void {
  let release!: () => void;
  const p = new Promise<void>((r) => (release = r));
  holds.add(p);
  return () => {
    holds.delete(p);
    release();
  };
}
const held = (): Promise<unknown> => (holds.size ? Promise.race([Promise.all([...holds]), new Promise((r) => setTimeout(r, HOLD_MAX_MS))]) : Promise.resolve());

/** True while a view transition runs (an arriving screen draws itself whole, without its own cascade). */
export const transitionRunning = (): boolean => typeof document !== 'undefined' && !!document.documentElement.dataset.nav;

export function withTransition(kind: NavKind, update: () => void, async = false, flat = false): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => VT;
  };
  if (kind === 'none' || !supportsViewTransitions()) {
    if (kind === 'none') delete document.documentElement.dataset.navFallback;
    else document.documentElement.dataset.navFallback = kind;
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = kind;
  // flat: one plain page snapshot, no shared elements (the hero and the workout header slide out
  // with their page instead of being cut out of it, critic B2).
  if (flat) root.dataset.navFlat = '';
  else delete root.dataset.navFlat;
  // The new screen is captured a moment after React commits, once its mount effects have run:
  // capturing straight away let a screen's first effects end the transition on the spot.
  const t = doc.startViewTransition!(() => (async ? afterPopstate(update) : settle(() => flushSync(update))));
  // A newer transition (a fast second tap) skips this one: that is fine, never an unhandled error.
  t.ready?.catch(() => undefined);
  t.updateCallbackDone?.catch(() => undefined);
  t.finished
    .catch(() => undefined)
    .finally(() => {
      if (root.dataset.nav === kind) delete root.dataset.nav;
      if (flat) delete root.dataset.navFlat;
    });
}

function settle(update: () => void): Promise<void> {
  update();
  return new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS)).then(() => held()).then(() => undefined);
}

/** How long a new screen gets to run its mount effects before it is captured (round 3: 8 ms, was 24). */
const SETTLE_MS = 8;

/** Steps through history, then resolves once React has had time to draw the screen it landed on. */
function afterPopstate(update: () => void): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', onPop);
      // Rendering is paused while a view transition waits for its update, so no rAF here: give
      // React a moment to draw the screen it landed on.
      setTimeout(resolve, SETTLE_MS + 8);
    };
    const onPop = () => finish();
    window.addEventListener('popstate', onPop);
    setTimeout(finish, 300);
    update();
  });
}

/** navigate with the right transition: go('/plans/x') pushes, go(-1) or go('/plans', { kind: 'pop' }) goes back. */
export function useNav() {
  const navigate = useNavigate();
  return useCallback(
    (to: To | number, opts: NavigateOptions & { kind?: NavKind; flat?: boolean } = {}) => {
      const { kind: asked, flat, ...rest } = opts;
      const from = window.location.hash.replace(/^#/, '') || '/';
      const target = typeof to === 'number' ? null : typeof to === 'string' ? to : (to.pathname ?? from);
      const kind = asked ?? (typeof to === 'number' ? (to < 0 ? 'pop' : 'push') : kindBetween(from.split('?')[0]!, target!.split('?')[0]!));
      // After a sheet closed by hand has used up its history entry, never racing it.
      sheetHistory().whenSettled(() => withTransition(kind, () => (typeof to === 'number' ? navigate(to) : navigate(to, rest)), typeof to === 'number', flat));
    },
    [navigate],
  );
}
