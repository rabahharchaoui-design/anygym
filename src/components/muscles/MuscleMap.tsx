import { BACK, FRONT, VIEWBOX, type RegionShape } from '../../lib/bodyPolygons';
import type { MuscleMapData } from '../../lib/muscles';
import styles from './MuscleMap.module.css';

// SPEC 4.4 and 4.5: front and back silhouettes, primary muscles in the accent, secondary at 40%,
// a small legend, and the precise text line under the drawing. The component only draws what
// src/lib/muscles.ts resolved; null is the honest empty state (SPEC 4.3), never a guessed map.

function Body({ view, shapes, data }: { view: 'front' | 'back'; shapes: RegionShape[]; data: MuscleMapData }) {
  return (
    <div className={styles.view}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        aria-hidden="true"
        focusable="false"
        data-view={view}
      >
        {shapes.map((s) =>
          s.polygons.map((points, i) => (
            <polygon
              key={`${s.region}-${i}`}
              points={points}
              data-region={s.region}
              data-role={data.shading[s.region] ?? 'body'}
              className={styles[data.shading[s.region] ?? 'body']}
            />
          )),
        )}
      </svg>
      <span className={styles.caption}>{view === 'front' ? 'Front' : 'Back'}</span>
    </div>
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
          <div className={styles.bodies}>
            <Body view="front" shapes={FRONT} data={data} />
            <Body view="back" shapes={BACK} data={data} />
          </div>
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.key}>
              <span className={`${styles.swatch} ${styles.primary}`} />
              Primary
            </span>
            {hasSecondary && (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.key}>
                  <span className={`${styles.swatch} ${styles.secondary}`} />
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
