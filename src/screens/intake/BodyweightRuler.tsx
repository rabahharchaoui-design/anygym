import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Unit } from '../../db/types';
import { BODYWEIGHT_RANGE } from '../../lib/intake/funnel';
import { LABEL_EVERY, labels, offsetFor, TICK_PX, valueAt } from '../../lib/intake/ruler';
import { BODYWEIGHT_STEP, formatAmount } from '../../lib/load';
import { tick } from '../../ui/haptics';
import styles from './Intake.module.css';

type Props = {
  unit: Unit;
  value: number;
  /** False until the user moves it. */
  touched: boolean;
  onChange: (v: number) => void;
};

/**
 * PLAN 3.3: the horizontal bodyweight ruler. Scrubbed with the thumb (native momentum scroll), it
 * snaps to a tick every 0.5 once it settles; the value under the needle is published as it passes
 * each tick, with a haptic tick. Arrow keys step 0.5 (a slider for assistive tech).
 */
export function BodyweightRuler({ unit, value, touched, onChange }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const settle = useRef<number>(undefined);
  const user = useRef(false);
  const lastValue = useRef(value);
  const drag = useRef<{ id: number; x: number; left: number } | null>(null);

  const scrollTo = (v: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const left = offsetFor(v, unit);
    if (Math.abs(el.scrollLeft - left) < 0.5) return;
    programmatic.current = true;
    el.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    window.setTimeout(() => (programmatic.current = false), smooth && !reduce ? 350 : 50);
  };

  // Follow the value from outside (mount, a unit flip).
  useLayoutEffect(() => {
    if (lastValue.current !== value || Math.abs((ref.current?.scrollLeft ?? 0) - offsetFor(value, unit)) > TICK_PX / 2) {
      if (!user.current) scrollTo(value, false);
    }
    lastValue.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, unit]);

  useLayoutEffect(() => () => window.clearTimeout(settle.current), []);

  const publish = (v: number) => {
    if (v === lastValue.current && touched) return;
    if (v !== lastValue.current) tick();
    lastValue.current = v;
    onChange(v);
  };

  const onScroll = () => {
    const el = ref.current;
    if (!el || programmatic.current || !user.current) return;
    publish(valueAt(el.scrollLeft, unit));
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (drag.current) return;
      const v = valueAt(el.scrollLeft, unit);
      publish(v);
      user.current = false;
      scrollTo(v, true);
    }, 120);
  };

  const begin = () => {
    user.current = true;
    programmatic.current = false;
  };

  const onPointerDown = (e: PointerEvent) => {
    begin();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: ref.current!.scrollLeft };
    ref.current!.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    ref.current!.scrollLeft = d.left - (e.clientX - d.x);
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    onScroll();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const r = BODYWEIGHT_RANGE[unit];
    const v = Math.min(r.max, Math.max(r.min, valueAt(offsetFor(value, unit) + d * TICK_PX, unit)));
    publish(v);
    scrollTo(v, false);
  };

  const r = BODYWEIGHT_RANGE[unit];
  const width = offsetFor(r.max, unit);
  const labelPx = (LABEL_EVERY[unit] / BODYWEIGHT_STEP) * TICK_PX;
  // The first label sits on a whole label value; the big ticks line up with it.
  const labelStart = offsetFor(labels(unit)[0]!, unit);

  return (
    <div className={styles.ruler} data-touched={touched || undefined}>
      <div className={styles.needle} aria-hidden="true" />
      <div
        ref={ref}
        className={styles.rulerTrack}
        role="slider"
        tabIndex={0}
        aria-label={`Bodyweight in ${unit}`}
        aria-valuemin={r.min}
        aria-valuemax={r.max}
        aria-valuenow={value}
        aria-valuetext={touched ? `${formatAmount(value)} ${unit}` : 'Not set yet'}
        onScroll={onScroll}
        onTouchStart={begin}
        onWheel={begin}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        data-testid="bodyweight-ruler"
      >
        <span className={styles.rulerSpacer} aria-hidden="true" />
        <div
          className={styles.ticks}
          style={{ width: width + 1, '--tick': `${TICK_PX}px`, '--major': `${labelPx}px`, '--major-start': `${labelStart}px`, '--whole': `${TICK_PX * 2}px` } as CSSProperties}
        >
          {labels(unit).map((v) => (
            <span key={v} className={`${styles.tickLabel} num`} style={{ left: offsetFor(v, unit) }}>
              {v}
            </span>
          ))}
        </div>
        <span className={styles.rulerSpacer} aria-hidden="true" />
      </div>
    </div>
  );
}
