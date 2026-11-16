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

/** What must be said about the map: the "Map offline" chip when tiles failed, and the map data credit, always. */
export function MapNotes({ offline }: { offline: boolean }) {
  return (
    <div className={styles.notes}>
      {offline && (
        <span className={styles.offline} role="status" data-testid="map-offline">
          <OfflineIcon width={14} height={14} strokeWidth={2.2} aria-hidden="true" />
          Map offline
        </span>
      )}
      <span className={styles.credit} data-testid="map-credit">
        {MAP_ATTRIBUTION}
      </span>
    </div>
  );
}
