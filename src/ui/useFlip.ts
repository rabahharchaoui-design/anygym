// PLAN 3.5w: rows that end up somewhere else after a layout change glide there instead of jumping
// (first, last, invert, play). Movement only: a translate on the shared page spring (the one that
// moves things across the screen: no overshoot, 220 ms), so it runs on the compositor and never
// animates a layout property. Reduced motion: the rows are simply there.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { PAGE, prefersReducedMotion } from './motion';

/** The page spring as CSS (tokens.css mirrors motion.ts); a plain ease out where linear() is not known. */
const springEasing = (): string => getComputedStyle(document.documentElement).getPropertyValue('--ease-nav-spring').trim() || 'ease-out';

const playing = new WeakMap<HTMLElement, Animation>();

function glide(el: HTMLElement, dy: number): void {
  // One animation per row: a second change takes over from the first.
  playing.get(el)?.cancel();
  const frames = [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }];
  let run: Animation;
  try {
    run = el.animate(frames, { duration: PAGE.durationMs, easing: springEasing() });
  } catch {
    run = el.animate(frames, { duration: PAGE.durationMs, easing: 'ease-out' });
  }
  playing.set(el, run);
}

/**
 * Watches the direct children of `ref`. When `key` changes and a child's layout position moved,
 * the child plays from where it was to where it is. Nothing is left on it once it has landed.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, key: unknown): void {
  const tops = useRef<number[] | null>(null);
  const last = useRef(key);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    // offsetTop is the layout position: a transform still playing never skews it.
    const now = kids.map((k) => k.offsetTop);
    const before = tops.current;
    if (before && before.length === now.length && last.current !== key && !prefersReducedMotion()) {
      kids.forEach((k, i) => {
        const dy = before[i]! - now[i]!;
        if (Math.abs(dy) >= 1) glide(k, dy);
      });
    }
    tops.current = now;
    last.current = key;
  });
}
