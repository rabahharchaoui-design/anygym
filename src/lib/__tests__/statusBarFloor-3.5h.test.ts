import { describe, expect, it } from 'vitest';
import { iphoneInsets, statusBarFloor, type ScreenState } from '../statusBarFloor';

// PLAN 3.5h: a Home Screen app on an iPhone that reports no top inset while drawn under the status
// bar gets the phone's real insets; every other case keeps what env() reports.

const promax = (over: Partial<ScreenState> = {}): ScreenState => ({
  standalone: true,
  iphone: true,
  screenWidth: 440,
  screenHeight: 956,
  innerWidth: 440,
  innerHeight: 956,
  envTop: 0,
  envBottom: 0,
  ...over,
});

describe('statusBarFloor', () => {
  it('17 Pro Max drawn under the status bar with env() at 0: 62 top, 34 bottom', () => {
    expect(statusBarFloor(promax())).toEqual({ top: 62, bottom: 34 });
  });

  it('a reported top inset is trusted (no floor)', () => {
    expect(statusBarFloor(promax({ envTop: 62, envBottom: 34 }))).toBeNull();
  });

  it('a reported bottom inset is kept, only the top gets a floor', () => {
    expect(statusBarFloor(promax({ envBottom: 34 }))).toEqual({ top: 62, bottom: 0 });
  });

  it('not drawn under the status bar (the page is shorter than the screen): no floor', () => {
    expect(statusBarFloor(promax({ innerHeight: 894 }))).toBeNull();
  });

  it('Safari tabs, Android and landscape: no floor', () => {
    expect(statusBarFloor(promax({ standalone: false }))).toBeNull();
    expect(statusBarFloor(promax({ iphone: false }))).toBeNull();
    expect(statusBarFloor(promax({ innerWidth: 956, innerHeight: 440 }))).toBeNull();
  });

  it('the screen size names the phone, whichever way screen.* reports it', () => {
    expect(statusBarFloor(promax({ screenWidth: 393, screenHeight: 852, innerWidth: 393, innerHeight: 852 }))).toEqual({ top: 59, bottom: 34 });
    expect(statusBarFloor(promax({ screenWidth: 667, screenHeight: 375, innerWidth: 375, innerHeight: 667 }))).toEqual({ top: 20, bottom: 0 });
  });
});

describe('iphoneInsets', () => {
  it('known phones', () => {
    expect(iphoneInsets(956)).toEqual({ top: 62, bottom: 34 });
    expect(iphoneInsets(874)).toEqual({ top: 62, bottom: 34 });
    expect(iphoneInsets(852)).toEqual({ top: 59, bottom: 34 });
    expect(iphoneInsets(844)).toEqual({ top: 47, bottom: 34 });
    expect(iphoneInsets(667)).toEqual({ top: 20, bottom: 0 });
  });

  it('an unknown phone gets the largest inset of its class (never too little)', () => {
    expect(iphoneInsets(1000)).toEqual({ top: 62, bottom: 34 });
    expect(iphoneInsets(820)).toEqual({ top: 50, bottom: 34 });
    expect(iphoneInsets(700)).toEqual({ top: 20, bottom: 0 });
  });
});
