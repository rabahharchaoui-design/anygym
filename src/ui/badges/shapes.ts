// The medal outlines (PLAN 3.6h), as SVG path data in a 100 by 100 box. Pure geometry.
import type { BadgeShape } from './families';

type Pt = readonly [number, number];
const f = (n: number) => String(Math.round(n * 100) / 100);

/** A closed polygon with every corner rounded by `r` (a quadratic curve through the corner). */
export function roundedPolygon(points: readonly Pt[], r: number): string {
  const n = points.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[(i + n - 1) % n]!;
    const next = points[(i + 1) % n]!;
    const toward = (q: Pt): Pt => {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const d = Math.min(r, len / 2);
      return [p[0] + (dx / len) * d, p[1] + (dy / len) * d];
    };
    const a = toward(prev);
    const b = toward(next);
    parts.push(`${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])}Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`);
  }
  return `${parts.join('')}Z`;
}

/** `count` points round (cx, cy), the first straight up; odd points sit at `inner` when given (a seal's scallops). */
export function ringPoints(cx: number, cy: number, radius: number, count: number, inner = radius): Pt[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? inner : radius;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad] as const;
  });
}

export const circlePath = (cx: number, cy: number, r: number): string => `M${f(cx)} ${f(cy - r)}a${f(r)} ${f(r)} 0 1 0 0 ${f(r * 2)}a${f(r)} ${f(r)} 0 1 0 0 ${f(-r * 2)}Z`;

const SHIELD = 'M50 4L88 17V50C88 72 72 88 50 96C28 88 12 72 12 50V17Z';

export type MedalShape = {
  /** The titanium body. */
  body: string;
  /** The glass inlay inside it. */
  inlay: string;
  /** A transform for the inlay, when it is the body drawn smaller. */
  inlayTransform?: string;
  /** The middle of the inlay: where the number or the glyph sits. */
  center: Pt;
  /** Half the width of the inlay: what a number or glyph may fill. */
  room: number;
};

export const MEDALS: Record<BadgeShape, MedalShape> = {
  round: { body: circlePath(50, 50, 45), inlay: circlePath(50, 50, 33), center: [50, 50], room: 33 },
  hex: { body: roundedPolygon(ringPoints(50, 50, 48, 6), 9), inlay: roundedPolygon(ringPoints(50, 50, 35, 6), 7), center: [50, 50], room: 30 },
  seal: { body: roundedPolygon(ringPoints(50, 50, 48, 28, 43.5), 2.4), inlay: circlePath(50, 50, 32), center: [50, 50], room: 32 },
  diamond: { body: roundedPolygon(ringPoints(50, 50, 49, 4), 13), inlay: roundedPolygon(ringPoints(50, 50, 34, 4), 10), center: [50, 50], room: 24 },
  pin: { body: 'M50 3C29 3 12 19 12 40C12 63 36 81 50 97C64 81 88 63 88 40C88 19 71 3 50 3Z', inlay: circlePath(50, 40, 25), center: [50, 40], room: 25 },
  flame: { body: 'M50 3C56 20 83 36 83 62A33 33 0 0 1 17 62C17 48 24 39 30 29C33 40 40 44 43 38C47 28 45 14 50 3Z', inlay: circlePath(50, 63, 22), center: [50, 63], room: 22 },
  shield: { body: SHIELD, inlay: SHIELD, inlayTransform: 'translate(50 49) scale(0.7) translate(-50 -50)', center: [50, 47], room: 26 },
};
