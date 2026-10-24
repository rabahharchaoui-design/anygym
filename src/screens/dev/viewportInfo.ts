// PLAN 1.10b: viewport diagnostics for #/dev/viewport. Reads what the phone reports about
// its own screen so a real Home Screen screenshot can settle any full screen layout question.

export type Rect = { top: number; bottom: number; height: number; width: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

export type ViewportInfo = {
  innerHeight: number;
  innerWidth: number;
  outerHeight: number;
  visualHeight: number | null;
  visualOffsetTop: number | null;
  screenHeight: number;
  screenWidth: number;
  dpr: number;
  insets: Insets;
  standaloneMedia: boolean;
  navigatorStandalone: boolean | null;
  shell: Rect | null;
  tabBar: Rect | null;
  userAgent: string;
};

const px = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** env(safe-area-inset-*) can only be read through a probe element's computed padding. */
export function readSafeAreaInsets(doc: Document = document): Insets {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
  doc.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
  probe.remove();
  return insets;
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
};

export function collectViewportInfo(win: Window = window, doc: Document = document): ViewportInfo {
  const vv = win.visualViewport;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return {
    innerHeight: win.innerHeight,
    innerWidth: win.innerWidth,
    outerHeight: win.outerHeight,
    visualHeight: vv ? vv.height : null,
    visualOffsetTop: vv ? vv.offsetTop : null,
    screenHeight: win.screen.height,
    screenWidth: win.screen.width,
    dpr: win.devicePixelRatio,
    insets: readSafeAreaInsets(doc),
    standaloneMedia: win.matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: typeof nav.standalone === 'boolean' ? nav.standalone : null,
    shell: rectOf(doc.querySelector('[data-shell]')),
    tabBar: rectOf(doc.querySelector('nav[aria-label="Main"]')),
    userAgent: nav.userAgent,
  };
}

const n = (v: number | null): string => (v === null ? 'n/a' : String(Math.round(v * 100) / 100));
const rect = (r: Rect | null): string =>
  r ? `top ${n(r.top)} · bottom ${n(r.bottom)} · height ${n(r.height)} · width ${n(r.width)}` : 'not on screen';

/** Label and value rows, in the order shown on screen and copied as text. */
export function viewportRows(i: ViewportInfo): Array<[string, string]> {
  return [
    ['Display mode', i.standaloneMedia ? 'standalone (Home Screen app)' : 'browser'],
    ['navigator.standalone', i.navigatorStandalone === null ? 'n/a' : String(i.navigatorStandalone)],
    ['innerHeight', n(i.innerHeight)],
    ['innerWidth', n(i.innerWidth)],
    ['outerHeight', n(i.outerHeight)],
    ['visualViewport height', n(i.visualHeight)],
    ['visualViewport offsetTop', n(i.visualOffsetTop)],
    ['screen', `${n(i.screenWidth)} × ${n(i.screenHeight)}`],
    ['devicePixelRatio', n(i.dpr)],
    ['safe area top', n(i.insets.top)],
    ['safe area right', n(i.insets.right)],
    ['safe area bottom', n(i.insets.bottom)],
    ['safe area left', n(i.insets.left)],
    ['shell', rect(i.shell)],
    ['tab bar', rect(i.tabBar)],
    ['tab bar gap to bottom', i.tabBar ? n(i.innerHeight - i.tabBar.bottom) : 'n/a'],
    ['user agent', i.userAgent],
  ];
}

export const formatViewportInfo = (i: ViewportInfo): string =>
  viewportRows(i)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
