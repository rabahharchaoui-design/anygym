// PLAN 2.2e: three named springs and one page transition.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGE, PAGE_SPRING, SHEET_SPRING, SPRINGS, TAP_SPRING, pageVariants, pageVariantsReduced } from '../motion';
import { withTransition } from '../nav';

type Target = { transform?: string; opacity?: number; zIndex?: number };
const at = (v: unknown, dir: number) => (typeof v === 'function' ? (v as (d: number) => Target)(dir) : (v as Target));

describe('motion presets', () => {
  it('tap, sheet and page are named springs', () => {
    expect(SPRINGS).toEqual({ tap: TAP_SPRING, sheet: SHEET_SPRING, page: PAGE_SPRING });
    for (const s of Object.values(SPRINGS)) expect(s.type).toBe('spring');
  });
  it('the page spring is critically damped (no overshoot past the edge)', () => {
    const { stiffness, damping } = PAGE_SPRING as { stiffness: number; damping: number };
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness));
  });
  it('one page transition, 180 to 280 ms: push slides in over a shifted, scaled, dimmed page; pop reverses', () => {
    expect(PAGE.durationMs).toBeGreaterThanOrEqual(180);
    expect(PAGE.durationMs).toBeLessThanOrEqual(280);
    expect(PAGE.scale).toBeGreaterThan(0.9);
    expect(PAGE.scale).toBeLessThan(1);
    const under = `translateX(${PAGE.shift}) scale(${PAGE.scale})`;
    // push: new from the right, old goes under
    expect(at(pageVariants.enter, 1).transform).toBe('translateX(100%) scale(1)');
    expect(at(pageVariants.exit, 1)).toMatchObject({ transform: under, opacity: PAGE.dim });
    // pop: the exact reverse
    expect(at(pageVariants.enter, -1)).toMatchObject({ transform: under, opacity: PAGE.dim });
    expect(at(pageVariants.exit, -1).transform).toBe('translateX(100%) scale(1)');
    // no movement after an edge swipe
    expect(at(pageVariants.enter, 0).transform).toBe('translateX(0%) scale(1)');
  });
  it('reduced motion: no movement, a crossfade', () => {
    for (const k of ['enter', 'center', 'exit'] as const) expect(at(pageVariantsReduced[k], 1).transform).toBeUndefined();
    expect(at(pageVariantsReduced.enter, 1).opacity).toBe(0);
    expect(at(pageVariantsReduced.center, 1).opacity).toBe(1);
  });
});

describe('reduced motion navigation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('still one view transition per change: its CSS swaps the slide for a crossfade', () => {
    const dataset: Record<string, string> = {};
    const startViewTransition = vi.fn(() => ({ finished: Promise.resolve() }));
    vi.stubGlobal('document', { documentElement: { dataset }, startViewTransition });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    withTransition('push', () => undefined);
    expect(startViewTransition).toHaveBeenCalledOnce();
  });
});
