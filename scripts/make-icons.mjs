// Makes the AnyGym app icons (PLAN M8) from G's "Diagonal" icon (Monolith B06, Nov 19 9 PM; it replaced "Loaded Bar").
// The art lives in a private repo, never in this one: fetch its art/app-icon/ folder to a temp dir
// first, then run:  npm run icons -- /tmp/some-dir   (the folder holding app-icon-1024.png and app-icon-180.png)
// Every file written is opaque RGB on pure black (iOS masks the corners itself).
import sharp from 'sharp';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/make-icons.mjs <folder with app-icon-1024.png and app-icon-180.png>');
  process.exit(1);
}
const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
const master = join(src, 'app-icon-1024.png');
const BLACK = { r: 0, g: 0, b: 0 };

/** The master at `size` px, flattened on black, no alpha channel. */
const opaque = (img) => img.flatten({ background: BLACK }).removeAlpha().png({ compressionLevel: 9 });
const square = (size, name) => opaque(sharp(master).resize(size, size, { kernel: 'lanczos3' })).toFile(join(out, name));

await mkdir(out, { recursive: true });
// The 180 px Home Screen icon is G's own export, used as given.
await copyFile(join(src, 'app-icon-180.png'), join(out, 'apple-touch-icon-180.png'));
await square(192, 'icon-192.png');
await square(512, 'icon-512.png');
await square(32, 'favicon-32.png');
await square(48, 'favicon-48.png');
// Maskable: the master at 80% (410 px) centred on pure black, so the bar sits inside the safe circle.
const inner = await sharp(master).resize(410, 410, { kernel: 'lanczos3' }).toBuffer();
await opaque(sharp(inner).extend({ top: 51, bottom: 51, left: 51, right: 51, background: BLACK })).toFile(join(out, 'icon-512-maskable.png'));
console.log('icons written to public/icons');
