import { statusBarFloor } from '../lib/statusBarFloor';

// PLAN 3.5h: the app reads the safe areas only through --safe-top/-bottom/-left/-right
// (styles/tokens.css). Those are env(safe-area-inset-*), raised to --safe-top-floor and
// --safe-bottom-floor, which this sets when the phone reports no top inset while the page is drawn
// under the status bar (lib/statusBarFloor.ts). Tests set --safe-* themselves (tests/helpers/layout.ts).

export type Insets = { top: number; right: number; bottom: number; left: number };

const px = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** env(safe-area-inset-*) can only be read through a probe element's computed padding. */
export function readSafeAreaInsets(doc: Document = document): Insets {
  const probe = doc.createElement('div');
  Object.assign(probe.style, {
    position: 'fixed', top: '0', left: '0', width: '0', height: '0', visibility: 'hidden', pointerEvents: 'none',
    padding: 'env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)',
  }); // not cssText: the CSP (PLAN 2.2f)
  doc.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return insets;
}

const isIphone = (nav: Navigator) => /iPhone|iPod/.test(nav.userAgent);

/** Sets (or clears) the floors now, and again whenever the screen changes size or turns. */
export function installSafeAreaFloor(win: Window = window): () => void {
  const doc = win.document;
  const apply = () => {
    if (!doc.body) return;
    const env = readSafeAreaInsets(doc);
    const nav = win.navigator as Navigator & { standalone?: boolean };
    const floor = statusBarFloor({
      standalone: win.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true,
      iphone: isIphone(nav),
      screenWidth: win.screen.width,
      screenHeight: win.screen.height,
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight,
      envTop: env.top,
      envBottom: env.bottom,
    });
    const s = doc.documentElement.style;
    if (floor) {
      s.setProperty('--safe-top-floor', `${floor.top}px`);
      s.setProperty('--safe-bottom-floor', `${floor.bottom}px`);
    } else {
      s.removeProperty('--safe-top-floor');
      s.removeProperty('--safe-bottom-floor');
    }
  };
  apply();
  win.addEventListener('resize', apply);
  win.addEventListener('orientationchange', apply);
  return () => {
    win.removeEventListener('resize', apply);
    win.removeEventListener('orientationchange', apply);
  };
}
