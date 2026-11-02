import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './ArrivalGuard.module.css';

/** Longest a newly arrived screen ignores taps. */
export const ARRIVAL_GUARD_MS = 300;
/** Shortest: the second tap of a human double tap lands within about 250 ms. */
export const ARRIVAL_GUARD_MIN_MS = 250;

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
    const root = document.documentElement;
    const started = performance.now();
    let minT = 0;
    const end = () => setActive(false);
    const check = () => {
      if (root.dataset.nav) return;
      const left = ARRIVAL_GUARD_MIN_MS - (performance.now() - started);
      if (left <= 0) end();
      else minT = window.setTimeout(end, left);
    };
    const mo = new MutationObserver(check);
    mo.observe(root, { attributes: true, attributeFilter: ['data-nav'] });
    check();
    const maxT = window.setTimeout(end, ARRIVAL_GUARD_MS);
    return () => {
      mo.disconnect();
      window.clearTimeout(minT);
      window.clearTimeout(maxT);
    };
  }, [pathname]);

  return active ? <div className={styles.guard} aria-hidden="true" data-testid="arrival-guard" /> : null;
}
