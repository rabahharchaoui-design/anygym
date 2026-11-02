import { useEffect, useState } from 'react';

/**
 * False on the first render, true right after that render was painted (PLAN 2.2d): heavy parts
 * below the fold mount a frame later, so the screen change and the first paint stay light.
 */
export function useAfterPaint(): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (painted) return;
    let t = 0;
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(() => setPainted(true), 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [painted]);
  return painted;
}
