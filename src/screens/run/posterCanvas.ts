// Paints the share card (PLAN 4.6, SPEC 12.9) from lib/run/poster.ts onto a canvas. It only draws
// what the Poster holds: the line (privacy zone already cut off), the city when there is one, the
// numbers, the privacy note and the AnyGym mark. No map, no date, no name.
// PLAN M3: the Monolith poster (round 2 board 09): flat graphite, the route as a bold square ended
// ice blue line in the top part, the city as a small tracked label, the distance as the hero number,
// a hairline, then time and pace heavy and white, the mark at the foot. Colours come from the
// tokens; sizes follow the SPEC 10 type scale at the card's 1080 px width (2.5x a 430 px phone).
import type { Poster } from '../../lib/run';

export const POSTER_W = 1080;
export const POSTER_H = 1350;

/** The card's layout, in card pixels. Type sizes are the SPEC 10 scale times 2.5. */
const L = {
  pad: 72, // the side margin (28 px at 430, x2.5)
  box: 720, // the square the line is fitted in
  boxTop: 72,
  line: 16, // the route's stroke
  cityY: 878,
  citySize: 30, // section label, 12 px x2.5
  cityTrack: 0.14, // em
  distY: 1078,
  distSize: 250, // hero number, capped so 99.99 fits the width
  distTrack: -0.035, // a touch looser than the app's -5%: at 250 px two 9s would touch
  unitSize: 72,
  ruleY: 1118,
  statY: 1214,
  statSize: 84,
  statTrack: -0.03,
  statGap: 72,
  footY: 1296,
  footSize: 32,
  markTrack: 0.14,
} as const;

type Colors = { bg: string; text: string; text2: string; accent: string; hairline: string };

function colors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const read = (token: string) => css.getPropertyValue(token).trim();
  return { bg: read('--bg'), text: read('--text'), text2: read('--text-2'), accent: read('--accent'), hairline: read('--hairline') };
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

/** Letter spacing where the browser has it (Safari 18 and newer); plain spacing elsewhere. */
const track = (ctx: Ctx, em: number, px: number) => {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(em * px).toFixed(1)}px`;
};

/** The largest size up to `max` at which `text` fits `width` (layout only: it measures, it never changes the text). */
function fitSize(ctx: Ctx, text: string, weight: number, max: number, width: number, family: string): number {
  ctx.font = `${weight} ${max}px ${family}`;
  const w = ctx.measureText(text).width;
  return w <= width ? max : Math.floor((max * width) / w);
}

/** A number and its printed unit ("99.99 mi", "6:11 /km"), drawn as two runs: the unit smaller and grey. */
function splitUnit(printed: string): [string, string] {
  const at = printed.lastIndexOf(' ');
  return at > 0 ? [printed.slice(0, at), printed.slice(at + 1)] : [printed, ''];
}

/** Draws `value unit` from `x` on `y`; returns the x where it ends. */
function numberWithUnit(ctx: Ctx, c: Colors, family: string, printed: string, x: number, y: number, size: number, unitSize: number, tracking: number): number {
  const [value, unit] = splitUnit(printed);
  ctx.fillStyle = c.text;
  ctx.font = `900 ${size}px ${family}`;
  track(ctx, tracking, size);
  ctx.fillText(value, x, y);
  let end = x + ctx.measureText(value).width;
  if (unit) {
    ctx.fillStyle = c.text2;
    ctx.font = `700 ${unitSize}px ${family}`;
    track(ctx, 0, unitSize);
    const gap = unitSize * 0.25;
    ctx.fillText(unit, end + gap, y);
    end += gap + ctx.measureText(unit).width;
  }
  return end;
}

/** Paints `poster` on `canvas` (it is resized to POSTER_W by POSTER_H). */
export function drawPoster(canvas: HTMLCanvasElement, poster: Poster): void {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return;
  const c = colors();
  const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const width = POSTER_W - L.pad * 2;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // The line, in a square at the top, centred: square ends and corners, like the app's shapes.
  const left = (POSTER_W - L.box) / 2;
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = L.line;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  for (const piece of poster.lines) {
    ctx.beginPath();
    piece.forEach((p, i) => (i === 0 ? ctx.moveTo(left + p.x * L.box, L.boxTop + p.y * L.box) : ctx.lineTo(left + p.x * L.box, L.boxTop + p.y * L.box)));
    ctx.stroke();
  }
  if (poster.lines.length === 0 && poster.note) {
    ctx.fillStyle = c.text2;
    ctx.font = `600 ${L.footSize * 1.25}px ${family}`;
    ctx.textAlign = 'center';
    ctx.fillText(poster.note, POSTER_W / 2, L.boxTop + L.box / 2, width);
    ctx.textAlign = 'left';
  }

  if (poster.city) {
    ctx.fillStyle = c.text2;
    ctx.font = `600 ${L.citySize}px ${family}`;
    track(ctx, L.cityTrack, L.citySize);
    ctx.fillText(poster.city.toUpperCase(), L.pad, L.cityY, width);
  }

  // The distance: the hero, as big as the width allows.
  const [dist, distUnit] = splitUnit(poster.distance);
  ctx.font = `700 ${L.unitSize}px ${family}`;
  const unitW = distUnit ? ctx.measureText(distUnit).width + L.unitSize * 0.25 : 0;
  const distSize = fitSize(ctx, dist, 900, L.distSize, width - unitW, family);
  numberWithUnit(ctx, c, family, poster.distance, L.pad - distSize * 0.04, L.distY, distSize, L.unitSize, L.distTrack);

  ctx.fillStyle = c.hairline;
  ctx.fillRect(L.pad, L.ruleY, width, 2);

  const timeEnd = numberWithUnit(ctx, c, family, poster.time, L.pad, L.statY, L.statSize, L.statSize * 0.45, L.statTrack);
  numberWithUnit(ctx, c, family, poster.pace, timeEnd + L.statGap, L.statY, L.statSize, L.statSize * 0.45, L.statTrack);

  ctx.font = `600 ${L.footSize}px ${family}`;
  if (poster.note && poster.lines.length > 0) {
    ctx.fillStyle = c.text2;
    track(ctx, 0, L.footSize);
    ctx.textAlign = 'left';
    ctx.fillText(poster.note, L.pad, L.footY, width * 0.6);
  }
  ctx.fillStyle = c.text2;
  ctx.font = `700 ${L.footSize}px ${family}`;
  track(ctx, L.markTrack, L.footSize);
  ctx.textAlign = 'right';
  ctx.fillText(poster.mark, POSTER_W - L.pad, L.footY);
  track(ctx, 0, L.footSize);
}

/** The card as a PNG file, or null when the phone cannot make one. */
export function posterFile(poster: Poster, name: string): Promise<File | null> {
  const canvas = document.createElement('canvas');
  drawPoster(canvas, poster);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? new File([b], name, { type: 'image/png' }) : null), 'image/png'));
}
