import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { tick } from '../../ui/haptics';
import { prefersReducedMotion } from '../../ui/motion';
import styles from './SetTable.module.css';

/** How far the row stays open to show Delete (iOS: about 80 pt). */
export const OPEN_PX = 80;
/** A swipe past this share of the row's width deletes on release (iOS full swipe). */
const FULL_SHARE = 0.55;
/** Movement before a press counts as a drag (and stops being a long press). */
const SLOP = 8;
/** Hold this long without moving for the row's menu. */
const LONG_PRESS_MS = 480;
/** A quick flick opens even when short (px per ms). */
const FLICK = 0.45;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

type Props = {
  children: ReactNode;
  /** "Delete set 2": the red action's accessible name. */
  deleteLabel: string;
  onDelete: () => void;
  /** Long press (or a right click): the row's menu. */
  onLongPress?: () => void;
  /** Off while the row cannot be removed (Finish started, its write is running). */
  enabled?: boolean;
  /** The moving face: the row itself (its class and data attributes). */
  face: HTMLAttributes<HTMLDivElement> & { [data: `data-${string}`]: string | number | boolean | undefined };
};

type Drag = { id: number; x: number; y: number; t: number; base: number; width: number; axis: 'x' | 'y' | null; lastX: number; lastT: number; v: number };

/**
 * A set row that swipes left to show a red Delete (PLAN 2.2d, iOS style): the row follows the
 * finger, snaps open at about 80 pt, a full swipe deletes, a tap anywhere else closes. Pointer
 * events, so touch, pen and a mouse drag all work. The drag writes the face's transform directly
 * (no React render per move, transform only). A long press opens the row's menu.
 */
export function SwipeRow({ children, deleteLabel, onDelete, onLongPress, enabled = true, face }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef(0);
  const swallow = useRef(false);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const place = (x: number, animate: boolean) => {
    const el = faceRef.current;
    const host = hostRef.current;
    if (!el || !host) return;
    el.style.transition = animate && !prefersReducedMotion() ? `transform 260ms ${EASE}` : 'none';
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    if (x < 0) host.dataset.revealed = '';
    else if (!animate || prefersReducedMotion()) delete host.dataset.revealed;
    // Closing with the spring: the red goes once the row is home, never under a moving row.
    else
      window.setTimeout(() => {
        if (!openRef.current && !drag.current) delete host.dataset.revealed;
      }, 280);
  };
  const settle = (to: 'open' | 'closed') => {
    openRef.current = to === 'open';
    setOpen(to === 'open');
    place(to === 'open' ? -OPEN_PX : 0, true);
  };
  const remove = () => {
    openRef.current = false;
    setOpen(false);
    const el = faceRef.current;
    const w = el?.offsetWidth ?? 0;
    tick();
    if (!el || prefersReducedMotion()) {
      place(0, false);
      onDelete();
      return;
    }
    // Off to the left, then the row goes (the table drops it from the data).
    el.style.transition = `transform 200ms ${EASE}`;
    el.style.transform = `translate3d(${-w}px, 0, 0)`;
    window.setTimeout(() => {
      onDelete();
      // The row may stay (a delete that failed and came back): it slides home.
      requestAnimationFrame(() => place(0, false));
    }, 180);
  };

  // A tap anywhere outside the open row closes it (iOS).
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (hostRef.current?.contains(e.target as Node)) return;
      settle('closed');
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => window.clearTimeout(press.current), []);
  // Turned off while open (Finish started): it closes.
  useEffect(() => {
    if (!enabled && openRef.current) settle('closed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swallow.current = false;
    // Only the first finger (multi touch protection) and the main mouse button.
    if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (openRef.current) {
      // A tap on the open row's face closes it and does nothing else.
      swallow.current = true;
      settle('closed');
      return;
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, base: 0, width: faceRef.current?.offsetWidth ?? 320, axis: null, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    if (onLongPress) {
      window.clearTimeout(press.current);
      press.current = window.setTimeout(() => {
        if (!drag.current || drag.current.axis) return;
        drag.current = null;
        swallow.current = true;
        tick();
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      window.clearTimeout(press.current);
      d.axis = enabled && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'y') {
        drag.current = null;
        return;
      }
      try {
        faceRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer: moves still arrive */
      }
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    // Left follows the finger; right of home only gives a little (friction, never a hard stop).
    const x = d.base + dx;
    place(x > 0 ? Math.min(24, x * 0.2) : x, false);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    window.clearTimeout(press.current);
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.axis !== 'x') return;
    // A drag is never also a tap on a cell, and never the view's swipe to the next exercise.
    swallow.current = true;
    e.stopPropagation();
    const x = d.base + (e.clientX - d.x);
    if (cancelled) return settle('closed');
    if (x < -d.width * FULL_SHARE) return remove();
    if (x < -OPEN_PX / 2 || (d.v < -FLICK && x < -SLOP)) return settle('open');
    settle('closed');
  };

  return (
    <div ref={hostRef} className={styles.swipe} data-open={open || undefined}>
      <button
        type="button"
        className={styles.swipeDelete}
        onClick={remove}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={deleteLabel}
        data-testid="swipe-delete"
      >
        Delete
      </button>
      <div
        {...face}
        ref={faceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e, false)}
        onPointerCancel={(e) => onPointerEnd(e, true)}
        onContextMenu={(e) => {
          // Android's long press and a right click: the row's menu, never the browser's.
          e.preventDefault();
          if (!onLongPress || swallow.current) return;
          window.clearTimeout(press.current);
          drag.current = null;
          swallow.current = true;
          onLongPress();
        }}
        onClickCapture={(e) => {
          if (!swallow.current) return;
          swallow.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
