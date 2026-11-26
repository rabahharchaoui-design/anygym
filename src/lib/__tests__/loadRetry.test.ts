import { describe, expect, it, vi } from 'vitest';
import { retryLoad, retryWay } from '../loadRetry';

const idle = { workout: false, run: false };

describe('R1 (1): Try again never reloads while a run or a workout is active', () => {
  it('reloads only with signal and nothing active', () => {
    expect(retryWay(true, idle)).toBe('reload');
    expect(retryWay(true, { workout: true, run: false })).toBe('in-place');
    expect(retryWay(true, { workout: false, run: true })).toBe('in-place');
    expect(retryWay(false, idle)).toBe('in-place');
    expect(retryWay(true, null)).toBe('in-place');
  });

  it('a live run keeps the page: the file is asked for again in place', async () => {
    const reload = vi.fn();
    const inPlace = vi.fn();
    await expect(retryLoad(true, async () => ({ workout: false, run: true }), reload, inPlace)).resolves.toBe('in-place');
    expect(reload).not.toHaveBeenCalled();
    expect(inPlace).toHaveBeenCalledOnce();
  });

  it('an active workout keeps the page too', async () => {
    const reload = vi.fn();
    await retryLoad(true, async () => ({ workout: true, run: false }), reload, () => {});
    expect(reload).not.toHaveBeenCalled();
  });

  it('unreadable storage counts as active', async () => {
    const reload = vi.fn();
    await retryLoad(true, () => Promise.reject(new Error('no db')), reload, () => {});
    expect(reload).not.toHaveBeenCalled();
  });

  it('nothing active, with signal: the page loads afresh', async () => {
    const reload = vi.fn();
    const inPlace = vi.fn();
    await retryLoad(true, async () => idle, reload, inPlace);
    expect(reload).toHaveBeenCalledOnce();
    expect(inPlace).not.toHaveBeenCalled();
  });
});
