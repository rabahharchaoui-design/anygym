import { useEffect, useRef } from 'react';
import { cappedCount, type EffectVariant } from '../effects';
import { fitCanvas } from '../fitCanvas';
import { seeded } from '../seeded';
import { ring } from './ring';
import { shards } from './shards';
import { trail } from './trail';
import type { Fx, Inks } from './types';
import styles from './fx.module.css';

export type CanvasVariant = Exclude<EffectVariant, 'burst' | 'ambient'>;

// Each effect keeps its own piece type; the canvas only ever hands an effect back its own pieces.
const FX: Record<CanvasVariant, Fx<never>> = { shards: shards as unknown as Fx<never>, ring: ring as unknown as Fx<never>, trail: trail as unknown as Fx<never> };

export type FxCanvasProps = {
  variant: CanvasVariant;
  /** Reduced motion: one still picture, no clock. */
  reduce?: boolean | null;
  /** How many pieces (never more than the effect's cap). */
  count?: number;
  /** One run in ms (the effect's own length when left out). */
  life?: number;
  /** Wait before it starts, in ms. */
  delay?: number;
  onDone?: () => void;
  className?: string;
};

/**
 * The one canvas every drawn effect runs on (PLAN 3.6h). It fills its positioned parent, takes no
 * taps and is hidden from screen readers. One requestAnimationFrame loop; the clock stops while
 * the page is hidden (a locked phone, another app) and carries on from the same frame after.
 * Never sharper than 2x: a 3x full screen canvas is 2.25 times the pixels for nothing the eye
 * sees in motion. Reduced motion: the effect's still frame, drawn once.
 */
export function FxCanvas({ variant, reduce, count, life, delay = 0, onDone, className }: FxCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const fx = FX[variant];
    const box = fitCanvas(canvas, ctx);
    const css = getComputedStyle(canvas);
    const ink = (name: string) => css.getPropertyValue(name).trim();
    const inks: Inks = { accent: ink('--accent'), hi: ink('--accent-hi'), text: ink('--text'), pair: ink('--pair'), dim: ink('--text-3') };
    const n = cappedCount(variant, count);
    const parts = fx.make(n, seeded(n * 7919 + variant.length), box.width, box.height);
    const paint = (t: number) => {
      ctx.clearRect(0, 0, box.width, box.height);
      fx.draw(ctx, parts, t, box.width, box.height, inks);
    };
    if (reduce) {
      paint(fx.stillAt);
      canvas.dataset.state = 'still';
      return;
    }
    const span = life ?? fx.life;
    let raf = 0;
    let last = 0;
    let elapsed = -delay;
    const frame = (now: number) => {
      // Only time spent in view counts, so a pause never skips the effect forward.
      if (last) elapsed += Math.min(now - last, 50);
      last = now;
      const t = elapsed / span;
      if (t >= 1) {
        if (fx.holds) paint(1);
        else ctx.clearRect(0, 0, box.width, box.height);
        canvas.dataset.state = 'done';
        done.current?.();
        return;
      }
      if (t > 0) paint(t);
      raf = requestAnimationFrame(frame);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      if (canvas.dataset.state === 'done') return;
      if (document.visibilityState === 'hidden') {
        canvas.dataset.state = 'paused';
        return;
      }
      last = 0;
      canvas.dataset.state = 'running';
      raf = requestAnimationFrame(frame);
    };
    delete canvas.dataset.state;
    run();
    document.addEventListener('visibilitychange', run);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', run);
    };
  }, [variant, reduce, count, life, delay]);

  return <canvas ref={ref} className={`${styles.canvas} ${className ?? ''}`} aria-hidden="true" data-fx={variant} data-testid="celebrate-fx" />;
}
