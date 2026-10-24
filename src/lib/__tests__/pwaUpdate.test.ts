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
  it('holds the update, tells listeners, applies on tap', async () => {
    const listener = vi.fn();
    const off = onUpdateReady(listener);
    expect(isUpdateReady()).toBe(false);
    void applyUpdate(); // nothing waiting: no op
    const apply = vi.fn();
    setUpdateReady(apply);
    expect(isUpdateReady()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(true);
    await applyUpdate();
    expect(apply).toHaveBeenCalledOnce();
    off();
    setUpdateReady(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(false);
  });
});

describe('Update ready rechecks right before reloading (PLAN 1.10c fix 8)', () => {
  it('a workout started after the chip appeared keeps the update waiting', async () => {
    const apply = vi.fn();
    let active = { workout: true, run: false };
    setUpdateReady(apply, async () => active);
    expect(await applyUpdate()).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(isUpdateReady()).toBe(true);
    active = { workout: false, run: true };
    expect(await applyUpdate()).toBe(false);
    active = { workout: false, run: false };
    expect(await applyUpdate()).toBe(true);
    expect(apply).toHaveBeenCalledOnce();
    setUpdateReady(null);
  });

  it('an unreadable state counts as active', async () => {
    const apply = vi.fn();
    setUpdateReady(apply, () => Promise.reject(new Error('db')));
    expect(await applyUpdate()).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    setUpdateReady(null);
    expect(await applyUpdate()).toBe(false);
  });
});
