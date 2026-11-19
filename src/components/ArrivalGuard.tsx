import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TAP_GUARD_MS } from '../hooks/useTapGuard';
import { lastNavRequestAt } from '../ui/nav';
import styles from './ArrivalGuard.module.css';

/** Longest a newly arrived screen ignores taps. */
export const ARRIVAL_GUARD_MS = 300;
/** Shortest: the second tap of a human double tap lands within about 250 ms. */
export const ARRIVAL_GUARD_MIN_MS = 250;

/**
 * When the guard of a screen that arrived at `started` may end (once settled) and must end, given
 * when its go() was asked for (`asked`; ignored when it is not this arrival's).
 */
export function arrivalWindow(started: number, asked: number): { minEnd: number; maxEnd: number } {
  const tapEnd = asked > started - ARRIVAL_GUARD_MS && asked <= started ? asked + TAP_GUARD_MS : -Infinity;
  return { minEnd: Math.max(started + ARRIVAL_GUARD_MIN_MS, tapEnd), maxEnd: Math.max(started + ARRIVAL_GUARD_MS, tapEnd) };
}

/**
 * After a screen change, an invisible layer swallows taps for 300 ms, so the second tap of a
 * double tap (e.g. on Finish) never lands on whatever sits at that spot on the next screen
 * (SPEC 13.3). Navigation itself stays instant (SPEC 13.2).
 */
export function ArrivalGuard() {
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setActive(true);
    // Round 2 (critic B5): the guard ends when the screen change has settled (the view transition
    // finished, nav.ts clears html[data-nav]), never before a double tap's second tap could land
    // (ARRIVAL_GUARD_MIN_MS) and never later than ARRIVAL_GUARD_MS.
    // PLAN 4.4a: also never before TAP_GUARD_MS after the tap that asked for this screen. On a slow
    // phone the screen arrives late, and a guard timed from its arrival alone let a double tap's
    // second tap land on Minimize, in the spot where Back to the list had been, and leave the workout.
    const root = document.documentElement;
    const started = performance.now();
    const { minEnd, maxEnd } = arrivalWindow(started, lastNavRequestAt());
    let minT = 0;
    const end = () => setActive(false);
    const check = () => {
      if (root.dataset.nav) return;
      const left = minEnd - performance.now();
      if (left <= 0) end();
      else minT = window.setTimeout(end, left);
    };
    const mo = new MutationObserver(check);
    mo.observe(root, { attributes: true, attributeFilter: ['data-nav'] });
    check();
    const maxT = window.setTimeout(end, maxEnd - started);
    return () => {
      mo.disconnect();
      window.clearTimeout(minT);
      window.clearTimeout(maxT);
    };
  }, [pathname]);

  return active ? <div className={styles.guard} aria-hidden="true" data-testid="arrival-guard" /> : null;
}
