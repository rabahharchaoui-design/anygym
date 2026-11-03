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
