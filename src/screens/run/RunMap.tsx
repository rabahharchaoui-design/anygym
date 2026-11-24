import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { MAP_ATTRIBUTION } from '../../lib/run';
import { OfflineIcon } from '../../ui/icons';
import type { RunMapGlProps } from './RunMapGl';
import styles from './RunMap.module.css';

// MapLibre is a few hundred KB: it is asked for only when the Run tab opens, never with the app.
// PLAN R1 (1): when its file cannot be fetched (no signal on a first visit, a stale tab after an
// update) the map stays the dark placeholder with "Map offline"; the run itself starts and counts
// as usual. The next time a map opens the file is asked for again.
let RunMapGl = loadMap();
function loadMap() {
  return lazy((): Promise<{ default: ComponentType<RunMapGlProps> }> =>
    import('./RunMapGl').catch(() => {
      RunMapGl = loadMap();
      return { default: MapFileMissing };
    }),
  );
}

/** The map's file could not load: said as "Map offline", the placeholder stays. */
function MapFileMissing({ onOffline }: RunMapGlProps) {
  const said = useRef(onOffline);
  useEffect(() => said.current(true), []);
  return null;
}

type Props = Omit<RunMapGlProps, 'onReady'> & {
  /** Covered by the countdown: hidden, so nothing of it is drawn or composited (PLAN 4.4a). */
  asleep?: boolean;
};

/**
 * The map behind the run start screen (SPEC 12.1, 12.10). A calm dark placeholder while MapLibre
 * loads. When tiles cannot be had the map keeps its plain dark background (the dot still draws on
 * it): never an error, never a white box.
 */
export function RunMap({ asleep = false, ...props }: Props) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className={styles.map} data-testid="run-map" data-ready={ready} data-asleep={asleep || undefined}>
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
