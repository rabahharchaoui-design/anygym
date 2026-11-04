import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { tick } from './haptics';
import styles from './WheelColumn.module.css';

export type WheelItem<T extends number | string> = { value: T; label: string };

type Props<T extends number | string> = {
  items: readonly WheelItem<T>[];
  /** The value under the band (shown dim until `picked`). */
  value: T;
  /** False until the user moved it: the band and the number stay dim, nothing is chosen yet. */
  picked: boolean;
  onChange: (v: T) => void;
  label: string;
  testId?: string;
};

/** Row pitch in px; three rows show above and below the band. */
export const WHEEL_ROW = 44;

/**
 * PLAN 3.3: one vertical wheel column (iOS picker style) that snaps to a row. Native momentum
 * scroll with CSS snap; the row in the band is published as it passes (a tick per detent).
 * A mouse drags it (tests, desktop); arrow keys step it. Only the user's own scroll picks.
 */
export function WheelColumn<T extends number | string>({ items, value, picked, onChange, label, testId }: Props<T>) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const last = useRef(-1);
  const drag = useRef<{ id: number; y: number; top: number; moved: boolean } | null>(null);
  /** Set by the user's own touch, wheel or drag; cleared once the scroll settles. */
  const user = useRef(false);
  const settle = useRef<number>(undefined);
  const index = Math.max(0, items.findIndex((i) => i.value === value));

  const scrollTo = (i: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const top = i * WHEEL_ROW;
    if (Math.abs(el.scrollTop - top) < 1) return;
    programmatic.current = true;
    el.scrollTo({ top, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    window.setTimeout(() => (programmatic.current = false), smooth ? 400 : 60);
  };

  // Follow the value when it changes from outside (a unit flip) and on mount.
  useLayoutEffect(() => () => window.clearTimeout(settle.current), []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.round(el.scrollTop / WHEEL_ROW) !== index) scrollTo(index, false);
    last.current = index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const at = () => Math.min(items.length - 1, Math.max(0, Math.round((ref.current?.scrollTop ?? 0) / WHEEL_ROW)));

  const onScroll = () => {
    if (programmatic.current || drag.current || !user.current) return;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => (user.current = false), 200);
    const i = at();
    if (i !== last.current) {
      last.current = i;
      tick();
      onChange(items[i]!.value);
    } else if (!picked) onChange(items[i]!.value);
  };

  const step = (i: number) => {
    const j = Math.min(items.length - 1, Math.max(0, i));
    last.current = j;
    onChange(items[j]!.value);
    scrollTo(j, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    step(index + d);
  };

  const begin = () => {
    user.current = true;
    programmatic.current = false;
  };

  const onPointerDown = (e: PointerEvent) => {
    begin();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { id: e.pointerId, y: e.clientY, top: ref.current!.scrollTop, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      ref.current!.setPointerCapture?.(e.pointerId);
      ref.current!.dataset.dragging = 'true';
    }
    ref.current!.scrollTop = d.top - dy;
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    delete ref.current!.dataset.dragging;
    if (d.moved) step(at());
  };

  return (
    <div className={styles.wrap} data-picked={picked || undefined}>
      <div className={styles.band} aria-hidden="true" />
      <div
        ref={ref}
        className={styles.track}
        role="spinbutton"
        aria-label={label}
        aria-valuenow={typeof value === 'number' ? value : undefined}
        aria-valuetext={picked ? items[index]?.label : `${items[index]?.label}, not set yet`}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={begin}
        onWheel={begin}
        onClick={(e) => {
          const i = Number((e.target as HTMLElement).dataset.index);
          if (Number.isInteger(i)) step(i);
        }}
        data-testid={testId}
      >
        <span className={styles.spacer} aria-hidden="true" />
        {items.map((it, i) => (
          <span key={String(it.value)} className={`${styles.row} num`} data-index={i} data-centered={i === index || undefined} aria-hidden="true">
            {it.label}
          </span>
        ))}
        <span className={styles.spacer} aria-hidden="true" />
      </div>
      <div className={styles.fade} data-end="top" aria-hidden="true" />
      <div className={styles.fade} data-end="bottom" aria-hidden="true" />
    </div>
  );
}
