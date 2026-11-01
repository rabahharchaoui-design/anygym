import { useId, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { BODIES, REGION_NAMES, regionsIn, type BodyKind, type Region, type View } from '../../lib/bodyArt';
import { bodyPref } from '../../lib/bodyPref';
import type { MuscleMapData } from '../../lib/muscles';
import { Segmented } from '../../ui/Segmented';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import styles from './MuscleMap.module.css';

// SPEC 4.4 and 4.5 (PREMIUM MAP, PLAN 2.2a): one large body at a time with Front | Back and
// Male | Female switches, primary muscles in the accent with a soft glow, secondary at 40%, tap a
// muscle to name it, and the precise text line under the drawing. The component only draws what
// src/lib/muscles.ts resolved; null is the honest empty state (SPEC 4.3), never a guessed map.

const VIEWS = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
] as const satisfies { value: View; label: string }[];

const BODY_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const satisfies { value: BodyKind; label: string }[];

/** The view that opens: the one with more primary regions, front on a tie. */
export function autoView(data: MuscleMapData, body: BodyKind): View {
  const primary = (Object.keys(data.shading) as Region[]).filter((r) => data.shading[r] === 'primary');
  const count = (v: View) => {
    const has = regionsIn(body, v);
    return primary.filter((r) => has.has(r)).length;
  };
  return count('back') > count('front') ? 'back' : 'front';
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Upper chest · primary" for the tapped region, in the same words as the text line. */
export function pickLine(region: Region, data: MuscleMapData): string {
  const named = (list: MuscleMapData['primary']) =>
    [...new Set(list.filter((t) => t.regions.includes(region)).map((t) => t.label))].join(', ');
  const main = named(data.primary);
  if (main) return `${cap(main)} · primary`;
  const helper = named(data.secondary);
  if (helper) return `${cap(helper)} · secondary`;
  return `${REGION_NAMES[region]} · not used here`;
}

/** Whether a view lights anything for this exercise. */
const lit = (data: MuscleMapData, body: BodyKind, view: View) => {
  const has = regionsIn(body, view);
  return (Object.keys(data.shading) as Region[]).some((r) => has.has(r));
};

function Body({
  body,
  view,
  data,
  picked,
  glowId,
  leaving,
  onGone,
  still = false,
}: {
  body: BodyKind;
  view: View;
  data: MuscleMapData;
  picked: Region | null;
  glowId: string;
  leaving?: boolean;
  onGone?: () => void;
  /** Drawn once, not tappable, no entrance fade (the compact pair). */
  still?: boolean;
}) {
  const art = BODIES[body][view];
  const primaryPaths = art.shapes.filter((s) => s.region && data.shading[s.region] === 'primary');
  return (
    <svg
      className={`${styles.svg} ${still ? styles.still : leaving ? styles.leaving : styles.entering}`}
      viewBox={art.viewBox}
      role={leaving || still ? undefined : 'img'}
      aria-label={leaving || still ? undefined : `Muscle map, ${view} view, ${body} body. Tap a muscle to name it.`}
      aria-hidden={leaving || still ? true : undefined}
      focusable="false"
      data-view={leaving ? undefined : view}
      data-still={still || undefined}
      data-body={leaving ? undefined : body}
      onAnimationEnd={leaving ? onGone : undefined}
    >
      <path className={styles.outline} d={art.outline} />
      {primaryPaths.length > 0 && (
        <g className={styles.glow} filter={`url(#${glowId})`} aria-hidden="true">
          {primaryPaths.flatMap((s) => s.paths.map((d, i) => <path key={`${s.slug}-${i}`} d={d} />))}
        </g>
      )}
      {art.shapes.map((s) => {
        const role = s.region ? (data.shading[s.region] ?? 'body') : 'body';
        const cls = s.region
          ? `${styles.muscle} ${styles[role]} ${picked === s.region ? styles.picked : ''}`
          : s.tone === 'head'
            ? styles.head
            : styles.rest;
        return (
          <g key={s.slug} className={cls}>
            {s.paths.map((d, i) => (
              <path key={i} d={d} data-region={s.region ?? undefined} data-role={s.region ? role : undefined} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Drawing({ data }: { data: MuscleMapData }) {
  const body = useSyncExternalStore(bodyPref.subscribe, bodyPref.get, () => 'male' as BodyKind);
  const reduced = useReducedMotionLive();
  const glowId = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const key = data.text + JSON.stringify(data.shading);
  const [state, setState] = useState<{ key: string; view: View; picked: Region | null }>(() => ({
    key,
    view: autoView(data, body),
    picked: null,
  }));
  // A different exercise opens on its own best view, nothing tapped.
  if (state.key !== key) setState({ key, view: autoView(data, body), picked: null });
  const view = state.key === key ? state.view : autoView(data, body);
  const picked = state.key === key ? state.picked : null;
  const other: View = view === 'front' ? 'back' : 'front';
  const [leaving, setLeaving] = useState<{ body: BodyKind; view: View; n: number } | null>(null);

  const swap = (next: { body?: BodyKind; view?: View }) => {
    if (!reduced) setLeaving((l) => ({ body, view, n: (l?.n ?? 0) + 1 }));
    if (next.view) setState((s) => ({ ...s, view: next.view!, picked: null }));
    if (next.body) bodyPref.set(next.body);
  };

  // Any tap in the stage that is not on a muscle clears the selection.
  const onTap = (e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest('svg[data-view] [data-region]');
    const region = (el?.getAttribute('data-region') ?? null) as Region | null;
    setState((s) => ({ ...s, picked: region && region !== s.picked ? region : null }));
  };

  return (
    <>
      <div className={styles.controls}>
        <Segmented label="Side" options={VIEWS} value={view} onChange={(v) => swap({ view: v })} testId="muscle-view" />
        <Segmented label="Body" options={BODY_OPTIONS} value={body} onChange={(b) => swap({ body: b })} testId="muscle-body" />
      </div>
      <div className={styles.readout} data-testid="muscle-pick" aria-live="polite">
        {picked ? (
          <span className={styles.picking}>{pickLine(picked, data)}</span>
        ) : !lit(data, body, view) && lit(data, body, other) ? (
          <>
            <span>Worked on the {other}</span>
            <button type="button" className={`${styles.showOther} pressable`} onClick={() => swap({ view: other })}>
              Show {other}
            </button>
          </>
        ) : (
          <span>Tap a muscle to name it</span>
        )}
      </div>
      <div className={styles.stage} onClick={onTap}>
        <svg width="0" height="0" className={styles.defs} aria-hidden="true" focusable="false">
          <defs>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
          </defs>
        </svg>
        {leaving && !reduced && (
          <Body
            key={`leave-${leaving.n}`}
            body={leaving.body}
            view={leaving.view}
            data={data}
            picked={picked}
            glowId={glowId}
            leaving
            onGone={() => setLeaving(null)}
          />
        )}
        <Body key={`${body}-${view}`} body={body} view={view} data={data} picked={picked} glowId={glowId} />
      </div>
    </>
  );
}

export function MuscleMap({ data }: { data: MuscleMapData | null }) {
  if (!data) {
    return (
      <div className={styles.empty} data-testid="muscle-map-empty">
        Muscles coming soon
      </div>
    );
  }
  const drawn = Object.keys(data.shading).length > 0;
  const hasSecondary = data.secondary.length > 0;
  const primaryText = data.text.split(' · ')[0] ?? '';
  const secondaryText = hasSecondary ? data.text.slice(primaryText.length) : '';
  return (
    <figure className={styles.map} data-testid="muscle-map">
      {drawn && (
        <>
          <Drawing data={data} />
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.key}>
              <span className={`${styles.swatch} ${styles.swatchPrimary}`} />
              Primary
            </span>
            {hasSecondary && (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.key}>
                  <span className={`${styles.swatch} ${styles.swatchSecondary}`} />
                  Secondary
                </span>
              </>
            )}
          </div>
        </>
      )}
      <figcaption className={styles.text} data-testid="muscle-text">
        <span className={styles.textPrimary}>{primaryText}</span>
        {secondaryText && <span className={styles.textSecondary}>{secondaryText}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * The compact card in the workout (PLAN 2.2b): front and back side by side, small and still, in the
 * body chosen in Settings, with the plain text line. Nothing for an exercise without sure muscles
 * (SPEC 4.3): no drawing, no "coming soon", no guess. Tapping a muscle is for the full sheet.
 */
export function MusclePair({ data }: { data: MuscleMapData | null }) {
  const body = useSyncExternalStore(bodyPref.subscribe, bodyPref.get, () => 'male' as BodyKind);
  const glowId = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!data || !data.text) return null;
  const drawn = Object.keys(data.shading).length > 0;
  const primaryText = data.text.split(' · ')[0] ?? '';
  const secondaryText = data.text.slice(primaryText.length);
  return (
    <figure className={styles.pair} data-testid="muscle-pair">
      {drawn && (
        <div className={styles.pairStage} role="img" aria-label={`Muscles worked: ${data.text}`}>
          <svg width="0" height="0" className={styles.defs} aria-hidden="true" focusable="false">
            <defs>
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="14" />
              </filter>
            </defs>
          </svg>
          {(['front', 'back'] as const).map((view) => (
            <div key={view} className={styles.pairBody} aria-hidden="true">
              <Body body={body} view={view} data={data} picked={null} glowId={glowId} still />
              <span className={styles.pairLabel}>{view === 'front' ? 'Front' : 'Back'}</span>
            </div>
          ))}
        </div>
      )}
      <figcaption className={styles.pairText} data-testid="muscle-line">
        <span className={styles.textPrimary}>{primaryText}</span>
        {secondaryText && <span className={styles.textSecondary}>{secondaryText}</span>}
      </figcaption>
    </figure>
  );
}
