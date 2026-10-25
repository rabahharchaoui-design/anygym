import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { prefersReducedMotion } from './motion';
import styles from './EdgeSwipe.module.css';

type Props = {
  /** The pushed screen that follows the finger. */
  layerRef: RefObject<HTMLElement | null>;
  /** Goes back for real once the swipe finishes (no second animation). */
  onBack: () => void;
  /** The screen underneath, drawn only while swiping. */
  under: () => ReactNode;
};

const EDGE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Interactive back swipe from the left edge (SPEC 23.1): the pushed screen follows the finger
 * over the previous one (30% left, dimmed, coming back into place), then finishes or cancels by
 * distance and velocity. A plain tap on the thin edge strip passes through to what is under it.
 */
export function EdgeSwipe({ layerRef, onBack, under }: Props) {
  const [active, setActive] = useState(false);
  const underRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; w: number; dx: number; samples: Array<[number, number]> } | null>(null);
  const settling = useRef(false);

  const place = (dx: number, w: number) => {
    const layer = layerRef.current;
    const p = Math.min(1, dx / w);
    if (layer) {
      layer.style.transform = `translate3d(${dx}px,0,0)`;
      layer.style.boxShadow = '-14px 0 34px rgb(0 0 0 / 0.55)';
    }
    if (underRef.current) underRef.current.style.transform = `translate3d(${-0.3 * w * (1 - p)}px,0,0)`;
    if (shadeRef.current) shadeRef.current.style.opacity = String(0.45 * (1 - p));
  };

  const reset = () => {
    const layer = layerRef.current;
    if (layer) {
      layer.getAnimations().forEach((a) => a.cancel());
      layer.style.transform = '';
      layer.style.boxShadow = '';
    }
    settling.current = false;
    setActive(false);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current || settling.current || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = layerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), w, dx: 0, samples: [[e.clientX, performance.now()]] };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.dx = Math.max(0, e.clientX - d.x0);
    d.samples.push([e.clientX, performance.now()]);
    if (d.samples.length > 6) d.samples.shift();
    if (!active && d.dx > 4) setActive(true);
    place(d.dx, d.w);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.dx < 4 && performance.now() - d.t0 < 400) {
      // A tap, not a swipe: hand it to whatever is under the strip.
      const strip = stripRef.current;
      if (strip) strip.style.pointerEvents = 'none';
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (strip) strip.style.pointerEvents = '';
      reset();
      target?.click();
      return;
    }
    const [x1, t1] = d.samples[0]!;
    const [x2, t2] = d.samples[d.samples.length - 1]!;
    const velocity = t2 > t1 ? (x2 - x1) / (t2 - t1) : 0; // px per ms
    const finish = d.dx > d.w * 0.4 || (velocity > 0.45 && d.dx > 16);
    settle(finish, d);
  };

  const settle = (finish: boolean, d: { dx: number; w: number }) => {
    const layer = layerRef.current;
    const reduce = prefersReducedMotion();
    if (!layer) return reset();
    settling.current = true;
    const to = finish ? d.w : 0;
    const duration = reduce ? 0 : Math.max(140, Math.min(260, (Math.abs(to - d.dx) / d.w) * 300));
    const opts: KeyframeAnimationOptions = { duration, easing: EDGE_EASE, fill: 'forwards' };
    const anim = layer.animate([{ transform: `translate3d(${d.dx}px,0,0)` }, { transform: `translate3d(${to}px,0,0)` }], opts);
    const p0 = Math.min(1, d.dx / d.w);
    const p1 = finish ? 1 : 0;
    underRef.current?.animate([{ transform: `translate3d(${-0.3 * d.w * (1 - p0)}px,0,0)` }, { transform: `translate3d(${-0.3 * d.w * (1 - p1)}px,0,0)` }], opts);
    shadeRef.current?.animate([{ opacity: 0.45 * (1 - p0) }, { opacity: 0.45 * (1 - p1) }], opts);
    anim.onfinish = () => {
      if (finish) {
        onBack();
        // The pushed screen is replaced by the one underneath; clear anything left on a reused layer.
        requestAnimationFrame(reset);
      } else reset();
    };
  };

  return (
    <>
      {active && (
        <div className={styles.under} ref={underRef} aria-hidden="true" {...{ inert: '' }}>
          {under()}
          <div className={styles.shade} ref={shadeRef} />
        </div>
      )}
      <div
        ref={stripRef}
        className={styles.strip}
        data-testid="edge-swipe"
        aria-hidden="true"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={(e) => {
          const d = drag.current;
          if (!d || e.pointerId !== d.id) return;
          drag.current = null;
          settle(false, d);
        }}
      />
    </>
  );
}
