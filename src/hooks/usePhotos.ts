import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../data/exerciseInfo';
import type { DemoImages } from '../lib/exerciseInfo';
import { cachedFrames, forgetFrames, framesKey, knownFrames, rememberFrames, type Frame } from '../lib/photoCache';

/**
 * How a set of photos can be drawn right now (gate s2 finding 1):
 * - net: online, draw them normally (the service worker keeps each one it serves);
 * - checking: offline, the cache is being asked (draw nothing yet);
 * - cache: offline, draw exactly these cached URLs (null: that frame is not kept, leave it out);
 * - none: offline and the first frame is not kept: show the honest no photo state instead.
 */
export type Photos = { kind: 'net' } | { kind: 'checking' } | { kind: 'cache'; urls: (string | null)[] } | { kind: 'none' };

const fromAnswer = (urls: (string | null)[]): Photos => (urls[0] ? { kind: 'cache', urls } : { kind: 'none' });

function now(frames: readonly Frame[] | null, key: string): Photos {
  if (!frames || frames.length === 0) return { kind: 'none' };
  if (typeof navigator === 'undefined' || navigator.onLine) return { kind: 'net' };
  const known = knownFrames(key);
  return known ? fromAnswer(known) : { kind: 'checking' };
}

/** The two demo frames, WebP first, then the JPG twin. */
export const demoFrames = (demo: DemoImages): Frame[] => [0, 1].map((i) => [assetUrl(demo.webp[i]!), assetUrl(demo.jpg[i]!)]);

export function usePhotos(frames: readonly Frame[] | null): Photos {
  const key = frames ? framesKey(frames) : '';
  const [st, setSt] = useState(() => ({ key, p: now(frames, key) }));
  const photos = st.key === key ? st.p : now(frames, key);
  const kind = photos.kind;
  useEffect(() => {
    let alive = true;
    if (kind === 'checking' && frames) {
      void cachedFrames(frames).then((urls) => {
        rememberFrames(key, urls);
        if (alive) setSt({ key, p: fromAnswer(urls) });
      });
    }
    // Back online: photos can load (and be kept) again.
    const onOnline = () => {
      forgetFrames();
      setSt({ key, p: now(frames, key) });
    };
    window.addEventListener('online', onOnline);
    return () => {
      alive = false;
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind]);
  return photos;
}

/** usePhotos for one exercise demo (null: no demo). */
export function useDemoPhotos(demo: DemoImages | null | undefined): Photos {
  const frames = useMemo(() => (demo ? demoFrames(demo) : null), [demo]);
  return usePhotos(frames);
}
