import { describe, expect, it, vi } from 'vitest';
import { applyUpdate, isUpdateReady, onUpdateReady, setUpdateReady, shouldApplyUpdateNow } from '../pwaUpdate';

describe('shouldApplyUpdateNow', () => {
  it('applies only when no workout and no run is active', () => {
    expect(shouldApplyUpdateNow(false, false)).toBe(true);
    expect(shouldApplyUpdateNow(true, false)).toBe(false);
    expect(shouldApplyUpdateNow(false, true)).toBe(false);
    expect(shouldApplyUpdateNow(true, true)).toBe(false);
  });
});

describe('deferred update', () => {
  it('holds the update, tells listeners, applies on tap', () => {
    const listener = vi.fn();
    const off = onUpdateReady(listener);
    expect(isUpdateReady()).toBe(false);
    applyUpdate(); // nothing waiting: no op
    const apply = vi.fn();
    setUpdateReady(apply);
    expect(isUpdateReady()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(true);
    applyUpdate();
    expect(apply).toHaveBeenCalledOnce();
    off();
    setUpdateReady(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(false);
  });
});
