import { useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Marks the screen data-more while content is really hidden under the button, so the soft fade
 * only shows then and never dims a screen that already fits (the scroller's own bottom padding and
 * the "Your plan so far" strip are not content).
 */
export function useMoreBelow(ref: RefObject<HTMLElement | null>): void {
  const update = () => {
    const el = ref.current;
    if (!el?.parentElement) return;
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingBottom) || 0;
    // PLAN 3.3a: the "Your plan so far" strip is not the question; with no room it waits below.
    const strip = el.querySelector<HTMLElement>('[data-testid="plan-so-far"]');
    const spare = strip && strip.dataset.away === undefined ? strip.offsetHeight + (parseFloat(cs.rowGap) || 0) : 0;
    const more = el.scrollHeight - el.clientHeight - el.scrollTop > pad + spare + 1;
    if (more) el.parentElement.dataset.more = '';
    else delete el.parentElement.dataset.more;
  };
  // Every render: the answer can change with the content.
  useLayoutEffect(update);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
