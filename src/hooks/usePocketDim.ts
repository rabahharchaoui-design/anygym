// Pocket mode dimming (SPEC 12.2): near black after 10 seconds with no touch; a tap wakes it and
// that tap presses nothing. The rules are in lib/run/dim.ts; this hook keeps the timer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { msUntilDim } from '../lib/run';

/**
 * After the waking touch the screen still swallows touches for this long, so the tap that woke it
 * (its click comes a moment after the finger lifts) can never land on a button underneath.
 */
export const WAKE_GUARD_MS = 400;

export type DimPhase = 'lit' | 'dim' | 'waking';

export function usePocketDim(enabled: boolean): { phase: DimPhase; /** Any touch on the lit screen. */ touched: () => void; /** A touch on the dimmed screen. */ wake: () => void } {
  const [phase, setPhase] = useState<DimPhase>('lit');
  const last = useRef(Date.now());
  const timer = useRef<number | null>(null);
  const guard = useRef<number | null>(null);

  const arm = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const wait = msUntilDim({ lastTouchAt: last.current, now: Date.now(), enabled });
    if (wait === null) return;
    timer.current = window.setTimeout(() => setPhase((p) => (p === 'lit' ? 'dim' : p)), wait);
  }, [enabled]);

  // Dimming starts counting when it becomes possible (the run goes on, nothing is open), and a
  // screen that may not dim is lit.
  useEffect(() => {
    last.current = Date.now();
    if (!enabled) setPhase('lit');
    arm();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [enabled, arm]);
  useEffect(
    () => () => {
      if (guard.current !== null) window.clearTimeout(guard.current);
    },
    [],
  );

  const touched = useCallback(() => {
    last.current = Date.now();
    arm();
  }, [arm]);

  const wake = useCallback(() => {
    last.current = Date.now();
    setPhase((p) => (p === 'dim' ? 'waking' : p));
    if (guard.current !== null) window.clearTimeout(guard.current);
    guard.current = window.setTimeout(() => {
      setPhase('lit');
      last.current = Date.now();
      arm();
    }, WAKE_GUARD_MS);
  }, [arm]);

  return { phase, touched, wake };
}
