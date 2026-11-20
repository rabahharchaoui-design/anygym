import { assetUrl } from '../../data/exerciseInfo';
import type { DemoImages } from '../../lib/exerciseInfo';
import type { Photos } from '../../hooks/usePhotos';

/**
 * One picture: WebP with a JPG fallback online; offline only the URL the cache holds, so nothing
 * ever fails to load (gate s2: a failed load logs an error in WebKit). Sized by its box, so nothing
 * shifts when it loads.
 */
export function Picture({ demo, i, photos, className, alt, lazy = true, fill = false, sync = false }: { demo: DemoImages; i: number; photos: Photos; className: string; alt: string; lazy?: boolean; fill?: boolean; sync?: boolean }) {
  // The blurred fill behind the hero is not a frame of the demo.
  const frame = fill ? undefined : i;
  // The hero's sharp photo decodes with the page (round 3): it is in the screen change's snapshot.
  const decoding = sync ? 'sync' : 'async';
  if (photos.kind === 'net') {
    return (
      <picture className={className} data-frame={frame} data-hero-fill={fill || undefined} aria-hidden={alt ? undefined : true}>
        <source srcSet={assetUrl(demo.webp[i]!)} type="image/webp" />
        <img src={assetUrl(demo.jpg[i]!)} alt={alt} loading={lazy ? 'lazy' : undefined} decoding={decoding} width={640} height={427} draggable={false} />
      </picture>
    );
  }
  const url = photos.kind === 'cache' ? (photos.urls[i] ?? null) : null;
  // Not kept (or still asking the cache): the frame stays empty, never a broken picture.
  if (!url) return i === 0 ? <span className={className} data-frame={frame} data-hero-fill={fill || undefined} aria-hidden="true" /> : null;
  return (
    <picture className={className} data-frame={frame} data-hero-fill={fill || undefined} aria-hidden={alt ? undefined : true}>
      <img src={url} alt={alt} decoding={decoding} width={640} height={427} draggable={false} />
    </picture>
  );
}
