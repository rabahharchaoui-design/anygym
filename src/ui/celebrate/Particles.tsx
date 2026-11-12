import { useEffect, useRef } from 'react';
import { DUR } from '../motion';
import styles from './celebrate.module.css';

type Props = {
  /** How many: about 14 for a card, 44 for the full screen. */
  count: number;
  /** Where the burst starts, as fractions of the canvas (0.5, 0.5 is the middle). */
  origin: { x: number; y: number };
  /** How far the fastest ones travel, in px. */
  reach: number;
  /** Wait before the burst, in ms (the number lands first). */
  delay?: number;
  /** How long a particle lives, in ms (the default is the celebrate duration). */
  life?: number;
  /** Told once the last particle has faded. */
  onDone?: () => void;
  className?: string;
};

/** Small and repeatable (mulberry32): the same burst every time, so recordings and reviews match. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The palette, read from tokens.css (never a colour written here): mostly the accent, some lit, a few titanium. */
const INKS = ['--accent', '--accent', '--accent-hi', '--accent-hi', '--text'] as const;

/**
 * One burst of ice blue particles on a canvas (PLAN 3.6b): they leave one point together, slow
 * down, sink a little and fade, all inside DUR.celebrate. The canvas fills its positioned parent,
 * takes no taps and is hidden from screen readers. One requestAnimationFrame loop, stopped when
 * the burst is over or the component leaves. The caller does not render it under reduced motion.
 */
export function Particles({ count, origin, reach, delay = 0, life: lifeMs = DUR.celebrate, onDone, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    // Sharp on any phone, never more than 2x: a 3x full screen canvas is 2.25 times the pixels for nothing the eye sees in motion.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const inks = INKS.map((name) => css.getPropertyValue(name).trim());
    const rnd = seeded(count * 7919 + Math.round(reach));
    const ox = box.width * origin.x;
    const oy = box.height * origin.y;
    const life = lifeMs;
    const parts = Array.from({ length: count }, (_, i) => {
      // Evenly round the circle with a little jitter: a full burst, never a clump on one side.
      const angle = ((i + rnd() * 0.8) / count) * Math.PI * 2;
      const far = reach * (0.35 + rnd() * 0.65);
      return { cos: Math.cos(angle), sin: Math.sin(angle), far, size: 1.4 + rnd() * 2.6, ink: inks[Math.floor(rnd() * inks.length)]!, late: rnd() * 0.12, streak: rnd() < 0.3 };
    });
    let raf = 0;
    let start = 0;
    const frame = (now: number) => {
      if (!start) start = now + delay;
      const t = (now - start) / life;
      ctx.clearRect(0, 0, box.width, box.height);
      if (t >= 1) {
        canvas.dataset.done = '';
        done.current?.();
        return;
      }
      if (t > 0) {
        for (const p of parts) {
          const u = Math.min(1, Math.max(0, (t - p.late) / (1 - p.late)));
          if (u <= 0) continue;
          // Ease out (fast, then drifting), with a slow sink.
          const out = 1 - (1 - u) ** 3;
          const x = ox + p.cos * p.far * out;
          const y = oy + p.sin * p.far * out + 26 * u * u;
          ctx.globalAlpha = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
          ctx.fillStyle = p.ink;
          if (p.streak) {
            // A short dash along its path, shrinking as it slows.
            const len = p.size * 3 * (1 - out) + p.size;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(p.sin, p.cos));
            ctx.fillRect(-len / 2, -p.size / 3, len, p.size / 1.5);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(x, y, (p.size / 2) * (1 - 0.4 * u), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [count, origin.x, origin.y, reach, delay, lifeMs]);

  return <canvas ref={ref} className={`${styles.particles} ${className ?? ''}`} aria-hidden="true" data-testid="celebrate-particles" />;
}
