// Exercise photo URLs carry a version (PLAN 4.4b 12). The service worker keeps photos CacheFirst
// (vite.config.ts) and the background save skips a photo it has (photoWarm.ts): with a fixed path a
// changed photo never reached a phone that had the old one. The version is a hash of every photo's
// bytes, made at build time (vite.config.ts photoVersion): when any photo changes, every photo URL
// changes, and the phone fetches them again. Pure.

/** The service worker's rule for exercise photos: the path, with or without the version. */
export const PHOTO_URL_PATTERN = /\/ex\/[^/]+\/[01]\.(?:webp|jpg)(?:\?v=[0-9a-z]+)?$/;

/** Only exercise photos (ex/...) are versioned; with no version (dev, tests) the path is as it was. */
export function versionedAsset(path: string, version: string): string {
  return version && path.startsWith('ex/') ? `${path}?v=${version}` : path;
}
