import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';
import type { ToastMessage } from '../Toast';
import { UNDO_MS } from '../../lib/undoQueue';

// No DOM in this suite: useEffect runs its effect at once and keeps the cleanup, so the hook's
// timer can be driven with fake timers.
let cleanup: (() => void) | void;
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => (() => void) | void) => {
    cleanup = effect();
  },
}));

const { TOAST_MS, toastLife, useToastTimeout } = await import('../useToastTimeout');

// 3.6x: the same "clear this toast after 5 s with an action, else 3 s" effect was written out in
// TodayScreen, RunScreen, SettingsScreen, GymsScreen, GymDetail, GymEquipment, PlanViewer,
// useWorkoutToast and the quick deck's notice. The old copy is replayed next to the shared hook.
function oldCopy(toast: ToastMessage | null, setToast: (a: SetStateAction<ToastMessage | null>) => void, ms: (t: ToastMessage) => number) {
  if (!toast) return;
  const t = setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), ms(toast));
  return () => clearTimeout(t);
}

/** A tiny state cell standing in for useState. */
function cell(start: ToastMessage | null) {
  let value = start;
  const set = (a: SetStateAction<ToastMessage | null>) => {
    value = typeof a === 'function' ? a(value) : a;
  };
  return { get: () => value, set };
}

const plain: ToastMessage = { id: 1, text: 'Saved' };
const undo: ToastMessage = { id: 2, text: 'Removed', action: { label: 'Undo', onPress: () => undefined } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup = undefined;
});

describe('toastLife', () => {
  it('5 s with an action, 3 s without (the 5000 : 3000 every old copy used)', () => {
    expect(UNDO_MS).toBe(5000);
    expect(TOAST_MS).toBe(3000);
    expect(toastLife(undo)).toBe(5000);
    expect(toastLife(plain)).toBe(3000);
  });
});

describe('useToastTimeout', () => {
  const lives: Array<[string, ToastMessage, ((t: ToastMessage) => number) | undefined, number]> = [
    ['plain message, default life', plain, undefined, 3000],
    ['Undo toast, default life', undo, undefined, 5000],
    ['plain message, Settings life (always UNDO_MS)', plain, () => UNDO_MS, 5000],
    ['Undo toast, Settings life', undo, () => UNDO_MS, 5000],
  ];

  it.each(lives)('%s: cleared at the same moment as the old copy', (_, toast, life, ms) => {
    const shared = cell(toast);
    const old = cell(toast);
    useToastTimeout(toast, shared.set, life);
    oldCopy(toast, old.set, life ?? ((t) => (t.action ? 5000 : 3000)));
    vi.advanceTimersByTime(ms - 1);
    expect(shared.get()).toBe(toast);
    expect(old.get()).toBe(toast);
    vi.advanceTimersByTime(1);
    expect(shared.get()).toBeNull();
    expect(old.get()).toBeNull();
  });

  it('never clears a newer toast that replaced it', () => {
    const state = cell(plain);
    useToastTimeout(plain, state.set);
    const newer: ToastMessage = { id: 3, text: 'Newer' };
    state.set(newer);
    vi.advanceTimersByTime(3000);
    expect(state.get()).toBe(newer);
  });

  it('no toast: no timer; the cleanup stops a pending one', () => {
    const state = cell(null);
    useToastTimeout(null, state.set);
    expect(cleanup).toBeUndefined();
    const live = cell(plain);
    useToastTimeout(plain, live.set);
    (cleanup as () => void)();
    vi.advanceTimersByTime(10_000);
    expect(live.get()).toBe(plain);
  });
});
