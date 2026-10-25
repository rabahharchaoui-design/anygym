import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Haptics (SPEC 23.2): default on, a setting turns it off, Android vibrates 8 ms, iPhone toggles a
// hidden native switch, automated browsers skip the switch.

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function fakeDocument() {
  const clicks: string[] = [];
  const appended: unknown[] = [];
  const make = (tag: string) => {
    const el: Record<string, unknown> = {
      tag,
      style: {},
      attrs: {} as Record<string, string>,
      children: [] as unknown[],
      setAttribute(k: string, v: string) {
        (el.attrs as Record<string, string>)[k] = v;
      },
      appendChild(c: unknown) {
        (el.children as unknown[]).push(c);
      },
      click() {
        clicks.push(tag);
      },
      remove() {
        appended.splice(appended.indexOf(el), 1);
      },
    };
    return el;
  };
  return {
    clicks,
    appended,
    doc: {
      createElement: make,
      body: { appendChild: (e: unknown) => appended.push(e) },
    },
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('haptics', () => {
  it('is on by default and remembers off', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage);
    const { haptics } = await import('../haptics');
    expect(haptics.enabled()).toBe(true);
    const seen = vi.fn();
    const stop = haptics.subscribe(seen);
    haptics.setEnabled(false);
    expect(seen).toHaveBeenCalledOnce();
    expect(storage.getItem('anygym.haptics')).toBe('off');
    stop();
    vi.resetModules();
    const again = await import('../haptics');
    expect(again.haptics.enabled()).toBe(false);
    again.haptics.setEnabled(true);
    expect(storage.getItem('anygym.haptics')).toBeNull();
  });

  it('vibrates 8 ms where the vibrate API exists, nothing when off', async () => {
    const vibrate = vi.fn();
    const f = fakeDocument();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('document', f.doc);
    vi.stubGlobal('navigator', { vibrate });
    const { haptics, tick } = await import('../haptics');
    tick();
    expect(vibrate).toHaveBeenCalledWith(8);
    haptics.setEnabled(false);
    tick();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(f.clicks).toEqual([]);
  });

  it('on iPhone toggles a throwaway hidden switch through its label, and skips it under automation', async () => {
    const f = fakeDocument();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('document', f.doc);
    vi.stubGlobal('navigator', { webdriver: false });
    const { tick } = await import('../haptics');
    tick();
    expect(f.clicks).toEqual(['label']);
    expect(f.appended).toEqual([]); // removed again
    vi.stubGlobal('navigator', { webdriver: true });
    tick();
    expect(f.clicks).toEqual(['label']);
  });

  it('the rest over buzz plays its pattern, one switch tick on iPhone, and nothing when Haptics is off', async () => {
    const vibrate = vi.fn();
    const f = fakeDocument();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('document', f.doc);
    vi.stubGlobal('navigator', { vibrate });
    const { haptics, buzz } = await import('../haptics');
    buzz([120, 80, 120]);
    expect(vibrate).toHaveBeenCalledWith([120, 80, 120]);
    haptics.setEnabled(false);
    buzz();
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.stubGlobal('navigator', { webdriver: false });
    buzz();
    expect(f.clicks).toEqual([]);
    haptics.setEnabled(true);
    buzz();
    expect(f.clicks).toEqual(['label']);
    vi.stubGlobal('navigator', { webdriver: true });
    buzz();
    expect(f.clicks).toEqual(['label']);
  });

  it('a failing storage still works for this visit', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    const { haptics } = await import('../haptics');
    expect(haptics.enabled()).toBe(true);
    haptics.setEnabled(false);
    expect(haptics.enabled()).toBe(false);
  });
});
