import type { BadgeFamily } from './families';

/** The small line drawing inside a medal that carries no number, in a 28 unit box round 0,0. */
const GLYPH: Record<BadgeFamily, string> = {
  // a dumbbell
  first_workout: 'M-9 0H9M-9-7V7M9-7V7M-14-4V4M14-4V4',
  // a flame
  streak: 'M0-12C2-5 9-1 9 5A9 9 0 0 1-9 5C-9 1-7-2-5-5C-4-1-2 0-1-2C0-5-1-9 0-12Z',
  // a bar raised, and the arrow that passed it
  pr: 'M-10-11H10M0 12V-4M-7 3L0-4L7 3',
  // a star
  milestone: 'M0-12L3.5-4.5L11.5-3.7L5.5 1.8L7.2 9.8L0 5.6L-7.2 9.8L-5.5 1.8L-11.5-3.7L-3.5-4.5Z',
  // a route to a finish
  first_run: 'M-11 9C-2 9-6-1 2-1S5-10 11-10',
  // a skyline
  new_city: 'M-13 9H13M-10 9V-1H-4V9M-4 9V-10H4V9M4 9V2H10V9',
  // rank chevrons
  level: 'M-10 0L0-9L10 0M-10 9L0 0L10 9',
};

export function BadgeGlyph({ family, x, y, scale }: { family: BadgeFamily; x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d={GLYPH[family]} />
      {family === 'first_run' && <circle cx={11} cy={-10} r={2.4} fill="currentColor" stroke="none" />}
    </g>
  );
}
