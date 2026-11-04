import type { SVGProps } from 'react';
import type { PlaceId } from '../../lib/places';
import { BodyweightIcon, CardioIcon, DumbbellIcon, GymIcon, HomeIcon, ICON_STROKE, TravelIcon } from '../../ui/icons';

/** A resistance band loop, drawn on Lucide's 24 grid with the same stroke (no band icon there). */
function BandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 8c0-2 2-3 3.5-3S12 6.5 12 9v6c0 2.5 1.5 4 3.5 4S19 18 19 16" />
      <path d="M19 16c0-2-2-3-3.5-3" />
      <path d="M5 8c0 2 2 3 3.5 3" />
      <path d="M3 8h4M17 16h4" />
    </svg>
  );
}

const ICONS = { home: HomeIcon, travel: TravelIcon, dumbbells: DumbbellIcon, full: GymIcon, bodyweight: BodyweightIcon, cardio: CardioIcon } as const;

/** One small line icon per place (PLAN 3.1), one stroke weight like every UI icon. */
export function PlaceIcon({ id, className }: { id: PlaceId; className?: string }) {
  if (id === 'bands') return <BandIcon className={className} aria-hidden="true" />;
  const Icon = ICONS[id];
  return <Icon className={className} strokeWidth={ICON_STROKE} aria-hidden="true" />;
}
