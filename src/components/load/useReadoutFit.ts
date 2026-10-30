import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How the plate readout lays out its row "Type it | total | Clear" (PLAN 2.0b):
 * 0 = all on one row; 1 = the total gets its own row and the links go under the math line, with
 * the bar control between them; 2 = as 1, the bar control on a row of its own.
 * A long total ("227.5 kg") or bigger text on a 320 pt phone never pushes a link past the margins.
 */
export type ReadoutFit = 0 | 1 | 2;

const SLACK = 2;

/** Pure rule, exported for the tests. Widths in CSS px. */
export function readoutFit(room: number, total: number, sides: readonly number[], action: number): ReadoutFit {
  const side = Math.max(0, ...sides);
  // The total sits centered, so each side column gets half of what is left.
  if (side * 2 + total <= room - SLACK) return 0;
  if (sides.reduce((a, b) => a + b, 0) + action <= room - SLACK) return 1;
  return 2;
}

const width = (el: Element | null) => (el instanceof HTMLElement ? el.scrollWidth : 0);

/**
 * Measures the readout's parts (marked data-fit="total" / "side" / "action") and keeps the fit
 * level current through font size and width changes. `key` changes when the total's text does.
 */
export function useReadoutFit(ref: RefObject<HTMLElement | null>, key: string): ReadoutFit {
  const [fit, setFit] = useState<ReadoutFit>(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const total = el.querySelector('[data-fit="total"]');
      if (!total) return setFit(0);
      const sides = [...el.querySelectorAll('[data-fit="side"] > *')].map(width);
      setFit(readoutFit(el.clientWidth, width(total), sides, width(el.querySelector('[data-fit="action"] button'))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const part of el.querySelectorAll('[data-fit]')) ro.observe(part);
    for (const part of el.querySelectorAll('[data-fit] > *, [data-fit] button')) ro.observe(part);
    return () => ro.disconnect();
  }, [ref, key]);
  return fit;
}
