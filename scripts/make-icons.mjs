// Generates the AnyGym app icons from one vector mark (PLAN 3.5t, Titanium Glass).
// Mark (G's pick, v1): a titanium "A" whose crossbar is a glowing ice blue barbell, on a graphite tile.
// The drawing is vector only (never an AI picture). Run: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = new URL('../public/icons/', import.meta.url);

const BARBELL = `<rect x="295" y="528" width="433" height="34" rx="8"/><rect x="103" y="528" width="47" height="34" rx="8"/><rect x="873" y="528" width="47" height="34" rx="8"/>
<rect x="160" y="477" width="50" height="138" rx="10"/><rect x="222" y="445" width="63" height="196" rx="10"/><rect x="737" y="445" width="63" height="196" rx="10"/><rect x="812" y="477" width="50" height="138" rx="10"/>`;

// scale: how much of the tile the mark fills (maskable keeps it inside the 80% safe circle).
// glow: the soft bloom round the barbell; off for the favicon, where it only muddies 16 px.
function svg(scale, { glow = true } = {}) {
  const t = (1 - scale) * 512; // keep centered
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34383f"/><stop offset=".55" stop-color="#16181c"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient>
<radialGradient id="hl" cx=".5" cy="0" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="ti" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f9fb"/><stop offset=".35" stop-color="#a7b0bb"/><stop offset=".55" stop-color="#eef1f4"/><stop offset=".8" stop-color="#7d8692"/><stop offset="1" stop-color="#c9d0d8"/></linearGradient>
<linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6ecff"/><stop offset=".5" stop-color="#9fd3ff"/><stop offset="1" stop-color="#6fb6f0"/></linearGradient>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity=".55"/></filter>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#hl)"/>
<g transform="translate(${t} ${t}) scale(${scale})">
<g fill="url(#ti)" filter="url(#shadow)"><path d="M252 742 L462 296 Q468 284 482 284 L538 284 Q552 284 558 296 L765 742 L685 742 L510 358 L335 742 Z"/></g>
<g fill="none" stroke="#14161a" stroke-width="22">${BARBELL}</g>
<g fill="url(#ice)"${glow ? ' filter="url(#glow)"' : ''}>${BARBELL}</g>
</g>
</svg>`;
}

await mkdir(out, { recursive: true });
const png = (s, size, name) =>
  sharp(Buffer.from(svg(s)), { density: 96 }).resize(size, size).png().toFile(fileURLToPath(new URL(name, out)));

await png(1, 180, 'apple-touch-icon-180.png');
await png(1, 192, 'icon-192.png');
await png(1, 512, 'icon-512.png');
await png(0.78, 512, 'icon-512-maskable.png');
await png(1, 1024, 'logo-1024.png');
await writeFile(new URL('favicon.svg', out), svg(1, { glow: false }));
console.log('icons written to public/icons');
