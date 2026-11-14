// PLAN 3.3a round 3: body area icons for Easy on (SPEC 14 asks for icons on every chip). The focus
// tiles have their own (FocusIcons.tsx).
// No icon set has body areas, so they are drawn in house: one small front figure in a 24 box, the
// 2 unit round stroke of the app's icons, faint, with the area itself drawn at full strength.
// They take the props the chips give a Lucide icon, so a chip treats them alike.
import { forwardRef, type ReactNode, type SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';

const FIGURE = 'M7 8h10M8.5 8l.5 7h6l.5-7M7 8l-2 6M17 8l2 6M10 15l-1 7M14 15l1 7';

type Props = SVGProps<SVGSVGElement> & { size?: number | string; absoluteStrokeWidth?: boolean };

/** One drawn icon in the 24 box, with the props a chip gives a Lucide icon (so a chip treats them alike). */
export function drawnIcon(name: string, art: ReactNode): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, Props>(({ size, strokeWidth = 2, width, height, absoluteStrokeWidth: _a, ...rest }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={width ?? size ?? 24}
      height={height ?? size ?? 24}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-body={name}
      {...rest}
    >
      {art}
    </svg>
  ));
  Icon.displayName = `Body${name}`;
  return Icon as unknown as LucideIcon;
}

const make = (name: string, area: ReactNode, whole = false): LucideIcon =>
  drawnIcon(
    name,
    <>
      <g opacity={whole ? 1 : 0.4}>
        <circle cx="12" cy="4" r="2" />
        <path d={FIGURE} />
      </g>
      {area}
    </>,
  );

export const BODY_ICONS: Record<string, LucideIcon> = {
  'Body:shoulders': make('shoulders', <path d="M5.5 9.5 7 8h2M18.5 9.5 17 8h-2" />),
  'Body:lowerBack': make('lowerBack', <path d="M9.3 14h5.4" />),
  'Body:knees': make('knees', (
    <>
      <circle cx="9.5" cy="18.5" r="0.9" />
      <circle cx="14.5" cy="18.5" r="0.9" />
    </>
  )),
  'Body:wrists': make('wrists', (
    <>
      <circle cx="5" cy="14" r="0.9" />
      <circle cx="19" cy="14" r="0.9" />
    </>
  )),
  'Body:neck': make('neck', <path d="M12 6v2" />),
  'Body:hips': make('hips', <path d="M8.3 15.5h7.4" />),
};
