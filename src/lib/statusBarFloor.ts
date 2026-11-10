// PLAN 3.5h: a floor under the safe area insets for iPhone Home Screen apps.
//
// With viewport-fit=cover and the black-translucent status bar, the page is drawn under the status
// bar and the Dynamic Island, and env(safe-area-inset-top) says how far down to start. Some iOS 26
// builds report 0 there while the page is still drawn under the status bar (WebKit bugs 300523,
// 301994), which puts every header under the clock and the island (G's iPhone 17 Pro Max, Nov 11).
// When that happens the insets are taken from the iPhone's screen size instead. When the reported
// insets are non zero, or the page is not drawn under the status bar, nothing changes.

export type Floor = { top: number; bottom: number };

export type ScreenState = {
  /** A Home Screen app (display-mode standalone or navigator.standalone). */
  standalone: boolean;
  /** An iPhone (or iPod touch): only iOS draws a Home Screen app under the status bar. */
  iphone: boolean;
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
  /** What env(safe-area-inset-top/bottom) reports. */
  envTop: number;
  envBottom: number;
};

/**
 * Portrait screen height (CSS px) → [status bar inset, home indicator inset]. iPhone SE and the
 * Plus phones with a home button: 20 and 0. Face ID phones: 44 to 50 (notch), 59 to 62 (Dynamic
 * Island), 34 at the bottom.
 */
const BY_HEIGHT: Record<number, [number, number]> = {
  667: [20, 0], // SE 2nd and 3rd gen, 6, 7, 8
  736: [20, 0], // 6 to 8 Plus
  812: [50, 34], // X, XS, 11 Pro, 12 and 13 mini (the minis are 50, the others 44)
  844: [47, 34], // 12, 13, 14, 16e
  852: [59, 34], // 14 Pro, 15, 15 Pro, 16
  874: [62, 34], // 16 Pro, 17, 17 Pro
  896: [48, 34], // XR, 11, XS Max, 11 Pro Max
  912: [62, 34], // Air
  926: [47, 34], // 12 and 13 Pro Max, 14 Plus
  932: [59, 34], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  956: [62, 34], // 16 Pro Max, 17 Pro Max
};

/** The insets for an iPhone of this portrait height (an unknown tall phone: the largest known). */
export function iphoneInsets(height: number): Floor {
  const known = BY_HEIGHT[height];
  if (known) return { top: known[0], bottom: known[1] };
  if (height >= 852) return { top: 62, bottom: 34 };
  if (height >= 812) return { top: 50, bottom: 34 };
  return { top: 20, bottom: 0 };
}

/**
 * The floor to put under the reported insets, or null when the reported ones can be trusted: not a
 * Home Screen app on an iPhone, landscape (the landscape guard covers it), the page not drawn under
 * the status bar (its height is less than the screen's), or env() already reports a top inset.
 */
export function statusBarFloor(s: ScreenState): Floor | null {
  if (!s.standalone || !s.iphone) return null;
  if (s.innerHeight <= s.innerWidth) return null;
  const portraitHeight = Math.max(s.screenWidth, s.screenHeight);
  if (s.innerHeight < portraitHeight - 1) return null;
  if (s.envTop > 0) return null;
  const want = iphoneInsets(portraitHeight);
  return { top: want.top, bottom: s.envBottom > 0 ? 0 : want.bottom };
}
