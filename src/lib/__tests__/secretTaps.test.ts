import { describe, expect, it } from 'vitest';
import { registerTap, SECRET_TAPS, SECRET_WINDOW_MS } from '../secretTaps';

const tapAll = (times: number[]) => {
  let taps: number[] = [];
  const fired: boolean[] = [];
  for (const t of times) {
    const r = registerTap(taps, t);
    taps = r.taps;
    fired.push(r.fired);
  }
  return fired;
};

describe('registerTap', () => {
  it('fires on the 7th tap within 3 s and then starts over', () => {
    const fired = tapAll([0, 300, 600, 900, 1200, 1500, 1800, 2100]);
    expect(fired).toEqual([false, false, false, false, false, false, true, false]);
    expect(SECRET_TAPS).toBe(7);
  });

  it('does not fire when the taps are spread over more than 3 s', () => {
    const step = SECRET_WINDOW_MS / 6; // 7 taps span exactly 3 s, the first one falls out
    expect(tapAll([0, 1, 2, 3, 4, 5, 6].map((i) => i * step)).includes(true)).toBe(false);
  });

  it('drops old taps and counts only the recent ones', () => {
    const fired = tapAll([0, 100, 5000, 5100, 5200, 5300, 5400, 5500, 5600]);
    expect(fired.indexOf(true)).toBe(8);
  });
});
