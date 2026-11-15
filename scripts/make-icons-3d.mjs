// Exports the approved 3D icon set (PLAN 3.6i) to small WebP and AVIF files the app ships.
// Run by hand, never in the build. The sources are private design references that are not in this
// repo (a local, git ignored folder): pass the folder that holds `chatgpt/` and `higgsfield/`.
//
//   node scripts/make-icons-3d.mjs <design-ref-folder>      (or ANYGYM_DESIGN_REF=<folder>)
//
// Each icon is exported once, at 2x the largest size its slot has on screen (SIZES below, in CSS px),
// into public/icons3d/. Art that is exported ahead of its screen (run plans, passport textures) goes
// to public/icons3d/later/, which the PWA never precaches. The manifest the app and a unit test read
// is written to src/ui/icon3d/manifest.json. AI art is decoration only (SPEC: no bad data).
import sharp from 'sharp';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2] ?? process.env.ANYGYM_DESIGN_REF;
if (!src) {
  console.error('make-icons-3d: pass the design reference folder (or set ANYGYM_DESIGN_REF).');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'public', 'icons3d');
const later = join(out, 'later');
const manifestPath = join(root, 'src', 'ui', 'icon3d', 'manifest.json');

/** The largest slot each group is drawn in, CSS px (measured on iPhone 15 and 17 Pro Max, PLAN 3.6i). */
const SIZES = { goal: 64, place: 48, style: 44, run: 64 };
/** Source number, group, id (the app's own ids: lib/intake/options.ts, lib/quickStyles/types.ts). */
const ICONS = [
  ['01', 'goal', 'muscle'], ['02', 'goal', 'strength'], ['03', 'goal', 'fat_loss'], ['04', 'goal', 'tone'],
  ['05', 'goal', 'health'], ['06', 'goal', 'athletic'], ['07', 'goal', 'race'], ['08', 'goal', 'comeback'],
  ['09', 'place', 'full'], ['10', 'place', 'hotel'], ['11', 'place', 'home'], ['12', 'place', 'outdoors'], ['13', 'place', 'mix'],
  ['14', 'style', 'circuit'], ['15', 'style', 'pump'], ['16', 'style', 'strength'], ['17', 'style', 'cardioCore'],
  ['18', 'style', 'mobility'], ['19', 'style', 'armsAbs'], ['20', 'style', 'easy'],
  ['21', 'run', 'first5k'], ['22', 'run', 'faster5k'], ['23', 'run', 'first10k'],
];
/** Groups that are on a screen today; the rest wait in later/. */
const WIRED = new Set(['goal', 'place', 'style']);
const MAX_BYTES = 40 * 1024;

const webp = (img, q = 86) => img.clone().webp({ quality: q, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
const avif = (img, q = 62) => img.clone().avif({ quality: q, effort: 9, chromaSubsampling: '4:4:4' }).toBuffer();

/** Both formats, stepping the quality down until each is under the limit. */
async function both(img, limit = MAX_BYTES) {
  let w = await webp(img);
  for (let q = 80; w.length > limit && q >= 40; q -= 10) w = await webp(img, q);
  let a = await avif(img);
  for (let q = 55; a.length > limit && q >= 25; q -= 10) a = await avif(img, q);
  return { webp: w, avif: a };
}

await mkdir(later, { recursive: true });
await mkdir(join(root, 'src', 'ui', 'icon3d'), { recursive: true });
const manifest = {};
const files = await readdir(join(src, 'chatgpt'));

for (const [num, group, id] of ICONS) {
  const file = files.find((f) => f.startsWith(`${num}_`) && f.endsWith('.png'));
  if (!file) throw new Error(`make-icons-3d: source ${num} is missing`);
  const input = sharp(join(src, 'chatgpt', file));
  const meta = await input.metadata();
  if (!meta.hasAlpha) throw new Error(`${file}: no alpha channel`);
  // Every source keeps the same clear margin round its art. One square crop for all (the union of
  // their trimmed boxes plus a little air), so the icons keep their relative scale and no glow is cut.
  const { info } = await input.clone().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const box = { left: -info.trimOffsetLeft, top: -info.trimOffsetTop, right: -info.trimOffsetLeft + info.width, bottom: -info.trimOffsetTop + info.height };
  const margin = Math.min(box.left, box.top, meta.width - box.right, meta.height - box.bottom);
  const crop = Math.max(0, Math.min(margin, 92) - 12);
  const px = SIZES[group] * 2;
  const img = input.clone().extract({ left: crop, top: crop, width: meta.width - crop * 2, height: meta.height - crop * 2 }).resize(px, px, { kernel: 'lanczos3' });
  const name = `${group}-${id}`;
  const dir = WIRED.has(group) ? out : later;
  const data = await both(img);
  await writeFile(join(dir, `${name}.webp`), data.webp);
  await writeFile(join(dir, `${name}.avif`), data.avif);
  manifest[name] = { group, path: WIRED.has(group) ? '' : 'later/', width: px, height: px, webp: data.webp.length, avif: data.avif.length };
  console.log(name.padEnd(18), `${px}px`, 'webp', data.webp.length, 'avif', data.avif.length);
}

// Passport surfaces for PLAN 4.7 (page paper, ink texture): exported and kept ready, on no screen yet.
const TEXTURES = [
  ['p2-page-paper.png', 'passport-paper', 786],
  ['p3-ink-texture.png', 'passport-ink', 640],
];
for (const [file, name, width] of TEXTURES) {
  const img = sharp(join(src, 'higgsfield', file)).resize({ width }).removeAlpha();
  const { height } = await img.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  const data = await both(img, 120 * 1024);
  await writeFile(join(later, `${name}.webp`), data.webp);
  await writeFile(join(later, `${name}.avif`), data.avif);
  manifest[name] = { group: 'passport', path: 'later/', width, height, webp: data.webp.length, avif: data.avif.length };
  console.log(name.padEnd(18), `${width}x${height}`, 'webp', data.webp.length, 'avif', data.avif.length);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const wired = Object.values(manifest).filter((m) => WIRED.has(m.group));
const sum = (k) => wired.reduce((n, m) => n + m[k], 0);
console.log(`wired: ${wired.length} icons, webp ${sum('webp')} bytes, avif ${sum('avif')} bytes`);
for (const f of await readdir(out)) if ((await stat(join(out, f))).isFile() && (await stat(join(out, f))).size > MAX_BYTES) throw new Error(`${f} is over 40 KB`);
console.log(`manifest: ${resolve(manifestPath)}`);
