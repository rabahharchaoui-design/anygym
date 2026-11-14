// Today's toast sits just above the tab bar, over no button (gate 3). PLAN 3.6f round 3 (critic 6):
// Today used to scroll its cards clear of the toast, so after Finish then Done, or "Use this plan",
// it landed with the plan name and "Next up" under the header. Now, from the top of the page, the
// page does not move: the first card or line (or row of the week strip) under the toast steps
// down below it, and steps back when the toast goes. Only when the person has already scrolled, or
// the button under the toast is the day's title or Start (a very short screen), the page scrolls
// as before.
import { useEffect, useRef, type RefObject } from 'react';
import { COLLAPSE_PX } from '../../ui/TopBar';

/** Space kept between the toast and the nearest button. */
const GAP = 8;
/** The toast's least height (ui/Toast.module.css), for a measure taken before it is drawn. */
const TOAST_MIN = 52;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * `stack`: Today's column of cards. Containers whose children may step down carry `data-room` (the
 * stack itself and the day card's week strip). `last`: the lowest card that must stay clear when
 * the page scrolls instead (the quick workout row).
 */
export function useToastRoom(toast: unknown, ready: boolean, stack: RefObject<HTMLElement | null>, last: RefObject<HTMLElement | null>): void {
  /** The card or row that stepped down, while it is down. */
  const moved = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = stack.current;
    if (!root || !ready) return;
    if (!toast) {
      // The toast went: the card steps back up.
      const el = moved.current;
      moved.current = null;
      if (el) {
        el.style.transition = reduced() ? '' : 'margin-top 220ms var(--ease-out)';
        el.style.marginTop = '';
      }
      return;
    }
    const place = (mayScroll: boolean) => {
      const anchor = document.querySelector<HTMLElement>('[data-toast-anchor]');
      const scroller = root.closest<HTMLElement>('[data-scroller]');
      if (!anchor || !scroller) return;
      const a = anchor.getBoundingClientRect();
      const band = { top: Math.min(a.top, a.bottom - TOAST_MIN) - GAP, bottom: a.bottom + GAP };
      const under = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > band.top && r.top < band.bottom;
      };
      // Measure the page as it is without the room made before (a card may have arrived since).
      const before = moved.current;
      const was = before?.style.marginTop ?? '';
      if (before) {
        before.style.transition = '';
        before.style.marginTop = '';
      }
      // The first thing under the toast: a button, or a whole card or line after the day card (never half covered words).
      const first = [...root.querySelectorAll<HTMLElement>('button, a, :scope > :not(:first-child)')].find(under);
      let unit: HTMLElement | null = first ?? null;
      while (unit && unit.parentElement && !unit.parentElement.hasAttribute('data-room')) unit = unit.parentElement;
      // The day card itself never steps down (its title and Start are the top of the page).
      const fixedPart = !!unit && unit.parentElement === root && unit === root.firstElementChild;
      if (!first || !unit || !root.contains(unit) || fixedPart || (scroller.scrollTop > 0 && !before)) {
        if (before) before.style.marginTop = was;
        const card = last.current;
        if (!first || before || !mayScroll || !card) return;
        // As before: the page scrolls its cards clear, never to rest inside the title's collapse.
        const overlap = card.getBoundingClientRect().bottom - band.top;
        const by = scroller.scrollTop < COLLAPSE_PX ? Math.max(overlap, COLLAPSE_PX - scroller.scrollTop) : overlap;
        if (overlap > 0) scroller.scrollBy({ top: by, behavior: reduced() ? 'auto' : 'smooth' });
        return;
      }
      const own = parseFloat(getComputedStyle(unit).marginTop) || 0;
      moved.current = unit;
      unit.style.marginTop = `${Math.ceil(own + band.bottom - first.getBoundingClientRect().top)}px`;
    };
    // Only the first measure may scroll the page; later ones only move the room.
    let firstRun = true;
    const run = () => {
      place(firstRun);
      firstRun = false;
    };
    let frame = requestAnimationFrame(run);
    // Cards that arrive after the toast (the coach's card, worked lately) are measured again, on the
    // next frame (never inside the observer: it must not resize what it watches).
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null;
    ro?.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  }, [toast, ready, stack, last]);
}
