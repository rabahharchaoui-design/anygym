// Exercise photos offline (gate s2 finding 1). The demo photos are not precached (PLAN 2.3: 13 MB
// would make the first visit slow), so offline a photo the phone never kept cannot load, and an
// <img> that fails logs an error in WebKit. So offline, a photo is only ever drawn from the cache:
// each frame is looked up first, and a frame the cache does not hold is simply not drawn.

/** One picture: its candidate URLs, preferred first (WebP, then its JPG twin). */
export type Frame = readonly string[];

type Match = (url: string) => Promise<unknown>;

const defaultMatch: Match = (url) => (typeof caches === 'undefined' ? Promise.resolve(undefined) : caches.match(url));

/** For each frame, the first candidate the cache holds, or null. Never throws, never fetches. */
export async function cachedFrames(frames: readonly Frame[], match: Match = defaultMatch): Promise<(string | null)[]> {
  return Promise.all(
    frames.map(async (cands) => {
      for (const url of cands) {
        try {
          if (await match(url)) return url;
        } catch {
          // Storage unreadable: treat as not kept.
        }
      }
      return null;
    }),
  );
}

/** Lookups already answered this run, so a view opened again offline draws at once (no flash). */
const answered = new Map<string, (string | null)[]>();
export const framesKey = (frames: readonly Frame[]) => frames.map((f) => f.join('|')).join('||');
export const knownFrames = (key: string) => answered.get(key);
export const rememberFrames = (key: string, urls: (string | null)[]) => void answered.set(key, urls);
/** Back online: photos shown from now on get kept, so earlier offline answers may be stale. */
export const forgetFrames = () => answered.clear();
