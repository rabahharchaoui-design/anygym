// Slow falling glass shards (PLAN 3.6h): the first workout. A few panes of glass drift down, turn a
// little and catch the light on one edge. Near ones are larger and fall faster.
import { clamp01, type Fx } from './types';

type Shard = { x: number; y: number; size: number; fall: number; sway: number; spin: number; turn: number; late: number; pts: readonly [number, number][]; lit: boolean };

export const shards: Fx<Shard> = {
  life: 1000,
  stillAt: 0.5,
  holds: false,
  make(count, rnd, w, h) {
    return Array.from({ length: count }, (_, i) => {
      const depth = 0.35 + rnd() * 0.65;
      const corners = 3 + Math.floor(rnd() * 2);
      const pts = Array.from({ length: corners }, (_, k) => {
        const a = ((k + rnd() * 0.5) / corners) * Math.PI * 2;
        const r = 0.55 + rnd() * 0.45;
        return [Math.cos(a) * r * 0.62, Math.sin(a) * r * 1.7] as [number, number];
      });
      // Spread across the width in columns so they never clump, and away from the middle band where the number is.
      const x = ((i + 0.15 + rnd() * 0.7) / count) * w;
      const top = rnd() < 0.5;
      const y = top ? h * (0.06 + rnd() * 0.26) : h * (0.62 + rnd() * 0.26);
      return { x, y, size: 8 + depth * 20, fall: 46 + depth * 84, sway: (rnd() - 0.5) * 22, spin: rnd() * Math.PI, turn: (rnd() - 0.5) * 1.3, late: rnd() * 0.2, pts, lit: i % 3 === 0 };
    });
  },
  draw(ctx, parts, t, _w, _h, inks) {
    ctx.lineJoin = 'round';
    for (const p of parts) {
      const u = clamp01((t - p.late) / (1 - p.late));
      if (u <= 0) continue;
      const alpha = u < 0.2 ? u / 0.2 : u > 0.7 ? (1 - u) / 0.3 : 1;
      ctx.save();
      ctx.translate(p.x + p.sway * Math.sin(u * Math.PI), p.y + p.fall * (u - 0.5));
      ctx.rotate(p.spin + p.turn * u);
      ctx.beginPath();
      p.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x * p.size, y * p.size) : ctx.moveTo(x * p.size, y * p.size)));
      ctx.closePath();
      ctx.globalAlpha = alpha * (p.lit ? 0.16 : 0.07);
      ctx.fillStyle = p.lit ? inks.hi : inks.text;
      ctx.fill();
      ctx.globalAlpha = alpha * (p.lit ? 0.6 : 0.2);
      ctx.strokeStyle = p.lit ? inks.accent : inks.pair;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};
