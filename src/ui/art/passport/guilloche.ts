// Guilloche line work (PLAN 3.6h, for the passport of 4.7), pure: the fine looping curves printed
// on passport paper and banknotes, generated as SVG path data. No randomness: the same numbers
// always give the same drawing.

const f = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A rosette: a point on a small wheel rolling inside a circle (a hypotrochoid). `petals` loops
 * round (cx, cy), reaching `radius`; `depth` (0 to 1) is how far each loop dips toward the middle.
 */
export function rosettePath(cx: number, cy: number, radius: number, petals: number, depth: number, steps = petals * 24): string {
  const n = Math.max(3, Math.round(petals));
  const d = Math.min(1, Math.max(0, depth));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = radius * (1 - (d / 2) * (1 + Math.cos(n * a)));
    pts.push(`${i ? 'L' : 'M'}${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`);
  }
  return `${pts.join('')}Z`;
}

/** A band of waves across `width`, centred on `y`: one line of a woven border. `phase` shifts it along. */
export function wavePath(width: number, y: number, amplitude: number, waves: number, phase = 0, steps = Math.max(8, Math.round(waves * 16))): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push(`${i ? 'L' : 'M'}${f(u * width)} ${f(y + Math.sin(u * waves * Math.PI * 2 + phase) * amplitude)}`);
  }
  return pts.join('');
}

/** Several rosettes on one centre, each a little smaller and turned: the classic woven medallion. */
export function medallion(cx: number, cy: number, radius: number, rings = 5): string[] {
  return Array.from({ length: rings }, (_, i) => rosettePath(cx, cy, radius * (1 - i * 0.13), 9 + i * 2, 0.28 + i * 0.05));
}
