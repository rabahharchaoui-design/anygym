import type { Load } from '../../db/types';
import type { DemoImages } from '../../lib/exerciseInfo';
import { useRef } from 'react';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { useInView } from '../../hooks/useInView';
import { DemoFrames } from '../../components/exercise/FormDemo';
import styles from './Thumb.module.css';

type Props = {
  name: string;
  /** Known load type: a simple drawing of the equipment (certain); unknown: the initials. */
  loadType: Load['kind'] | undefined;
  size?: 'row' | 'hero';
  /** View transition name: the tile that grows into (or back from) the exercise hero. */
  vtName?: string;
  /**
   * The exercise's sure demo (PLAN 2.2d round 2, critic B1): the tile shows its start photo, the
   * same picture the hero shows, so the shared transition moves a photo into a photo.
   */
  photo?: DemoImages | null;
  /** PLAN 3.5h: false keeps the start photo still (default: it moves while on screen). */
  moving?: boolean;
  /** No load type known: a neutral drawing instead of the name's initials (the muscle list, gate round 2). */
  neutral?: boolean;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/**
 * Placeholder for the form demo (PLAN 1.7c): demos arrive with the catalog (session 2), and a
 * wrong picture is the worst bug (SPEC 4.3). So: a calm tile with the equipment it is done with,
 * which the load type makes certain, or the exercise's initials when that is not known.
 */
export function Thumb({ name, loadType, size = 'row', vtName, photo, neutral = false, moving = true }: Props) {
  const photos = useDemoPhotos(photo ?? null);
  const ref = useRef<HTMLSpanElement>(null);
  // Online the hero's own pictures, offline only a kept copy; none kept: the drawing, never a broken picture.
  const shown = !!photo && (photos.kind === 'net' || (photos.kind === 'cache' && !!photos.urls[0]));
  // PLAN 3.5h: the same moving demo as the exercise screen, but only while the tile is on screen.
  const inView = useInView(ref, shown && moving);
  return (
    <span
      ref={ref}
      className={styles.tile}
      data-size={size}
      data-photo={shown ? '' : undefined}
      aria-hidden="true"
      data-testid="thumb"
      style={vtName ? { viewTransitionName: vtName } : undefined}
    >
      {shown && photo ? (
        <DemoFrames demo={photo} photos={photos} fit="cover" still={!moving || !inView} />
      ) : loadType ? (
        <Glyph kind={loadType} />
      ) : neutral ? (
        <NeutralGlyph />
      ) : (
        <span className={styles.letters}>{initials(name)}</span>
      )}
    </span>
  );
}

/** Any exercise, no equipment claimed: a simple pulse line. */
function NeutralGlyph() {
  return (
    <svg viewBox="0 0 48 48" className={styles.glyph} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 26h8l4-10 6 18 5-12 3 4h10" />
    </svg>
  );
}

function Glyph({ kind }: { kind: Load['kind'] }) {
  const common = { viewBox: '0 0 48 48', className: styles.glyph, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (kind) {
    case 'barbell':
      return (
        <svg {...common}>
          <path d="M6 24h36" />
          <rect x="10" y="14" width="5" height="20" rx="1.5" />
          <rect x="33" y="14" width="5" height="20" rx="1.5" />
          <rect x="15.5" y="17" width="3" height="14" rx="1" />
          <rect x="29.5" y="17" width="3" height="14" rx="1" />
        </svg>
      );
    case 'dumbbell_each':
      return (
        <svg {...common}>
          <path d="M17 24h14" />
          <rect x="9" y="16" width="8" height="16" rx="2.5" />
          <rect x="31" y="16" width="8" height="16" rx="2.5" />
        </svg>
      );
    case 'single':
      return (
        <svg {...common}>
          <path d="M18 18a6 6 0 0 1 12 0" />
          <path d="M14 30a10 10 0 0 1 20 0v4a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" />
        </svg>
      );
    case 'stack':
      return (
        <svg {...common}>
          <path d="M24 6v8" />
          <rect x="14" y="14" width="20" height="5" rx="1.5" />
          <rect x="14" y="21" width="20" height="5" rx="1.5" />
          <rect x="14" y="28" width="20" height="5" rx="1.5" />
          <rect x="14" y="35" width="20" height="5" rx="1.5" />
        </svg>
      );
    case 'plate_machine':
      return (
        <svg {...common}>
          <path d="M8 36h32" />
          <path d="M14 36V20" />
          <circle cx="14" cy="20" r="0.5" />
          <rect x="18" y="12" width="5" height="18" rx="1.5" />
          <path d="M23 21h12" />
        </svg>
      );
    case 'bodyweight':
      return (
        <svg {...common}>
          <circle cx="24" cy="11" r="4" />
          <path d="M24 16v13M15 22h18M24 29l-6 11M24 29l6 11" />
        </svg>
      );
    case 'timed':
      return (
        <svg {...common}>
          <circle cx="24" cy="27" r="12" />
          <path d="M24 27v-6M20 9h8M24 9v6" />
        </svg>
      );
  }
}
