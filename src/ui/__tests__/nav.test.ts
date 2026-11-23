import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginStep, depthOf, kindBetween, supportsViewTransitions, withTransition } from '../nav';

describe('depthOf (PLAN 1.7e)', () => {
  it('tab roots are depth 0', () => {
    for (const p of ['/', '/run', '/history', '/plans', '/plans/', '/settings']) expect(depthOf(p)).toBe(0);
  });
  it('pushed screens are deeper', () => {
    // PLAN M14: Settings is the You tab; its sub screens push one level per segment.
    expect(depthOf('/settings/gyms')).toBe(1);
    expect(depthOf('/settings/gyms/g1')).toBe(2);
    expect(depthOf('/settings/gyms/g1/equipment')).toBe(3);
    expect(kindBetween('/settings', '/settings/gyms')).toBe('push');
    expect(depthOf('/plans/five-day-split')).toBe(1);
    expect(depthOf('/history/abc')).toBe(1);
    expect(depthOf('/dev/viewport')).toBe(1);
    expect(depthOf('/workout/s1')).toBe(1);
    expect(depthOf('/workout/s1/done')).toBe(1);
    expect(depthOf('/workout/s1/barbell-back-squat')).toBe(2);
    // PLAN 3.1: a place's list, then a plan opened from it.
    expect(depthOf('/plans/place/full')).toBe(1);
    expect(depthOf('/plans/place/full/five-day-split')).toBe(2);
    expect(kindBetween('/plans/place/full', '/plans/place/full/five-day-split')).toBe('push');
  });
});

describe('kindBetween', () => {
  it('tabs crossfade, deeper pushes, shallower pops, same depth fades', () => {
    expect(kindBetween('/', '/plans')).toBe('tab');
    expect(kindBetween('/plans', '/plans/x')).toBe('push');
    expect(kindBetween('/plans/x', '/plans')).toBe('pop');
    expect(kindBetween('/workout/s', '/workout/s/a')).toBe('push');
    expect(kindBetween('/workout/s/a', '/workout/s')).toBe('pop');
    expect(kindBetween('/settings/gyms', '/plans/x')).toBe('fade');
    expect(kindBetween('/plans', '/settings')).toBe('tab');
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

describe('beginStep (PLAN 4.4a)', () => {
  afterEach(() => vi.useRealTimers());
  const win = () => Object.assign(new EventTarget(), { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) }) as unknown as Window;
  it('a second history step asked for before the first has landed is dropped, and the next one after is not', () => {
    vi.useFakeTimers();
    const w = win();
    expect(beginStep(w)).toBe(true);
    // Back tapped again, or the "Nice" chip returning, before the list is drawn: the same intent.
    expect(beginStep(w)).toBe(false);
    w.dispatchEvent(new Event('popstate'));
    expect(beginStep(w)).toBe(false); // the app's own popstate work runs first
    vi.advanceTimersByTime(0);
    expect(beginStep(w)).toBe(true);
    vi.advanceTimersByTime(1000);
  });
  it('a step whose popstate never comes stops counting as on its way', () => {
    vi.useFakeTimers();
    const w = win();
    expect(beginStep(w)).toBe(true);
    vi.advanceTimersByTime(700);
    expect(beginStep(w)).toBe(true);
    vi.advanceTimersByTime(1000);
  });
});
