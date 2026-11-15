// One 3D icon from the approved set (PLAN 3.6i), in a slot the caller sizes. Decoration only: the
// tile's own words name it, so the picture is hidden from screen readers.
//   - The line icon (Lucide) is what shows first, and stays when the picture cannot load or the
//     person saves data. The picture takes its place once it has decoded: nothing is ever empty.
//   - The slot has its size before the picture arrives, so nothing moves when it does.
import { useCallback, useState, type ComponentType, type SVGProps } from 'react';
import { icon3d, icon3dUrl, wantsLessData } from './icons';
import styles from './Icon3D.module.css';

type Props = {
  /** A name in the manifest ("goal-muscle"). Unknown or not wired: only the line icon shows. */
  name: string | undefined;
  /** The line icon behind the picture. */
  fallback?: ComponentType<SVGProps<SVGSVGElement>>;
  /** The line icon's size in the slot. */
  lineSize?: number;
  className?: string;
};

const lessData = (): boolean => typeof window !== 'undefined' && wantsLessData(navigator as never, (q) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches);

export function Icon3D({ name, fallback: Line, lineSize = 24, className }: Props) {
  const entry = icon3d(name);
  const [state, setState] = useState<'wait' | 'shown' | 'failed'>('wait');
  const [skip] = useState(lessData);
  // A picture already in the cache is complete before React listens for its load.
  const seen = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setState(img.naturalWidth > 0 ? 'shown' : 'failed');
  }, []);
  const picture = entry && name && !skip && state !== 'failed';
  const base = import.meta.env.BASE_URL;
  return (
    <span className={`${styles.slot} ${className ?? ''}`} aria-hidden="true" data-icon3d={name ?? ''} data-state={picture ? state : 'line'}>
      {Line && <Line className={styles.line} width={lineSize} height={lineSize} strokeWidth={2} />}
      {picture && (
        <picture className={styles.picture}>
          <source type="image/avif" srcSet={icon3dUrl(name, 'avif', base)} />
          <img ref={seen} className={styles.img} src={icon3dUrl(name, 'webp', base)} width={entry.width} height={entry.height} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setState('shown')} onError={() => setState('failed')} />
        </picture>
      )}
    </span>
  );
}
