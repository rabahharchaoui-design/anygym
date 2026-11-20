import { useLayoutEffect, useRef, useState } from 'react';
import type { RouteGeo } from '../../lib/run';
import { MapCredit, MapOfflineChip, RunMap } from './RunMap';
import styles from './Summary.module.css';

const noop = () => undefined;

/**
 * A finished route on the map, whole, with the dashed gaps (SPEC 12.9, 12.10). The map does not
 * answer touches: the page scrolls over it. The credit line and the "Map offline" chip sit on its
 * foot, and the route is fitted above them. Used by the finish screen and the run's detail, where
 * `hero` makes it the full width picture of the top half (PLAN M3), and by the heatmap.
 */
export function RouteMap({ route, reduceMotion, many = false, resize, hero = false }: { route: RouteGeo; reduceMotion: boolean; many?: boolean; resize?: unknown; hero?: boolean }) {
  const [offline, setOffline] = useState(false);
  const notes = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState({ top: 0, bottom: 48 });
  useLayoutEffect(() => {
    const el = notes.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const measure = () => {
      const bottom = Math.ceil(box.getBoundingClientRect().bottom - el.getBoundingClientRect().top);
      setInset((i) => (i.bottom === bottom ? i : { top: 0, bottom }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [resize]);
  return (
    <div className={styles.map} data-hero={hero || undefined} data-testid={many ? 'heatmap' : 'summary-map'} data-solid={route.solid.length} data-dashed={route.dashed.length}>
      <RunMap here={null} recentre={0} reduceMotion={reduceMotion} inset={inset} onOffline={setOffline} onMoved={noop} route={route} still />
      <div className={styles.mapNotes} ref={notes}>
        <MapCredit />
        {offline && <MapOfflineChip />}
      </div>
    </div>
  );
}
