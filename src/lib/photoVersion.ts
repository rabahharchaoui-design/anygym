// Exercise photo URLs carry a version (PLAN 4.4b 12). The service worker keeps photos CacheFirst
// (vite.config.ts) and the background save skips a photo it has (photoWarm.ts): with a fixed path a
// changed photo never reached a phone that had the old one.
// PLAN 4.6c (2): each photo file has its own version, a short hash of its bytes made at build time
// (scripts/photo-hashes.mjs). One changed photo is one new URL; every other photo keeps its URL, so
// the phone downloads only that one again. Pure.

/** The service worker's rule for exercise photos: the path, with or without the version. */
export const PHOTO_URL_PATTERN = /\/ex\/[^/]+\/[01]\.(?:webp|jpg)(?:\?v=[0-9a-z]+)?$/;

/** The files of one exercise's photos, in the order of their hashes in the table. */
export const PHOTO_FRAMES = ['0.jpg', '0.webp', '1.jpg', '1.webp'] as const;

/**
 * The build's table, kept as one short string: `dir:h,h,h,h;dir:h,h,h,h` with the hashes in
 * PHOTO_FRAMES order (an empty hash where the file is missing). A string, not an object, so it
 * stays a few KB in the first download.
 */
export function encodePhotoHashes(dirs: Record<string, ReadonlyArray<string | null>>): string {
  return Object.keys(dirs)
    .sort()
    .map((dir) => `${dir}:${PHOTO_FRAMES.map((_, i) => dirs[dir]![i] ?? '').join(',')}`)
    .join(';');
}

/** Reads the table back: photo path (ex/dir/0.webp) to its hash. */
export function decodePhotoHashes(table: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of table ? table.split(';') : []) {
    const [dir, hashes] = entry.split(':');
    if (!dir || !hashes) continue;
    hashes.split(',').forEach((h, i) => {
      if (/^[0-9a-z]{4,16}$/.test(h)) out.set(`ex/${dir}/${PHOTO_FRAMES[i]}`, h);
    });
  }
  return out;
}

/** Only exercise photos (ex/...) are versioned; with no version the path is as it was. */
export function versionedAsset(path: string, version: string): string {
  return version && path.startsWith('ex/') ? `${path}?v=${version}` : path;
}

/**
 * The photo's own version from the build's table. With no table (unit tests) every photo shares
 * `fallback`; a photo the table does not know goes without a version.
 */
export function photoVersionOf(path: string, table: Map<string, string> | null, fallback: string): string {
  if (!table) return fallback;
  return table.get(path) ?? '';
}
