// Paints the share card (PLAN 4.6, SPEC 12.9) from lib/run/poster.ts onto a canvas. It only draws
// what the Poster holds: the line (privacy zone already cut off), the city when there is one, the
// numbers and the AnyGym mark. No map, no date, no name. Colours come from the tokens.
import type { Poster } from '../../lib/run';

export const POSTER_W = 1080;
export const POSTER_H = 1350;

type Colors = { bg: string; text: string; text2: string; accent: string };

function colors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const read = (token: string) => css.getPropertyValue(token).trim();
  return { bg: read('--bg'), text: read('--text'), text2: read('--text-2'), accent: read('--accent') };
}

/** Paints `poster` on `canvas` (it is resized to POSTER_W by POSTER_H). */
export function drawPoster(canvas: HTMLCanvasElement, poster: Poster): void {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = colors();
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  const pad = 84;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (poster.city) {
    ctx.fillStyle = c.text2;
    ctx.font = `600 46px ${font}`;
    ctx.fillText(poster.city, pad, pad + 40, POSTER_W - pad * 2);
  }

  // The line sits in a square under the city, centred.
  // A square that ends above the big distance, so the line never runs into the numbers.
  const box = 760;
  const left = (POSTER_W - box) / 2;
  const top = 170;
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const piece of poster.lines) {
    ctx.beginPath();
    piece.forEach((p, i) => (i === 0 ? ctx.moveTo(left + p.x * box, top + p.y * box) : ctx.lineTo(left + p.x * box, top + p.y * box)));
    ctx.stroke();
  }
  if (poster.lines.length === 0 && poster.note) {
    ctx.fillStyle = c.text2;
    ctx.font = `500 40px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(poster.note, POSTER_W / 2, top + box / 2);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = c.text;
  ctx.font = `700 150px ${font}`;
  ctx.fillText(poster.distance, pad, 1130, POSTER_W - pad * 2);
  ctx.fillStyle = c.text2;
  ctx.font = `600 52px ${font}`;
  ctx.fillText(`${poster.time}   ${poster.pace}`, pad, 1210, POSTER_W - pad * 2);

  ctx.fillStyle = c.accent;
  ctx.font = `700 44px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText(poster.mark, POSTER_W - pad, 1270);
  if (poster.note && poster.lines.length > 0) {
    ctx.fillStyle = c.text2;
    ctx.font = `500 34px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillText(poster.note, pad, 1270);
  }
}

/** The card as a PNG file, or null when the phone cannot make one. */
export function posterFile(poster: Poster, name: string): Promise<File | null> {
  const canvas = document.createElement('canvas');
  drawPoster(canvas, poster);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? new File([b], name, { type: 'image/png' }) : null), 'image/png'));
}
