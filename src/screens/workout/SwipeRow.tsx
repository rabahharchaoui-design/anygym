import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { tick } from '../../ui/haptics';
import { prefersReducedMotion } from '../../ui/motion';
import styles from './SetRow.module.css';

/** How far the row stays open to show Delete at least (iOS: about 80 pt); a bigger label gets more. */
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
/** The slide out, then the row's height and gap close (critic B3). */
const SLIDE_MS = 180;
const COLLAPSE_MS = 220;

/** Rows removed with the animation, by key: when one comes back (Undo) it opens up again. */
const removedKeys = new Set<string>();
/** Mounted rows' "slide out and collapse, then run": a removal from a menu animates like a swipe. */
const outs = new Map<string, (then: () => void) => void>();

/**
 * Removes a row with the same motion as a swipe (slide out, collapse), then runs `then` (the data
 * change). Without a mounted row of that key it just runs.
 */
export function removeRowAnimated(key: string, then: () => void): void {
  const out = outs.get(key);
  if (out) out(then);
  else then();
}

/** A row about to come back (an Undo) opens up from nothing when it mounts or reappears. */
export function rowReturning(key: string): void {
  removedKeys.add(key);
}

type Props = {
  children: ReactNode;
  /** The row's data identity (its set or draft id): a row that comes back by Undo opens up again. */
  rowKey: string;
  /** "Delete set 2": the red action's accessible name. */
  deleteLabel: string;
  /** Runs after the slide out with the identity claimed when the delete started (PLAN 2.0l). */
  onDelete: (target: string) => void;
  /**
   * PLAN 2.0l: the data identity to remove, taken the moment the delete starts (a row with no
   * draft gets one). null: nothing to remove, the row comes home. Default: `rowKey`.
   */
  claim?: () => string | null;
  /** Long press (or a right click): the row's menu. */
  onLongPress?: () => void;
  /** Off while the row cannot be removed (Finish started, its write is running). */
  enabled?: boolean;
  /** The moving face: the row itself (its class and data attributes). */
  face: HTMLAttributes<HTMLDivElement> & { [data: `data-${string}`]: string | number | boolean | undefined };
};

type Drag = { id: number; x: number; y: number; t: number; base: number; width: number; axis: 'x' | 'y' | null; lastX: number; lastT: number; v: number };

/** The list item a row lives in (its height and the list gap close when it goes). */
const itemOf = (host: HTMLElement | null) => host?.closest('li') ?? null;
const gapOf = (li: HTMLElement) => parseFloat(getComputedStyle(li.parentElement ?? li).rowGap) || 0;

/**
 * A set row that swipes left to show a red Delete (PLAN 2.2d, iOS style): the row follows the
 * finger, snaps open, a full swipe deletes, a tap anywhere else closes. Pointer events, so touch,
 * pen and a mouse drag all work. The drag writes the face's transform directly (no React render per
 * move, transform only). On delete the row slides out, then its height and gap close; on Undo it
 * opens up again (round 2, critic B3). A long press dims and shrinks the row, then opens its menu.
 */
