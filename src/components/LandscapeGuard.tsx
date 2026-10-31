import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './LandscapeGuard.module.css';

/** A phone on its side: landscape and short. Keep in step with LandscapeGuard.module.css. */
const SIDEWAYS = '(orientation: landscape) and (max-height: 500px)';

/**
 * SPEC 13.4: iOS ignores the manifest's portrait lock, so a phone turned sideways gets one clean
 * full screen card. Shown by CSS only in landscape on a phone sized screen: the app stays mounted
 * underneath and nothing resets, a running workout or timer included.
 *
 * PLAN 2.0f: portaled to the body, outside #root (which becomes a transformed stacking context
 * while a sheet is open) and after the sheets' own portals, so a picker can never cover it. While
 * it shows, everything else on the page is inert and focus moves to the card.
 */
export function LandscapeGuard() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SIDEWAYS);
    const held = new Map<Element, boolean>();
    const release = () => {
      for (const [el, was] of held) if (!was) el.removeAttribute('inert');
      held.clear();
    };
    const apply = () => {
      release();
      if (!mq.matches) return;
      for (const el of Array.from(document.body.children)) {
        if (el === ref.current || el.tagName === 'SCRIPT') continue;
        held.set(el, el.hasAttribute('inert'));
        el.setAttribute('inert', '');
      }
      ref.current?.focus({ preventScroll: true });
    };
    apply();
    mq.addEventListener('change', apply);
    // A sheet opened while sideways is inert at once (its portal is a new body child).
    const watch = new MutationObserver(() => {
      if (!mq.matches) return;
      for (const el of Array.from(document.body.children)) {
        if (el === ref.current || el.tagName === 'SCRIPT' || held.has(el)) continue;
        held.set(el, el.hasAttribute('inert'));
        el.setAttribute('inert', '');
      }
    });
    watch.observe(document.body, { childList: true });
    return () => {
      watch.disconnect();
      mq.removeEventListener('change', apply);
      release();
    };
  }, []);
  return createPortal(
    <div className={styles.guard} role="alert" data-keep-live="" tabIndex={-1} ref={ref} data-testid="landscape-guard">
      <svg className={styles.phone} viewBox="0 0 48 48" aria-hidden="true">
        <rect x="15" y="5" width="18" height="38" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <line x1="21" y1="38" x2="27" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className={styles.title}>Turn your phone upright</p>
      <p className={styles.sub}>AnyGym works in portrait. Your workout is kept.</p>
    </div>,
    document.body,
  );
}
