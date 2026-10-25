// A minimal browser surface for the reporting modules under Node.
import { vi } from 'vitest';

export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

export function stubBrowser(hash = '#/') {
  const win = {
    location: { hash },
    innerWidth: 393,
    innerHeight: 852,
    devicePixelRatio: 3,
    matchMedia: () => ({ matches: true }),
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { userAgent: IPHONE_UA, maxTouchPoints: 5, onLine: true });
  return win;
}
