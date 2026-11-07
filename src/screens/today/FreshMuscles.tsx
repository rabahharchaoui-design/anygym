// Fresh muscles on Today (PLAN 3.8, competitor gap 4): front and back, each muscle shaded by how
// recently a logged working set worked it (lib/coach/fresh.ts states the rule). Only from logged
// sets: nothing logged in the last 3 days, no card. No recovery science is claimed.
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

export function FreshMuscles({ bands }: { bands: Partial<Record<Region, FreshBand>> }) {
  const body = useSyncExternalStore(bodyPref.subscribe, bodyPref.get, () => 'male' as BodyKind);
  const shaded = Object.keys(bands).length > 0;
  if (!shaded) return null;
  const used = BANDS.filter((b) => Object.values(bands).includes(b));
  return (
    <section className={styles.card} aria-label="Fresh muscles" data-testid="fresh-muscles">
      <div className={styles.head}>
        <h2 className={styles.title}>Fresh muscles</h2>
        <p className={styles.sub}>Based on your logged sets</p>
      </div>
      <div className={styles.stage} role="img" aria-label={`Muscles you worked lately. ${freshWords(bands)}. Everything else: not worked in the last 3 days.`}>
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
      <p className={styles.note}>Gray: not worked in the last 3 days</p>
    </section>
  );
}
