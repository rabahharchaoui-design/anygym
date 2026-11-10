import { describe, expect, it } from 'vitest';
import { statusBarFloor, type ScreenState } from '../statusBarFloor';

const base = (o: Partial<ScreenState>): ScreenState => ({ standalone: true, iphone: true, screenWidth: 393, screenHeight: 852, innerWidth: 393, innerHeight: 852, envTop: 0, envBottom: 0, ...o });

describe('statusBarFloor (tester 3.5h)', () => {
  it('every Dynamic Island size with env 0 in standalone gets a non zero top floor', () => {
    for (const h of [852, 874, 932, 956]) {
      const w = Math.round(h * 0.46);
      expect(statusBarFloor(base({ screenWidth: w, screenHeight: h, innerWidth: w, innerHeight: h }))!.top).toBeGreaterThanOrEqual(59);
    }
  });
  it('a correct env value is never doubled: any env top above 0 gives no floor', () => {
    expect(statusBarFloor(base({ envTop: 59, envBottom: 34 }))).toBeNull();
    expect(statusBarFloor(base({ envTop: 1 }))).toBeNull();
  });
  it('browser tab, Android, iPad, landscape and zero or huge sizes give no floor', () => {
    expect(statusBarFloor(base({ standalone: false }))).toBeNull();
    expect(statusBarFloor(base({ iphone: false }))).toBeNull();
    expect(statusBarFloor(base({ screenWidth: 0, screenHeight: 0, innerWidth: 0, innerHeight: 0 }))).toBeNull();
    expect(statusBarFloor(base({ innerHeight: 800 }))).toBeNull(); // Safari-like chrome: page shorter than screen
  });
});
