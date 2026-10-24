// Generates the AnyGym app icons from one SVG mark.
// Mark: two plates seen edge on lean together to form an "A"; the bar is the crossbar.
// Run: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LIME = '#D4FF3A';
const out = new URL('../public/icons/', import.meta.url);

// scale: how much of the canvas the mark fills (maskable needs to stay in the 80% safe circle)
function svg(scale, { background = true } = {}) {
  const s = scale;
  const t = (1 - s) * 256; // keep centered
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${background ? '<rect width="512" height="512" fill="#000"/>' : ''}
  <g transform="translate(${t} ${t}) scale(${s})" fill="none" stroke="${LIME}" stroke-linecap="round">
    <path d="M138 408 L256 104 L374 408" stroke-width="72" stroke-linejoin="round"/>
    <path d="M112 312 H400" stroke-width="30"/>
  </g>
</svg>`;
}

await mkdir(out, { recursive: true });
const png = (s, size, name) =>
  sharp(Buffer.from(svg(s))).resize(size, size).png().toFile(fileURLToPath(new URL(name, out)));

await png(0.82, 180, 'apple-touch-icon-180.png');
await png(0.82, 192, 'icon-192.png');
await png(0.82, 512, 'icon-512.png');
await png(0.62, 512, 'icon-512-maskable.png');
await writeFile(new URL('favicon.svg', out), svg(0.82));
console.log('icons written to public/icons');
