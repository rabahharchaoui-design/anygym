// Press and hold (SPEC 12.2): the ring fills while the finger stays down; the action happens when
// it is full, never before. Lifting early, sliding off or a cancelled touch empties it and nothing
// happens. The rules are in lib/run/hold.ts; this hook only follows the finger and the clock.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { HOLD_MS, holdDone, holdFraction, holdLeft, startHold, type Hold } from '../lib/run';

export type HoldBind = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onKeyUp: (e: KeyboardEvent<HTMLElement>) => void;
  onBlur: () => void;
  onContextMenu: (e: { preventDefault: () => void }) => void;
};

export function useHold(onDone: () => void, ms = HOLD_MS): { fraction: number; holding: boolean; bind: HoldBind } {
  const [fraction, setFraction] = useState(0);
  const hold = useRef<Hold | null>(null);
  const frame = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;

  const stop = useCallback(() => {
    hold.current = null;
    cancelAnimationFrame(frame.current);
    setFraction(0);
  }, []);

  const begin = useCallback(
    (x: number, y: number) => {
      if (hold.current) return;
      hold.current = startHold(performance.now(), x, y);
      const step = () => {
        const h = hold.current;
        if (!h) return;
        const now = performance.now();
        if (holdDone(h, now, ms)) {
          stop();
          done.current();
          return;
        }
        setFraction(holdFraction(h, now, ms));
        frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [ms, stop],
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const bind: HoldBind = {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      // The finger keeps the button even when it drifts a little, so sliding off can be judged here.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // No capture on this browser: leaving the button then simply cancels.
      }
      begin(e.clientX, e.clientY);
    },
    onPointerMove: (e) => {
      if (hold.current && holdLeft(hold.current, e.clientX, e.clientY)) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onKeyDown: (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) begin(0, 0);
    },
    onKeyUp: (e) => {
      if (e.key === 'Enter' || e.key === ' ') stop();
    },
    onBlur: stop,
    onContextMenu: (e) => e.preventDefault(),
  };
  return { fraction, holding: fraction > 0, bind };
}
