// Haptics (SPEC 23.2): a tiny tick on set check, plate add, wheel detents and tab switch.
// iPhone Safari 18+ has no vibrate API, but toggling a native switch input gives a system tick,
// so a hidden one is toggled for every tick. Android uses navigator.vibrate(8).
// The Settings toggle "Haptics" turns it off (default on), stored on this phone only.

const KEY = 'anygym.haptics';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = typeof window === 'undefined' ? true : read();

export const haptics = {
  enabled: (): boolean => enabled,
  setEnabled(on: boolean): void {
    enabled = on;
    try {
      if (on) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, 'off');
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    for (const l of listeners) l();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** One light tick. Call it straight from the tap handler (iOS only plays it inside a user gesture). */
export function tick(): void {
  if (!enabled || typeof document === 'undefined') return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === 'function') {
    nav.vibrate(8);
    return;
  }
  // Automated browsers cannot feel a tick, and the hidden switch's synthetic click would show up
  // as an extra tap in tap count tests; skip only the iOS technique there.
  if (nav.webdriver) return;
  switchTick();
}

/**
 * A longer buzz when something finishes on its own (rest over): the pattern on Android, one tick
 * on iPhone (best effort: iOS may only play it inside a gesture). Off when Haptics is off.
 */
export function buzz(pattern: number[] = [120, 80, 120]): void {
  if (!enabled || typeof document === 'undefined') return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === 'function') {
    nav.vibrate(pattern);
    return;
  }
  if (nav.webdriver) return;
  switchTick();
}

/** The native switch technique (exported for unit tests): a throwaway hidden switch, toggled through its label. */
export function switchTick(): void {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  label.click();
  label.remove();
}
