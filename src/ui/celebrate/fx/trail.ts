// A light trail (PLAN 3.6h): a run record. One light runs a route across the stage, its tail
// fading behind it; the route it ran stays as a faint line and the light rests at the end.
import { clamp01, easeOut, type Fx } from './types';

type Spark = { at: number; dx: number; dy: number; size: number };

const ARRIVES = 0.78;
const STEPS = 28;

/** The route: left to right, climbing, with one easy bend. `u` is 0 to 1 along it. */
function route(u: number, w: number, h: number): [number, number] {
  return [w * (0.1 + 0.8 * u), h * (0.7 - 0.36 * u) + Math.sin(u * Math.PI * 2) * h * 0.11];
}

export const trail: Fx<Spark> = {
  life: 900,
  stillAt: 1,
  holds: true,
  make(count, rnd) {
    return Array.from({ length: count }, (_, i) => ({ at: (i + 0.5 + rnd() * 0.4) / (count + 1), dx: (rnd() - 0.5) * 16, dy: 8 + rnd() * 18, size: 1 + rnd() * 1.4 }));
  },
  draw(ctx, parts, t, w, h, inks) {
    const head = easeOut(clamp01(t / ARRIVES));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The route already run: faint, whole.
    ctx.strokeStyle = inks.accent;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const [x, y] = route((head * i) / STEPS, w, h);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    // The tail: the last third behind the light, brighter and wider toward it.
    const tail = 0.34 * (1 - clamp01((t - ARRIVES) / (1 - ARRIVES)));
    if (tail > 0.01) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, head - tail * (1 - i / n));
        const b = Math.max(0, head - tail * (1 - (i + 1) / n));
        const [x1, y1] = route(a, w, h);
        const [x2, y2] = route(b, w, h);
        ctx.globalAlpha = ((i + 1) / n) * 0.9;
        ctx.lineWidth = 1.5 + (3.5 * (i + 1)) / n;
        ctx.strokeStyle = i > n * 0.6 ? inks.hi : inks.accent;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    // Sparks shed where the light has passed: they sink and fade.
    const rest = clamp01((t - ARRIVES) / (1 - ARRIVES));
    ctx.fillStyle = inks.hi;
    for (const s of parts) {
      const passed = clamp01((head - s.at) / 0.35);
      if (passed <= 0 || passed >= 1) continue;
      const [x, y] = route(s.at, w, h);
      ctx.globalAlpha = 0.8 * (1 - passed) * (1 - rest);
      ctx.beginPath();
      ctx.arc(x + s.dx * passed, y + s.dy * passed, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    // The light itself, with one soft halo that opens as it comes to rest.
    const [hx, hy] = route(head, w, h);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = inks.accent;
    ctx.beginPath();
    ctx.arc(hx, hy, 9 + 5 * easeOut(rest), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = inks.hi;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
  },
};
