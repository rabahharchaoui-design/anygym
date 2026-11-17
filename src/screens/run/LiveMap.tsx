import { useMemo, useState } from 'react';
import type { LiveRun } from '../../lib/run';
import { drawRoute } from '../../lib/run';
import { IconButton } from '../../ui/IconButton';
import { RecentreIcon } from '../../ui/icons';
import { MapCredit, MapOfflineChip, RunMap } from './RunMap';
import styles from './Live.module.css';

type Props = {
  live: LiveRun;
  /** "1.23 km · 6:12": the two numbers that matter, small, so the map page is never blind. */
  readout: string;
  reduceMotion: boolean;
  /** Room the top bar and the controls take over the map, so the dot is centred in what shows. */
  inset: { top: number; bottom: number };
  locked: boolean;
};

/**
 * The map page (SPEC 12.2): the route in the accent colour over the dark map, the pulsing dot, the
 * start marked, gaps dashed. The map follows the runner until it is dragged; then a button brings
 * it back. Without tiles the route still draws on plain dark, with the "Map offline" chip.
 */
export function LiveMap({ live, readout, reduceMotion, inset, locked }: Props) {
  const [offline, setOffline] = useState(false);
  const [moved, setMoved] = useState(false);
  const [recentre, setRecentre] = useState(0);
  const gaps = useMemo(() => live.breaks.map((b) => [b.fromT, b.toT] as const), [live.breaks]);
  const route = useMemo(() => drawRoute(live.points, gaps), [live.points, gaps]);
  return (
    <div className={styles.mapPage} data-testid="live-map" data-points={live.points.length} data-solid={route.solid.length} data-dashed={route.dashed.length}>
      <RunMap here={live.here} recentre={recentre} reduceMotion={reduceMotion} inset={inset} onOffline={setOffline} onMoved={setMoved} route={route} />
      <div className={styles.mapTop} style={{ top: inset.top }}>
        <span className={`${styles.readout} num`} data-testid="live-map-readout">
          {readout}
        </span>
        {offline && <MapOfflineChip />}
      </div>
      <div className={styles.mapFoot} style={{ bottom: inset.bottom }}>
        <MapCredit />
        {live.here && moved && !locked && (
          <IconButton label="Back to where I am" onPress={() => setRecentre((n) => n + 1)} testId="live-recentre">
            <RecentreIcon aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
