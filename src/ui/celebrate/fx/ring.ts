// A titanium ring that assembles (PLAN 3.6h): a level up. Segments arrive from outside, one after
// another, turn into place and lock; then one ice blue line runs round the inside.
import { clamp01, easeOut, type Fx } from './types';

type Segment = { from: number; to: number; far: number; twist: number; late: number; ink: 0 | 1 | 2 };

const ASSEMBLED = 0.68;

export const ring: Fx<Segment> = {
  life: 900,
  stillAt: 1,
  holds: true,
  make(count, rnd) {
    const step = (Math.PI * 2) / count;
    const gap = 0.022;
    return Array.from({ length: count }, (_, i) => ({ from: i * step - Math.PI / 2 + gap, to: (i + 1) * step - Math.PI / 2 - gap, far: 40 + rnd() * 70, twist: -0.5 - rnd() * 0.6, late: (i / count) * 0.36, ink: (i % 3) as 0 | 1 | 2 }));
  },
  draw(ctx, parts, t, w, h, inks) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.3;
    const metal = [inks.pair, inks.text, inks.pair];
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(5, radius * 0.13);
    for (const s of parts) {
      const u = clamp01((t - s.late) / (ASSEMBLED - 0.36));
      if (u <= 0) continue;
      const e = easeOut(u);
      ctx.globalAlpha = Math.min(1, u * 2.5);
      ctx.strokeStyle = metal[s.ink]!;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + s.far * (1 - e), s.from + s.twist * (1 - e), s.to + s.twist * (1 - e));
      ctx.stroke();
    }
    // The ice blue line: it runs once round the inside as the last segment locks, and stays.
    const run = easeOut(clamp01((t - ASSEMBLED) / (1 - ASSEMBLED)));
    if (run > 0) {
      const inner = radius - ctx.lineWidth / 2 - 5;
      ctx.strokeStyle = inks.accent;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, inner, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * run);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
};
