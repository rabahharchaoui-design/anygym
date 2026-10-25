import { afterEach, describe, expect, it, vi } from 'vitest';
import { depthOf, kindBetween, supportsViewTransitions, withTransition } from '../nav';

describe('depthOf (PLAN 1.7e)', () => {
  it('tab roots are depth 0', () => {
    for (const p of ['/', '/run', '/history', '/plans', '/plans/']) expect(depthOf(p)).toBe(0);
  });
  it('pushed screens are deeper', () => {
    expect(depthOf('/settings')).toBe(1);
    expect(depthOf('/plans/five-day-split')).toBe(1);
    expect(depthOf('/history/abc')).toBe(1);
    expect(depthOf('/dev/viewport')).toBe(1);
    expect(depthOf('/workout/s1')).toBe(1);
    expect(depthOf('/workout/s1/done')).toBe(1);
    expect(depthOf('/workout/s1/barbell-back-squat')).toBe(2);
  });
});

describe('kindBetween', () => {
  it('tabs crossfade, deeper pushes, shallower pops, same depth fades', () => {
    expect(kindBetween('/', '/plans')).toBe('tab');
    expect(kindBetween('/plans', '/plans/x')).toBe('push');
    expect(kindBetween('/plans/x', '/plans')).toBe('pop');
    expect(kindBetween('/workout/s', '/workout/s/a')).toBe('push');
    expect(kindBetween('/workout/s/a', '/workout/s')).toBe('pop');
    expect(kindBetween('/settings', '/plans/x')).toBe('fade');
    expect(kindBetween('/plans', '/plans')).toBe('none');
  });
});

describe('withTransition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('without the View Transitions API it updates at once and marks the fallback kind', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    expect(supportsViewTransitions()).toBe(false);
    const update = vi.fn();
    withTransition('push', update);
    expect(update).toHaveBeenCalledOnce();
    expect(dataset.navFallback).toBe('push');
    withTransition('none', update);
    expect(dataset.navFallback).toBeUndefined();
  });

  it('with the API it runs the update inside a transition of that kind, then clears it', async () => {
    const dataset: Record<string, string> = {};
    let finish!: () => void;
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { finished: new Promise<void>((r) => (finish = r)) };
    });
    vi.stubGlobal('document', {
      documentElement: { dataset },
      startViewTransition,
    });
    const update = vi.fn();
    withTransition('pop', update);
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(dataset.nav).toBe('pop');
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(dataset.nav).toBeUndefined();
  });

  it('a transition skipped by a newer one never leaves an unhandled rejection', async () => {
    const abort = () => Promise.reject(new DOMException('Old view transition aborted by new view transition.', 'AbortError'));
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: abort(),
        updateCallbackDone: abort(),
      };
    });
    vi.stubGlobal('document', {
      documentElement: { dataset: {} },
      startViewTransition,
    });
    withTransition('push', () => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(startViewTransition).toHaveBeenCalledOnce();
  });

  it('kind none never starts a transition', () => {
    const startViewTransition = vi.fn();
    vi.stubGlobal('document', {
      documentElement: { dataset: {} },
      startViewTransition,
    });
    const update = vi.fn();
    withTransition('none', update);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
