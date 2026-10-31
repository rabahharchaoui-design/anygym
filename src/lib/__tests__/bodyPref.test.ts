import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Muscle map body preference (PLAN 2.2a): male by default, female stored, survives a broken storage.
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('bodyPref', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to male, stores female, notifies subscribers, removes the key for male', async () => {
    const s = fakeStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', s);
    const { bodyPref, BODY_KEY } = await import('../bodyPref');
    expect(BODY_KEY).toBe('anygym.muscleBody');
    expect(bodyPref.get()).toBe('male');
    const fn = vi.fn();
    const off = bodyPref.subscribe(fn);
    bodyPref.set('female');
    expect(bodyPref.get()).toBe('female');
    expect(s.m.get(BODY_KEY)).toBe('female');
    expect(fn).toHaveBeenCalledTimes(1);
    bodyPref.set('male');
    expect(s.m.has(BODY_KEY)).toBe(false);
    off();
    bodyPref.set('female');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('reads a stored female choice at start, ignores junk', async () => {
    const s = fakeStorage();
    s.m.set('anygym.muscleBody', 'female');
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', s);
    const { bodyPref } = await import('../bodyPref');
    expect(bodyPref.get()).toBe('female');
    s.m.set('anygym.muscleBody', 'robot');
    bodyPref.reload();
    expect(bodyPref.get()).toBe('male');
  });

  it('works when storage throws (private mode)', async () => {
    const boom = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    const { bodyPref } = await import('../bodyPref');
    expect(bodyPref.get()).toBe('male');
    bodyPref.set('female');
    expect(bodyPref.get()).toBe('female');
  });
});
