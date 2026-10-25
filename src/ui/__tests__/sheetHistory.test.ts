import { describe, expect, it, vi } from 'vitest';
import { createSheetHistory } from '../sheetHistory';

// Sheets and Back (SPEC 13.4): a fake history with real back/popstate ordering (popstate is async).

function fakeEnv() {
  const entries: unknown[] = [{ idx: 0, key: 'base' }];
  let at = 0;
  const pop: Array<() => void> = [];
  const timers: Array<() => void> = [];
  const tasks: Array<() => void> = [];
  const history = {
    get state() {
      return entries[at];
    },
    pushState(data: unknown) {
      entries.splice(at + 1);
      entries.push(data);
      at++;
    },
    back() {
      tasks.push(() => {
        if (at === 0) return;
        at--;
        for (const fn of pop) fn();
      });
    },
  };
  const win = {
    addEventListener: (_: 'popstate', fn: () => void) => void pop.push(fn),
    setTimeout: (fn: () => void) => timers.push(fn),
  };
  /** Runs queued history traversals (the browser does this in a later task). */
  const run = () => {
    while (tasks.length) tasks.shift()!();
  };
  /** The user presses Back. */
  const pressBack = () => {
    history.back();
    run();
  };
  return {
    history,
    win,
    run,
    pressBack,
    timers,
    get length() {
      return entries.length;
    },
    get at() {
      return at;
    },
  };
}

describe('sheet history', () => {
  it('Back closes only the top sheet of a nested stack, then the next one', () => {
    const env = fakeEnv();
    const h = createSheetHistory(env.history, env.win);
    const closeA = vi.fn();
    const closeB = vi.fn();
    const releaseA = h.open(closeA);
    const releaseB = h.open(closeB);
    expect(env.at).toBe(2);
    expect((env.history.state as Record<string, unknown>).key).toBe('base'); // the router's state kept
    env.pressBack();
    expect(closeB).toHaveBeenCalledOnce();
    expect(closeA).not.toHaveBeenCalled();
    releaseB(); // the sheet unmounts after closing: no extra step back
    env.run();
    expect(env.at).toBe(1);
    env.pressBack();
    expect(closeA).toHaveBeenCalledOnce();
    releaseA();
    env.run();
    expect(env.at).toBe(0);
  });

  it('a sheet closed by hand uses up its entry without leaving the route', () => {
    const env = fakeEnv();
    const h = createSheetHistory(env.history, env.win);
    const close = vi.fn();
    const release = h.open(close);
    expect(env.at).toBe(1);
    release();
    env.run();
    expect(env.at).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });

  it('navigation and a new sheet wait for the step back, so they are never undone by it', () => {
    const env = fakeEnv();
    const h = createSheetHistory(env.history, env.win);
    const release = h.open(() => undefined);
    release(); // step back in flight
    const nav = vi.fn(() => env.history.pushState({ route: 'next' }));
    h.whenSettled(nav);
    const next = h.open(() => undefined);
    expect(nav).not.toHaveBeenCalled();
    expect(env.at).toBe(1); // nothing pushed yet
    env.run();
    expect(nav).toHaveBeenCalledOnce();
    expect(env.at).toBe(2);
    expect((env.history.state as Record<string, unknown>).anygymSheet).toBeTruthy();
    next();
    env.run();
    expect((env.history.state as Record<string, unknown>).route).toBe('next');
  });

  it('a sheet that closes because the app navigated away leaves history alone', () => {
    const env = fakeEnv();
    const h = createSheetHistory(env.history, env.win);
    const release = h.open(() => undefined);
    env.history.pushState({ route: 'settings' });
    release();
    env.run();
    expect(env.at).toBe(2);
    expect(h.whenSettled).toBeTypeOf('function');
    const fn = vi.fn();
    h.whenSettled(fn);
    expect(fn).toHaveBeenCalledOnce(); // nothing in flight
  });

  it('Back with no sheet open closes nothing; a lost popstate does not block navigation for long', () => {
    const env = fakeEnv();
    const h = createSheetHistory(env.history, env.win);
    env.history.pushState({ route: 'plans' });
    env.pressBack();
    expect(h.depth()).toBe(0);
    const release = h.open(() => undefined);
    release();
    const fn = vi.fn();
    h.whenSettled(fn);
    expect(fn).not.toHaveBeenCalled();
    env.timers.forEach((t) => t()); // the timeout carries on even if popstate never came
    expect(fn).toHaveBeenCalledOnce();
  });

  it('a sheet opened and closed while a step back is in flight never gets an entry', () => {
    const env = fakeEnv();
    const h = createSheetHistory(env.history, env.win);
    h.open(() => undefined)();
    const quick = h.open(() => undefined);
    quick();
    env.run();
    expect(env.at).toBe(0);
    expect(env.length).toBe(2);
  });
});
