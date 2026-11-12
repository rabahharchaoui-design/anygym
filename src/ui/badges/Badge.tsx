import { useId } from 'react';
import { BadgeGlyph } from './BadgeGlyph';
import { badgeLabel, milestoneStuds, numberSize, shapeOf, type BadgeFamily } from './families';
import { MEDALS } from './shapes';
import styles from './Badge.module.css';

export type BadgeProps = {
  family: BadgeFamily;
  /** The real name ("First workout", "7 day streak"): read out, and written under the medal when `caption` is on. */
  name: string;
  /** The real number, drawn inside the medal as live text (a streak's days, a level, 10/25/50/100). */
  value?: string | number;
  /** Not earned yet: dark smoked glass, no glow. */
  locked?: boolean;
  /** The medal's width and height in points, 32 to 160. */
  size?: number;
  /** Write the name under the medal. */
  caption?: boolean;
  className?: string;
};

const mix = (a: string, pct: number, b: string) => `color-mix(in srgb, var(--${a}) ${pct}%, ${b === 'transparent' ? b : `var(--${b})`})`;
const stop = (offset: number, color: string, opacity = 1) => <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />;

/**
 * One achievement medal (PLAN 3.6h), drawn as vector in the Titanium Glass look: a brushed titanium
 * body in the family's shape, a frosted glass inlay, one ice blue glow. Locked is dark smoked
 * glass. The name and the number are live text in the app type, never part of the art. Every
 * colour is a token, so a theme change repaints it.
 */
export function Badge({ family, name, value, locked = false, size = 64, caption = false, className }: BadgeProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const px = Math.max(32, Math.min(160, size));
  const medal = MEDALS[shapeOf(family)];
  const [cx, cy] = medal.center;
  const text = value === undefined || value === '' ? null : String(value);
  const studs = family === 'milestone' && text ? milestoneStuds(Number(text)) : 0;
  const fine = px >= 56; // the brushing and the studs are too fine to read on a small medal
  const url = (name: string) => `url(#${id}${name})`;

  return (
    <span className={`${styles.badge} ${className ?? ''}`} role="img" aria-label={badgeLabel({ name, value, locked })} data-badge={family} data-locked={locked || undefined} data-testid="badge">
      <svg className={styles.medal} width={px} height={px} viewBox="-8 -8 116 116" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="1">
            {locked ? (
              <>
                {stop(0, mix('white', 18, 'surface-solid'))}
                {stop(0.5, 'var(--surface-solid)')}
                {stop(1, 'var(--bg)')}
              </>
            ) : (
              <>
                {stop(0, mix('white', 90, 'pair'))}
                {stop(0.3, 'var(--pair)')}
                {stop(0.52, 'var(--text-3)')}
                {stop(0.7, 'var(--pair)')}
                {stop(1, mix('text-3', 55, 'bg'))}
              </>
            )}
          </linearGradient>
          <linearGradient id={`${id}edge`} x1="0" y1="0" x2="0" y2="1">
            {stop(0, 'var(--white)', locked ? 0.28 : 0.95)}
            {stop(0.5, 'var(--white)', 0.05)}
            {stop(1, 'var(--black)', 0.45)}
          </linearGradient>
          <linearGradient id={`${id}glass`} x1="0" y1="0" x2="0" y2="1">
            {stop(0, locked ? mix('white', 9, 'bg') : mix('accent', 30, 'bg-top'))}
            {stop(0.55, locked ? 'var(--bg)' : 'var(--surface-solid)')}
            {stop(1, 'var(--bg)')}
          </linearGradient>
          <radialGradient id={`${id}glow`}>
            {stop(0.55, 'var(--accent)', 0.34)}
            {stop(1, 'var(--accent)', 0)}
          </radialGradient>
          <pattern id={`${id}brush`} width="100" height="1.7" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
            <rect width="100" height="0.55" style={{ fill: 'var(--white)' }} opacity="0.2" />
          </pattern>
        </defs>
        {!locked && <circle cx={cx} cy={cy} r={57 - Math.abs(50 - cy)} fill={url('glow')} />}
        <path d={medal.body} fill={url('body')} />
        {fine && !locked && <path d={medal.body} fill={url('brush')} />}
        <path d={medal.body} fill="none" stroke={url('edge')} strokeWidth={1.6} />
        <g transform={medal.inlayTransform}>
          <path d={medal.inlay} fill={url('glass')} />
          <path d={medal.inlay} fill="none" strokeWidth={medal.inlayTransform ? 2 : 1.4} style={{ stroke: locked ? 'var(--hairline-strong)' : 'var(--accent)' }} opacity={locked ? 1 : 0.8} />
        </g>
        <g className={styles.ink}>
          {text ? (
            <text className={`${styles.number} num`} x={cx} y={cy - (studs && fine ? 2 : 0)} dy="0.36em" textAnchor="middle" fontSize={Math.min(numberSize(text), medal.room * 0.95)} data-testid="badge-number">
              {text}
            </text>
          ) : (
            <BadgeGlyph family={family} x={cx} y={cy} scale={medal.room / 24} />
          )}
          {fine && Array.from({ length: studs }, (_, i) => <circle key={i} cx={cx + (i - (studs - 1) / 2) * 6} cy={cy + 17} r={1.7} fill="currentColor" />)}
        </g>
      </svg>
      {caption && <span className={styles.name}>{name}</span>}
    </span>
  );
}
