import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 3.6x: Sheet and DemoViewer each wrote out the same "top sheet" effects (register on the sheet
// stack, own a Back entry, move focus in, give it back, Escape closes the top one). No DOM in this
// suite: the effects run at once, their cleanups are kept, and the stack and history are stand ins.
const cleanups: Array<() => void> = [];
const runEffect = (effect: () => (() => void) | void) => {
  const c = effect();
  if (c) cleanups.push(c);
};
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useEffect: runEffect, useLayoutEffect: runEffect }));

const log: string[] = [];
let top: unknown = null;
vi.mock('../sheetStack', () => ({
  pushSheet: (root: unknown) => {
    log.push('push');
    top = root;
    return () => {
      log.push('unregister');
      top = null;
    };
  },
  isTopSheet: (root: unknown) => top === root,
}));
let onBack: (() => void) | null = null;
vi.mock('../sheetHistory', () => ({
  sheetHistory: () => ({
    open: (close: () => void) => {
      log.push('history');
      onBack = close;
      return () => log.push('release');
    },
  }),
}));

const { useSheetLayer } = await import('../useSheetLayer');

class FakeElement {
  focused = 0;
  isConnected = true;
  inert = false;
  focus = () => void this.focused++;
  closest = (sel: string) => (sel === '[inert]' && this.inert ? this : null);
}

let keydown: ((e: { key: string; stopPropagation: () => void }) => void) | null = null;
beforeEach(() => {
  log.length = 0;
  cleanups.length = 0;
  top = null;
  onBack = null;
  keydown = null;
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('window', {
    addEventListener: (_: string, fn: typeof keydown) => (keydown = fn),
    removeEventListener: () => (keydown = null),
  });
});
afterEach(() => vi.unstubAllGlobals());

const setup = (present = true) => {
  const before = new FakeElement();
  vi.stubGlobal('document', { activeElement: before });
  const root = new FakeElement() as unknown as HTMLElement;
  const close = vi.fn();
  const focusIn = vi.fn();
  useSheetLayer(present, { current: root }, { current: close }, focusIn);
  return { before, root, close, focusIn };
};

describe('useSheetLayer', () => {
  it('present: registers, takes a Back entry, then moves focus in, in that order', () => {
    const { root, focusIn } = setup();
    expect(log).toEqual(['push', 'history']);
    expect(focusIn).toHaveBeenCalledWith(root);
  });

  it('Back and Escape (while on top) close it; Escape under another sheet does nothing', () => {
    const { close } = setup();
    onBack!();
    expect(close).toHaveBeenCalledTimes(1);
    const stop = vi.fn();
    keydown!({ key: 'Escape', stopPropagation: stop });
    expect(close).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalled();
    keydown!({ key: 'Enter', stopPropagation: stop });
    expect(close).toHaveBeenCalledTimes(2);
    top = {};
    keydown!({ key: 'Escape', stopPropagation: stop });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('closing: unregisters, releases the entry and gives focus back', () => {
    const { before } = setup();
    for (const c of cleanups) c();
    expect(log).toEqual(['push', 'history', 'unregister', 'release']);
    expect(before.focused).toBe(1);
    expect(keydown).toBeNull();
  });

  it('focus is not given back to something gone or now inert', () => {
    const { before } = setup();
    before.inert = true;
    for (const c of cleanups) c();
    expect(before.focused).toBe(0);
  });

  it('while sliding away (not present) it does not register again', () => {
    const { focusIn } = setup(false);
    expect(log).toEqual([]);
    expect(focusIn).not.toHaveBeenCalled();
  });
});
