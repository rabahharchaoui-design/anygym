// PLAN 2.2e round 2 (critic B6): work that is not the answer to a tap waits until the tap's own
// frame has been painted, so the press feedback and the check animation never stall behind it.

/** Runs `fn` after the next frame has been painted (two animation frames). Returns a cancel. */
export function afterPaint(fn: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    const t = setTimeout(fn, 0);
    return () => clearTimeout(t);
  }
  let inner = 0;
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(() => fn());
  });
  return () => {
    cancelAnimationFrame(outer);
    if (inner) cancelAnimationFrame(inner);
  };
}

/** Runs `fn` once a closing sheet has settled (the sheet spring, about 240 ms), after paint. */
export function afterSheet(fn: () => void): void {
  setTimeout(() => afterPaint(fn), 260);
}

/**
 * Resolves once the current frame has painted and the main thread is idle (requestIdleCallback
 * where the browser has it, capped at 120 ms; otherwise the next task): the save work after a ✓
 * starts behind the check's first frames (PLAN 2.2e round 3, critic B1).
 */
export function idleAfterPaint(): Promise<void> {
  return new Promise((resolve) => {
    afterPaint(() => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (typeof ric === 'function') ric(() => resolve(), { timeout: 120 });
      else setTimeout(resolve, 0);
    });
  });
}
