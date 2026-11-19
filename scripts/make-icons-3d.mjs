// Exports the approved 3D icon set (PLAN 3.6i) to small WebP and AVIF files the app ships.
// Run by hand, never in the build. The sources are private design references that are not in this
// repo (a local, git ignored folder): pass the folder that holds `chatgpt/` and `higgsfield/`.
//
//   node scripts/make-icons-3d.mjs <design-ref-folder>      (or ANYGYM_DESIGN_REF=<folder>)
//   node scripts/make-icons-3d.mjs --goals <art/goal-icons folder>   (PLAN M9: only the 8 v2 goal icons)
//
// Each icon is exported once, at SCALE times the largest size its slot has on screen (SIZES below, in
// CSS px), into public/icons3d/. SCALE is 3: the iPhones this app is for draw 3 device pixels per point
// (a 2x export is soft there), and at these sizes a 3x file is still a few KB. Art that is exported ahead of its screen (run plans, passport textures) goes
// to public/icons3d/later/, which the PWA never precaches. The manifest the app and a unit test read
// is written to src/ui/icon3d/manifest.json. AI art is decoration only (SPEC: no bad data).
import sharp from 'sharp';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
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

/** The largest slot each group is drawn in, CSS px (measured on iPhone 15 and 17 Pro Max, PLAN 3.6i:
 *  goal tile 40 and 48, place card 48 and 48, style card 44 and 44). The run plans wait for Session 4. */
const SIZES = { goal: 48, place: 48, style: 44, run: 48 };
const SCALE = 3;
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

/** PLAN M9: the v2 goal icons (Monolith, art/goal-icons/ in the private art repo), art slug to app id.
 *  The tone up alternates (alt1 tape measure, alt2 hourglass) are never exported. */
const GOALS_V2 = [
  ['build-muscle', 'muscle'], ['get-stronger', 'strength'], ['lose-fat', 'fat_loss'], ['tone-up', 'tone'],
  ['stay-healthy', 'health'], ['athletic-performance', 'athletic'], ['train-for-a-race', 'race'], ['get-back-into-it', 'comeback'],
];
/** Even sizing: every mark's longest side is this share of the square, centred on its own box. */
const GOAL_MARK = 0.86;

/** `--goals <art/goal-icons folder>`: re-export only the 8 goal icons and their manifest entries. Each
 *  mark is trimmed to its visible box, scaled uniformly so its longest side is GOAL_MARK of the square,
 *  and centred on clear padding, so all 8 read the same size in their cells. */
async function exportGoalsV2(dir) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const px = SIZES.goal * SCALE;
  const side = Math.round(px * GOAL_MARK);
  for (const [slug, id] of GOALS_V2) {
    const input = sharp(join(dir, `goal-${slug}-1024.png`));
    const meta = await input.metadata();
    if (!meta.hasAlpha) throw new Error(`goal-${slug}: no alpha channel`);
    const { data, info } = await input.clone().trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
    const scale = side / Math.max(info.width, info.height);
    const w = Math.max(1, Math.round(info.width * scale));
    const h = Math.max(1, Math.round(info.height * scale));
    const mark = await sharp(data).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
    const img = sharp({ create: { width: px, height: px, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, left: Math.round((px - w) / 2), top: Math.round((px - h) / 2) }])
      .png();
    const sized = sharp(await img.toBuffer());
    const name = `goal-${id}`;
    const out2 = await both(sized);
    await writeFile(join(out, `${name}.webp`), out2.webp);
    await writeFile(join(out, `${name}.avif`), out2.avif);
    manifest[name] = { group: 'goal', path: '', slot: SIZES.goal, width: px, height: px, webp: out2.webp.length, avif: out2.avif.length };
    const before = (Math.max(info.width, info.height) / meta.width).toFixed(3);
    console.log(name.padEnd(18), `${px}px`, `mark ${w}x${h}`, `longest side ${before} -> ${(Math.max(w, h) / px).toFixed(3)}`, 'webp', out2.webp.length, 'avif', out2.avif.length);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[2] === '--goals') {
  if (!process.argv[3]) throw new Error('make-icons-3d --goals: pass the art/goal-icons folder');
  await exportGoalsV2(process.argv[3]);
  process.exit(0);
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
  const px = SIZES[group] * SCALE;
  const img = input.clone().extract({ left: crop, top: crop, width: meta.width - crop * 2, height: meta.height - crop * 2 }).resize(px, px, { kernel: 'lanczos3' });
  const name = `${group}-${id}`;
  const dir = WIRED.has(group) ? out : later;
  const data = await both(img);
  await writeFile(join(dir, `${name}.webp`), data.webp);
  await writeFile(join(dir, `${name}.avif`), data.avif);
  manifest[name] = { group, path: WIRED.has(group) ? '' : 'later/', slot: SIZES[group], width: px, height: px, webp: data.webp.length, avif: data.avif.length };
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
