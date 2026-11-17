// Things the Run tab says once and never again (PLAN 4.3), kept on this phone only: the pocket mode
// explainer before the first run, and the note that this phone cannot keep its screen on.
export type RunFlag = 'pocket' | 'wake';

const key = (flag: RunFlag) => `anygym.run.told.${flag}`;

export function wasTold(flag: RunFlag): boolean {
  try {
    return localStorage.getItem(key(flag)) === '1';
  } catch {
    return false;
  }
}

export function rememberTold(flag: RunFlag): void {
  try {
    localStorage.setItem(key(flag), '1');
  } catch {
    // Private mode: it is said again next time.
  }
}
