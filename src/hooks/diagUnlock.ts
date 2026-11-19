// The door to the run diagnostics export (PLAN 4.4d (2)): the 5 taps on the version in Settings
// (the hidden #/review route, SPEC 9.4) open it on this phone. No imports, so Settings stays light.
const KEY = 'anygym.diag.unlocked';

/** The 5 taps on the version fired: the diagnostics export shows from now on, on this phone. */
export function unlockDiagnostics(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // No storage: nothing to unlock, nothing shown.
  }
}

export function diagnosticsUnlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
