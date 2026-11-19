import { describe, expect, it } from 'vitest';
import { TAP_GUARD_MS } from '../../hooks/useTapGuard';
import { ARRIVAL_GUARD_MIN_MS, ARRIVAL_GUARD_MS, arrivalWindow } from '../ArrivalGuard';

describe('arrivalWindow (PLAN 4.4a)', () => {
  it('a screen that arrives at once keeps the usual 250 to 300 ms', () => {
    expect(arrivalWindow(1000, 995)).toEqual({ minEnd: 1000 + Math.max(ARRIVAL_GUARD_MIN_MS, TAP_GUARD_MS - 5), maxEnd: 1000 + Math.max(ARRIVAL_GUARD_MS, TAP_GUARD_MS - 5) });
  });
  it('a screen that arrives late still covers TAP_GUARD_MS from the tap', () => {
    // Asked at 1000, arrived 120 ms later (a slow phone): the second tap of a double tap at 1300 is caught.
    const w = arrivalWindow(1120, 1000);
    expect(w.minEnd).toBeGreaterThanOrEqual(1000 + TAP_GUARD_MS);
    expect(w.maxEnd).toBeGreaterThanOrEqual(w.minEnd);
  });
  it('a screen change no go() asked for (browser Back) keeps the usual window', () => {
    expect(arrivalWindow(5000, 1000)).toEqual({ minEnd: 5000 + ARRIVAL_GUARD_MIN_MS, maxEnd: 5000 + ARRIVAL_GUARD_MS });
    expect(arrivalWindow(5000, -Infinity)).toEqual({ minEnd: 5000 + ARRIVAL_GUARD_MIN_MS, maxEnd: 5000 + ARRIVAL_GUARD_MS });
  });
});
