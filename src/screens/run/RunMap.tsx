import { lazy, Suspense, useCallback, useState } from 'react';
import { MAP_ATTRIBUTION } from '../../lib/run';
import { OfflineIcon } from '../../ui/icons';
import type { RunMapGlProps } from './RunMapGl';
import styles from './RunMap.module.css';

// MapLibre is a few hundred KB: it is asked for only when the Run tab opens, never with the app.
const RunMapGl = lazy(() => import('./RunMapGl'));

type Props = Omit<RunMapGlProps, 'onReady'>;

/**
 * The map behind the run start screen (SPEC 12.1, 12.10). A calm dark placeholder while MapLibre
 * loads. When tiles cannot be had the map keeps its plain dark background (the dot still draws on
 * it): never an error, never a white box.
 */
export function RunMap(props: Props) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className={styles.map} data-testid="run-map" data-ready={ready}>
      <div className={styles.canvas} data-show={ready}>
        <Suspense fallback={null}>
          <RunMapGl {...props} onReady={onReady} />
        </Suspense>
      </div>
    </div>
  );
}

/** Tiles could not be had: said plainly, next to the GPS chip. Not an error, nothing to fix. */
export function MapOfflineChip() {
  return (
    <span className={styles.offline} role="status" data-testid="map-offline">
      <OfflineIcon width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
      Map offline
    </span>
  );
}

/** The map data credit, always in view (MapLibre's own credit control would vanish with the tile list). */
export function MapCredit() {
  return (
    <span className={styles.credit} data-testid="map-credit">
      {MAP_ATTRIBUTION}
    </span>
  );
}
