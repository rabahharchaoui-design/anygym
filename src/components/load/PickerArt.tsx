// The one small picture above each weight picker (SPEC 13.6): clean line drawings, one object,
// never a stack of icons. Text colour lines with the lime accent on the part you hold.
import type { CSSProperties, ReactNode } from 'react';

const ACC: CSSProperties = { stroke: 'var(--accent)' };

function Pic({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      width="64"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-picture={label}
    >
      {children}
    </svg>
  );
}

/** One dumbbell, side on: heads, collars and the handle. */
export function DumbbellPicture() {
  return (
    <Pic label="dumbbell">
      <rect x={6} y={10} width={7} height={20} rx={2.5} />
      <rect x={13} y={6} width={7} height={28} rx={2.5} />
      <rect x={44} y={6} width={7} height={28} rx={2.5} />
      <rect x={51} y={10} width={7} height={20} rx={2.5} />
      <path d="M20 20H44" strokeWidth={3} style={ACC} />
    </Pic>
  );
}

/** One dumbbell held on end, as in a goblet squat. */
export function UprightDumbbellPicture() {
  return (
    <Pic label="upright dumbbell">
      <rect x={20} y={2} width={24} height={7} rx={2.5} />
      <rect x={23} y={9} width={18} height={5} rx={2} />
      <path d="M32 14V26" strokeWidth={3} style={ACC} />
      <rect x={23} y={26} width={18} height={5} rx={2} />
      <rect x={20} y={31} width={24} height={7} rx={2.5} />
    </Pic>
  );
}

/** One kettlebell. */
export function KettlebellPicture() {
  return (
    <Pic label="kettlebell">
      <path d="M23 15C20 0 44 0 41 15" strokeWidth={3} style={ACC} />
      <path d="M25 37A14 14 0 1 1 39 37Z" />
    </Pic>
  );
}
