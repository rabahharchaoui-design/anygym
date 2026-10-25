// WCAG AA text contrast (SPEC 13.3, PLAN 1.7i (11)): every piece of enabled, visible text on the
// screen as it is now, against the background it is really drawn on.
//   - Colors are read by painting them (canvas), so any CSS color syntax (oklch, color-mix, rgba)
//     resolves to the sRGB the phone shows.
//   - The text color's alpha and every ancestor's opacity fade the text toward its background.
//   - The background is composited from the element up: translucent layers over the next opaque
//     one, or the page's own background when none is opaque.
//   - A background image or gradient under the text cannot be judged here: that text is reported
//     as skipped (for the log), never silently passed as checked.
//   - Disabled controls are exempt (WCAG 1.4.3), as are elements fully hidden or clipped away.
// AA: 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold).
import { expect, type Page } from '../fixtures';

export type ContrastReport = { checked: number; skipped: string[]; problems: string[] };

function inspectContrast(scopeSel: string | null): ContrastReport {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const cache = new Map<string, [number, number, number, number]>();
  /** A CSS color as sRGB 0..255 and alpha 0..1, by painting it. */
  const rgba = (css: string): [number, number, number, number] => {
    const hit = cache.get(css);
    if (hit) return hit;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    // ImageData is not premultiplied: the channels are the color itself.
    const out: [number, number, number, number] = a ? [r!, g!, b!, a / 255] : [0, 0, 0, 0];
    cache.set(css, out);
    return out;
  };
  const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] => [
    top[0] * top[3] + under[0] * (1 - top[3]),
    top[1] * top[3] + under[1] * (1 - top[3]),
    top[2] * top[3] + under[2] * (1 - top[3]),
  ];
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: [number, number, number], b: [number, number, number]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const page = (() => {
    for (const e of [document.body, document.documentElement]) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) return [c[0], c[1], c[2]] as [number, number, number];
    }
    return [255, 255, 255] as [number, number, number];
  })();

  // The scope's last match: with sheets, the one on top.
  const root = (scopeSel ? [...document.querySelectorAll(scopeSel)].pop() : document.body) ?? document.body;
  const report: ContrastReport = { checked: 0, skipped: [], problems: [] };
  // Hit testing sees every layer while we look (decorations often take no taps); put back after.
  const hit = document.createElement('style');
  hit.textContent = '* { pointer-events: auto !important; }';
  document.head.append(hit);
  try {
  const label = (el: Element, text: string) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${String(el.className).split(' ')[0]?.slice(0, 28)} "${text.slice(0, 30)}"`;

  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim();
    if (!text) continue;
    if (el.closest('[inert], button:disabled, [aria-disabled="true"], fieldset:disabled, input:disabled, svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    // Clipped away entirely by a scroll or clip parent: not on the screen.
    let hidden = false;
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') hidden = true;
      opacity *= Number(s.opacity);
      if (e !== el && (s.overflowY !== 'visible' || s.overflowX !== 'visible')) {
        const q = e.getBoundingClientRect();
        if (r.bottom <= q.top || r.top >= q.bottom || r.right <= q.left || r.left >= q.right) hidden = true;
      }
    }
    if (hidden || opacity < 0.05) continue;
    // The background: what is painted under the text's middle, from the element down to the first
    // opaque layer (a pill or card drawn by a sibling counts, not just the ancestors). Off the
    // screen (scrolled away inside a scroller) it falls back to the ancestors.
    const vx = Math.min(Math.max((Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, 0), innerWidth - 1);
    const vy = Math.min(Math.max((Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2, 0), innerHeight - 1);
    const onScreen = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    let below: Element[] = [];
    if (onScreen) {
      const stack = document.elementsFromPoint(vx, vy);
      const at = stack.indexOf(el);
      if (at < 0) continue; // covered by something else (a sheet's backdrop): not what the eye reads
      below = stack.slice(at);
    } else for (let e: Element | null = el; e; e = e.parentElement) below.push(e);
    // Each layer is its possible colors: one for a plain color, every stop of a gradient (the text
    // is judged against the worst of them). An image (url) cannot be judged.
    const layers: Array<Array<[number, number, number, number]>> = [];
    let unknown: string | null = null;
    for (const e of below) {
      const s = getComputedStyle(e);
      const options: Array<[number, number, number, number]> = [];
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        if (/url\(/.test(s.backgroundImage)) {
          unknown = `background image on ${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`;
          break;
        }
        for (const m of s.backgroundImage.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8}\b)/gi) ?? []) options.push(rgba(m));
      }
      const c = rgba(s.backgroundColor);
      if (!options.length && c[3] > 0) options.push(c);
      else if (options.length && c[3] > 0) for (let i = 0; i < options.length; i++) options[i] = [...over(options[i]!, [c[0], c[1], c[2]]), Math.max(options[i]![3], c[3])];
      if (options.length) layers.push(options);
      if (options.length && options.every((o) => o[3] >= 0.999)) break;
    }
    if (unknown) {
      report.skipped.push(`${label(el, text)}: ${unknown}`);
      continue;
    }
    let bgs: Array<[number, number, number]> = [page];
    for (const options of layers.reverse()) bgs = bgs.flatMap((b) => options.map((o) => over(o, b))).slice(0, 32);
    const s = getComputedStyle(el);
    const fg = rgba(s.color);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    let got = Infinity;
    let bg = page;
    for (const b of bgs) {
      const g = ratio(over([fg[0], fg[1], fg[2], fg[3] * opacity], b), b);
      if (g < got) [got, bg] = [g, b];
    }
    report.checked++;
    if (got < need - 0.005) report.problems.push(`${label(el, text)} ${got.toFixed(2)}:1 < ${need}:1 (${s.color} on rgb(${bg.map(Math.round).join(', ')}))`);
  }
  } finally {
    hit.remove();
  }
  return report;
}

/** The contrast report of the screen as it is now (see the top of this file). */
export async function contrastReport(page: Page, scope?: string): Promise<ContrastReport> {
  return page.evaluate(inspectContrast, scope ?? null);
}

/** SPEC 13.3: every enabled text on the screen meets WCAG AA. */
export async function checkContrast(page: Page, scope?: string) {
  // Springs and fades settled (a fading element is mid way between two colors).
  await page.waitForTimeout(350);
  const r = await contrastReport(page, scope);
  expect(r.problems, 'WCAG AA text contrast').toEqual([]);
  expect(r.checked, 'some text was checked').toBeGreaterThan(0);
  return r;
}
