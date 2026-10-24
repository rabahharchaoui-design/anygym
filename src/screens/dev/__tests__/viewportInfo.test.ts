import { describe, expect, it } from 'vitest';
import { formatViewportInfo, viewportRows, type ViewportInfo } from '../viewportInfo';

const base: ViewportInfo = {
  innerHeight: 956,
  innerWidth: 440,
  outerHeight: 956,
  visualHeight: 956,
  visualOffsetTop: 0,
  screenHeight: 956,
  screenWidth: 440,
  dpr: 3,
  insets: { top: 62, right: 0, bottom: 34, left: 0 },
  standaloneMedia: true,
  navigatorStandalone: true,
  shell: { top: 0, bottom: 956, height: 956, width: 440 },
  tabBar: { top: 857, bottom: 956, height: 99, width: 440 },
  userAgent: 'UA',
};

describe('viewport diagnostics', () => {
  it('prints every measurement in a fixed order', () => {
    expect(viewportRows(base).map(([k]) => k)).toEqual([
      'Display mode',
      'navigator.standalone',
      'innerHeight',
      'innerWidth',
      'outerHeight',
      'visualViewport height',
      'visualViewport offsetTop',
      'screen',
      'devicePixelRatio',
      'safe area top',
      'safe area right',
      'safe area bottom',
      'safe area left',
      'shell',
      'tab bar',
      'tab bar gap to bottom',
      'user agent',
    ]);
  });

  it('formats as copyable text', () => {
    const text = formatViewportInfo(base);
    expect(text).toContain('Display mode: standalone (Home Screen app)');
    expect(text).toContain('screen: 440 × 956');
    expect(text).toContain('safe area bottom: 34');
    expect(text).toContain('tab bar: top 857 · bottom 956 · height 99 · width 440');
    expect(text).toContain('tab bar gap to bottom: 0');
    expect(text.split('\n')).toHaveLength(17);
  });

  it('is honest about values it could not read', () => {
    const text = formatViewportInfo({
      ...base,
      standaloneMedia: false,
      navigatorStandalone: null,
      visualHeight: null,
      visualOffsetTop: null,
      shell: null,
      tabBar: null,
      innerHeight: 800.333,
    });
    expect(text).toContain('Display mode: browser');
    expect(text).toContain('navigator.standalone: n/a');
    expect(text).toContain('visualViewport height: n/a');
    expect(text).toContain('shell: not on screen');
    expect(text).toContain('tab bar gap to bottom: n/a');
    expect(text).toContain('innerHeight: 800.33');
  });
});