export function SwipeRow({ children, rowKey, deleteLabel, onDelete, claim, onLongPress, enabled = true, face }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef(0);
  const dim = useRef(0);
  const swallow = useRef(false);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const anims = useRef<Animation[]>([]);
  /**
   * The identity this row is sliding out for (PLAN 2.0l, Codex 1811 #7), from the delete's start to
   * the data change. When the row starts showing another identity meanwhile (rows moved under it),
   * the removal is cancelled: it never reaches the row that moved into this place.
   */
  const outTarget = useRef<string | null>(null);

  /** The open width: at least 80 pt, wide enough for the label at any text size (critic P5). */
  const openPx = () => Math.max(OPEN_PX, Math.ceil((labelRef.current?.offsetWidth ?? 0) + 32));

  const place = (x: number, animate: boolean) => {
    const el = faceRef.current;
    const host = hostRef.current;
    if (!el || !host) return;
    const moving = animate && !prefersReducedMotion();
    el.style.transition = moving ? `transform 260ms ${EASE}` : 'none';
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    // The label rides the row's edge once the row passes the open width (iOS full swipe).
    const label = labelRef.current;
    if (label) {
      label.style.transition = el.style.transition;
      label.style.transform = `translate3d(${Math.min(0, x + openPx())}px, 0, 0)`;
    }
    if (x < 0) host.dataset.revealed = '';
    else if (!moving) delete host.dataset.revealed;
    // Closing with the spring: the red goes once the row is home, never under a moving row.
    else
      window.setTimeout(() => {
        if (!openRef.current && !drag.current) delete host.dataset.revealed;
      }, 280);
  };
  const settle = (to: 'open' | 'closed') => {
    openRef.current = to === 'open';
    setOpen(to === 'open');
    place(to === 'open' ? -openPx() : 0, true);
  };

  /**
   * Slide out left; then, in one frame, the data changes (`then`: the rows renumber, the header
   * counts again, round 3 critic B3) while a detached copy of the row closes its height and gap, so
   * the rows below glide up instead of jumping. The copy is no part of the data: no test ids, hidden
   * from assistive tech, no taps.
   */
  const animateOut = (then: () => void, target: string = rowKey) => {
    openRef.current = false;
    setOpen(false);
    const el = faceRef.current;
    const li = itemOf(hostRef.current);
    if (!el || !li || !li.parentElement) return then();
    outTarget.current = target;
    removedKeys.add(target);
    const reduce = prefersReducedMotion();
    const collapse = () => {
      // Another row is in this place now (PLAN 2.0l): nothing is removed, the row comes home.
      if (outTarget.current !== target) {
        removedKeys.delete(target);
        if (faceRef.current) place(0, false);
        return;
      }
      outTarget.current = null;
      const list = li.parentElement;
      if (!list) return then();
      const h = li.getBoundingClientRect().height;
      const ghost = li.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-testid');
      ghost.removeAttribute('data-set-id');
      for (const n of ghost.querySelectorAll('[data-testid],[id]')) {
        n.removeAttribute('data-testid');
        n.removeAttribute('id');
      }
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('inert', '');
      ghost.dataset.ghost = '';
      ghost.style.pointerEvents = 'none';
      ghost.style.overflow = 'hidden';
      list.insertBefore(ghost, li);
      // The real row waits hidden until React shows what comes next in its place (or drops it).
      li.style.display = 'none';
      then();
      const frames = reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { height: `${h}px`, marginBottom: '0px', opacity: 1 },
            { height: '0px', marginBottom: `${-gapOf(li)}px`, opacity: 0 },
          ];
      const a = ghost.animate(frames, { duration: reduce ? 160 : COLLAPSE_MS, easing: reduce ? 'ease-out' : EASE, fill: 'forwards' });
      const done = () => {
        ghost.remove();
        li.style.display = '';
        // Still the same row (the change was refused): it comes home.
        if (faceRef.current) place(0, false);
      };
      a.onfinish = done;
      a.oncancel = done;
    };
    if (reduce) return collapse();
    const w = el.offsetWidth;
    el.style.transition = `transform ${SLIDE_MS}ms ${EASE}`;
    el.style.transform = `translate3d(${-w}px, 0, 0)`;
    // The label stays pinned to the red area's left edge as it grows (round 3, P1).
    const label = labelRef.current;
    if (label) {
      label.style.transition = el.style.transition;
      label.style.transform = `translate3d(${Math.min(0, -w + openPx())}px, 0, 0)`;
    }
    window.setTimeout(collapse, SLIDE_MS);
  };
  const remove = () => {
    tick();
    // The identity is taken now, at the delete's start, never looked up again by position.
    const target = claim ? claim() : rowKey;
    if (target === null) return settle('closed');
    animateOut(() => onDelete(target), target);
  };

  // A menu's Remove set animates this row like a swipe (removeRowAnimated).
  const outRef = useRef(animateOut);
  outRef.current = animateOut;
  useEffect(() => {
    const fn = (then: () => void) => outRef.current(then);
    outs.set(rowKey, fn);
    return () => {
      if (outs.get(rowKey) === fn) outs.delete(rowKey);
    };
  }, [rowKey]);

  // The row shows other data now (the list moved under it) or came back: whatever the last removal
  // left is cleared before paint, and a row that came back by Undo opens up from nothing.
  useLayoutEffect(() => {
    // Sliding out for this very identity (a row given its draft id as the delete started): it goes on.
    if (outTarget.current !== null && outTarget.current === rowKey) return;
    // Sliding out for another identity: cancelled, the row shows what is here now.
    outTarget.current = null;
    const li = itemOf(hostRef.current);
    for (const a of anims.current) a.cancel();
    anims.current = [];
    if (li) {
      li.style.overflow = '';
      li.style.display = '';
    }
    if (labelRef.current) labelRef.current.style.opacity = '';
    place(0, false);
    if (!li || !removedKeys.has(rowKey)) return;
    removedKeys.delete(rowKey);
    const a = prefersReducedMotion()
      ? li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
      : (() => {
          const h = li.getBoundingClientRect().height;
          li.style.overflow = 'hidden';
          const anim = li.animate(
            [
              { height: '0px', marginBottom: `${-gapOf(li)}px`, opacity: 0 },
              { height: `${h}px`, marginBottom: '0px', opacity: 1 },
            ],
            { duration: COLLAPSE_MS, easing: EASE },
          );
          anim.onfinish = () => (li.style.overflow = '');
          return anim;
        })();
    anims.current.push(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

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
  useEffect(
    () => () => {
      window.clearTimeout(press.current);
      window.clearTimeout(dim.current);
    },
    [],
  );
  // Turned off while open (Finish started): it closes.
  useEffect(() => {
    if (!enabled && openRef.current) settle('closed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const pressing = (on: boolean) => {
    if (!on) window.clearTimeout(dim.current);
    const host = hostRef.current;
    if (!host) return;
    if (on) host.dataset.pressing = '';
    else delete host.dataset.pressing;
  };

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
      // The hold shows: the row shrinks a touch and dims (critic P8), then the menu opens.
      window.clearTimeout(dim.current);
      dim.current = window.setTimeout(() => pressing(true), 120);
      press.current = window.setTimeout(() => {
        pressing(false);
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
      pressing(false);
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
    pressing(false);
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
    if (x < -openPx() / 2 || (d.v < -FLICK && x < -SLOP)) return settle('open');
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
        <span ref={labelRef} className={styles.swipeLabel}>
          Delete
        </span>
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
          pressing(false);
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
