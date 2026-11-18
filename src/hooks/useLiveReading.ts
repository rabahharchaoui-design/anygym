import { useEffect, useRef, useState } from 'react';
import type { TrackerReading } from '../lib/gps';
import { faceSec, liveMovingMs, readLive, type LiveRun } from '../lib/run';
import { createFaceTick, type FaceTick } from './faceTick';

/**
 * The live run's reading as the screen shows it (PLAN 4.4a): distance and pace per position, the
 * moving time counting second by second between positions (lib/run liveClock), in whole seconds,
 * driven by the one face tick (faceTick). Everything on the live screen that prints the time reads
 * it from here, so the big number, the small one, the map readout and a time goal agree.
 */
export function useLiveReading(live: LiveRun): TrackerReading {
  const [, setNow] = useState(0);
  const tracker = useRef(live.tracker);
  tracker.current = live.tracker;
  const tick = useRef<FaceTick | null>(null);
  useEffect(() => {
    const t = createFaceTick(() => tracker.current, setNow);
    tick.current = t;
    t.start();
    document.addEventListener('visibilitychange', t.poke);
    return () => {
      t.stop();
      document.removeEventListener('visibilitychange', t.poke);
      tick.current = null;
    };
  }, []);
  // A new position, a pause or a resume: the next whole second is somewhere else now.
  useEffect(() => tick.current?.poke(), [live.tracker]);

  const shown = useRef<number | null>(null);
  const sec = faceSec(shown.current, liveMovingMs(live.tracker, Date.now()));
  shown.current = sec;
  const reading = readLive(live);
  return sec === reading.movingSec ? reading : { ...reading, movingSec: sec };
}
