// Worked lately on Today (PLAN 3.8, competitor gap 4; 3.5g: the honest title and legend): front and
// back, each muscle shaded by how recently a logged working set worked it (lib/coach/fresh.ts states
// the rule), amber under 24 h. Only from logged sets: nothing logged in the last 3 days, no card. An
// exercise whose muscles are not confirmed is named under the map, never drawn on it. No recovery
// science is claimed.
import { useSyncExternalStore } from 'react';
import { BODIES, REGION_NAMES, type BodyKind, type Region } from '../../lib/bodyArt';
import { bodyPref } from '../../lib/bodyPref';
import { FRESH_LABELS, type FreshBand } from '../../lib/coach';
import styles from './Fresh.module.css';

const BANDS: readonly FreshBand[] = ['day', 'two', 'three'];

/** "Worked under 24 h ago: chest, triceps. 1 to 2 days: quads." for screen readers. */
export function freshWords(bands: Partial<Record<Region, FreshBand>>): string {
  const parts: string[] = [];
  for (const b of BANDS) {
    const names = [...new Set((Object.keys(bands) as Region[]).filter((r) => bands[r] === b).map((r) => REGION_NAMES[r].toLowerCase()))];
    if (names.length) parts.push(`${FRESH_LABELS[b]}: ${names.join(', ')}`);
  }
  return parts.join('. ');
}

/** "Not on the map: Hip Thrust and Crunch (muscles not confirmed)". */
export function unmappedLine(names: readonly string[]): string | null {
  if (!names.length) return null;
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : [...names];
  const list = shown.length < 2 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return `Not on the map: ${list} (muscles not confirmed)`;
}

export function FreshMuscles({ bands, unmapped = [] }: { bands: Partial<Record<Region, FreshBand>>; unmapped?: readonly string[] }) {
  const body = useSyncExternalStore(bodyPref.subscribe, bodyPref.get, () => 'male' as BodyKind);
  const shaded = Object.keys(bands).length > 0;
  if (!shaded && !unmapped.length) return null;
  const off = unmappedLine(unmapped);
  const used = BANDS.filter((b) => Object.values(bands).includes(b));
  return (
    <section className={styles.card} aria-label="Worked lately" data-testid="fresh-muscles">
      <div className={styles.head}>
        <h2 className={styles.title}>Worked lately</h2>
        <p className={styles.sub}>Based on your logged sets</p>
      </div>
      <div className={styles.stage} role="img" aria-label={`Muscles you worked lately. ${shaded ? `${freshWords(bands)}. ` : ''}Everything else: no logged sets we can map.`}>
        {(['front', 'back'] as const).map((view) => {
          const art = BODIES[body][view];
          return (
            <div key={view} className={styles.body} aria-hidden="true">
              <svg className={styles.svg} viewBox={art.viewBox} focusable="false" data-view={view}>
                <path className={styles.outline} d={art.outline} />
                {art.shapes.map((s) => {
                  const band = s.region ? bands[s.region] : undefined;
                  const cls = band ? styles[band] : s.tone === 'head' ? styles.skull : styles.rest;
                  return (
                    <g key={s.slug} className={cls}>
                      {s.paths.map((d, i) => (
                        <path key={i} d={d} data-region={s.region ?? undefined} data-band={band} />
                      ))}
                    </g>
                  );
                })}
              </svg>
              <span className={styles.view}>{view === 'front' ? 'Front' : 'Back'}</span>
            </div>
          );
        })}
      </div>
      <ul className={styles.legend} aria-hidden="true">
        {used.map((b) => (
          <li key={b} className={styles.key}>
            <span className={`${styles.swatch} ${styles[b]}`} />
            {FRESH_LABELS[b]}
          </li>
        ))}
      </ul>
      <p className={styles.note}>Gray: no logged sets we can map</p>
      {off && (
        <p className={styles.note} data-testid="fresh-unmapped">
          {off}
        </p>
      )}
    </section>
  );
}
