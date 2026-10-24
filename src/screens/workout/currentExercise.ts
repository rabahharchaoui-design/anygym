// Which exercise card is open, per workout, so a reload lands on the same card.
const KEY = 'anygym-current-exercise';

export function loadCurrent(sessionId: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { sessionId?: string; exerciseId?: string } | null;
    return v?.sessionId === sessionId && typeof v.exerciseId === 'string' ? v.exerciseId : null;
  } catch {
    return null;
  }
}

export function saveCurrent(sessionId: string, exerciseId: string | null): void {
  try {
    if (exerciseId) localStorage.setItem(KEY, JSON.stringify({ sessionId, exerciseId }));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the newest card opens instead */
  }
}
