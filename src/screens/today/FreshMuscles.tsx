// Worked lately on Today (PLAN 3.8, competitor gap 4; 3.5g: the honest title and legend): front and
// back, each muscle shaded by how recently a logged working set worked it (lib/coach/fresh.ts states
// the rule), amber under 24 h. Only from logged sets: nothing logged in the last 3 days, no card. An
// exercise whose muscles are not confirmed is named under the map, never drawn on it. No recovery
// science is claimed.
import { useSyncExternalStore } from 'react';
import { BODIES, type BodyKind, type Region } from '../../lib/bodyArt';
import { bodyPref } from '../../lib/bodyPref';
import { FRESH_LABELS, type FreshBand } from '../../lib/coach';
import styles from './Fresh.module.css';

const BANDS: readonly FreshBand[] = ['day', 'two', 'three'];

type Named = ReadonlyArray<{ name: string; band: FreshBand }>;

/**
 * "Under 24 h: chest, triceps. 1 to 2 days: quads.", shown under the map (PLAN R1 3) and read out. The names are the exercises'
 * own (lib/coach freshNames): "front delts" after an overhead press, never "front and side delts".
 */
export function freshWords(named: Named): string {
  const parts: string[] = [];
  for (const b of BANDS) {
    const names = [...new Set(named.filter((n) => n.band === b).map((n) => n.name))];
    if (names.length) parts.push(`${FRESH_LABELS[b]}: ${names.join(', ')}`);
  }
  return parts.join('. ');
}

const listed = (names: readonly string[]): string => {
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : [...names];
  return shown.length < 2 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

/**
 * "Not on the map: Hip Thrust and Crunch (muscles not confirmed)". A sure muscle that has a name
 * but no shape on the map (rotator cuff) is said by its own name (PLAN R1 4): "Not on the map:
 * rotator cuff". Exercises are named only when their muscles are not confirmed.
 */
export function unmappedLine(names: readonly string[], muscles: readonly string[] = []): string | null {
  const parts: string[] = [];
  const own = [...new Set(muscles)];
  if (own.length) parts.push(listed(own));
  if (names.length) parts.push(`${listed(names)} (muscles not confirmed)`);
  return parts.length ? `Not on the map: ${parts.join('; ')}` : null;
}

export function FreshMuscles({ bands, named, unmapped = [], unshaped = [] }: { bands: Partial<Record<Region, FreshBand>>; named: Named; unmapped?: readonly string[]; unshaped?: readonly string[] }) {
  const body = useSyncExternalStore(bodyPref.subscribe, bodyPref.get, () => 'male' as BodyKind);
  const shaded = Object.keys(bands).length > 0;
  if (!shaded && !unmapped.length && !unshaped.length) return null;
  const off = unmappedLine(unmapped, unshaped);
  const words = shaded ? freshWords(named) : '';
  const used = BANDS.filter((b) => Object.values(bands).includes(b));
  return (
    <section className={styles.card} aria-label="Worked lately" data-testid="fresh-muscles">
      <div className={styles.head}>
        <h2 className={styles.title}>Worked lately</h2>
        <p className={styles.sub}>Based on your logged sets</p>
      </div>
      <div className={styles.stage} role="img" aria-label={`Muscles you worked lately. ${shaded ? `${freshWords(named)}. ` : ''}Everything else: no logged sets we can map.`}>
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
      {/* PLAN R1 (3): the muscles in words, not only in the drawing's label (read out there). */}
      {words && (
        <p className={styles.names} data-testid="fresh-names" aria-hidden="true">
          {words}
        </p>
      )}
      <p className={styles.note}>Gray: no logged sets we can map</p>
      {off && (
        <p className={styles.note} data-testid="fresh-unmapped">
          {off}
        </p>
      )}
    </section>
  );
}
