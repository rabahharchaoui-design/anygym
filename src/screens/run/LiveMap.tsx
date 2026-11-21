import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LiveRun } from '../../lib/run';
import { drawRoute } from '../../lib/run';
import { IconButton } from '../../ui/IconButton';
import { BLANK } from '../../ui/dataFieldFit';
import { RecentreIcon } from '../../ui/icons';
import { MapCredit, MapOfflineChip, RunMap } from './RunMap';
import styles from './LiveMap.module.css';

/** One number of the map page's stat row, as printed by lib/run ("3.42" and "km"). */
export type MapStat = { value: string; unit?: string; spoken: string };

type Props = {
  live: LiveRun;
  /** Distance, time and pace (board 07), so the map page is never blind. */
  readout: MapStat[];
  reduceMotion: boolean;
  /** Room the top bar and the controls take over the map, so the dot is centred in what shows. */
  inset: { top: number; bottom: number };
  locked: boolean;
};

/**
 * The map page (SPEC 12.2, PLAN M2, board 07): the route in the accent colour over the dark map, the
 * pulsing dot, the start marked, gaps dashed; under the map one row of heavy numbers (distance, time,
 * pace) sits on graphite right over the page marks and Pause. The map follows the runner until it
 * is dragged; then a button brings it back. Without tiles the route still draws on plain dark, with the "Map offline" chip.
 */
export function LiveMap({ live, readout, reduceMotion, inset, locked }: Props) {
  const [offline, setOffline] = useState(false);
  const [moved, setMoved] = useState(false);
  const [recentre, setRecentre] = useState(0);
  const gaps = useMemo(() => live.breaks.filter((b) => b.kind !== 'shift').map((b) => [b.fromT, b.toT] as const), [live.breaks]);
  const route = useMemo(() => drawRoute(live.points, gaps), [live.points, gaps]);
  // The stat row covers the foot of the map: the map centres the dot in what is left above it.
  const rowRef = useRef<HTMLParagraphElement>(null);
  const [readoutRoom, setReadoutRoom] = useState(0);
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setReadoutRoom(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const mapInset = useMemo(() => ({ top: inset.top, bottom: inset.bottom + readoutRoom }), [inset.top, inset.bottom, readoutRoom]);
  return (
    <div className={styles.mapPage} data-testid="live-map" data-points={live.points.length} data-solid={route.solid.length} data-dashed={route.dashed.length} data-moved={moved || undefined}>
      <RunMap here={live.here} recentre={recentre} reduceMotion={reduceMotion} inset={mapInset} onOffline={setOffline} onMoved={setMoved} route={route} locked={locked} />
      <div className={styles.mapTop} style={{ top: inset.top }}>
        {offline && <MapOfflineChip />}
      </div>
      <p className={styles.readout} ref={rowRef} style={{ bottom: inset.bottom }} data-testid="live-map-readout">
        {readout.map((r) => (
          <span key={r.spoken} className={styles.stat} aria-label={r.spoken}>
            <span className={`${styles.statValue} num`} data-blank={r.value === BLANK || undefined}>
              {r.value}
            </span>
            {r.unit && <span className={styles.statUnit}>{r.unit}</span>}
          </span>
        ))}
      </p>
      <div className={styles.mapFoot} style={{ bottom: inset.bottom + readoutRoom }}>
        <MapCredit />
        {live.here && moved && !locked && (
          <IconButton plain label="Back to where I am" onPress={() => setRecentre((n) => n + 1)} testId="live-recentre">
            <RecentreIcon aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
