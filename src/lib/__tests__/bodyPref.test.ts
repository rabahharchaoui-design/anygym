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

  it('defaults to male, stores the choice either way, notifies subscribers', async () => {
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
    expect(s.m.get(BODY_KEY)).toBe('male');
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

describe('PLAN 3.3: asked once', () => {
  beforeEach(() => vi.resetModules());
  it('no pick yet: one map asks, once; a pick or an earlier ask means never', async () => {
    const s = fakeStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', s);
    const { bodyPref, ASK_KEY } = await import('../bodyPref');
    expect(bodyPref.picked()).toBe(false);
    expect(bodyPref.claimAsk('a')).toBe(true);
    // The same map rendering again keeps it; another map on the screen does not ask too.
    expect(bodyPref.claimAsk('a')).toBe(true);
    expect(bodyPref.claimAsk('b')).toBe(false);
    expect(s.m.get(ASK_KEY)).toBe('1');
    vi.resetModules();
    const again = (await import('../bodyPref')).bodyPref;
    expect(again.claimAsk('c')).toBe(false);
  });
  it('a stored choice is a pick, male too', async () => {
    const s = fakeStorage();
    s.m.set('anygym.muscleBody', 'male');
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', s);
    const { bodyPref } = await import('../bodyPref');
    expect(bodyPref.picked()).toBe(true);
    expect(bodyPref.claimAsk('a')).toBe(false);
  });
});
