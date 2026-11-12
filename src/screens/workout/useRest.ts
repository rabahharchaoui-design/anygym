import { useCallback, useEffect, useState } from 'react';
import { hints } from '../../lib/hints';
import { durableRest, loadRest, restUnreadable, saveRest, type Rest } from '../../lib/rest';

/** The rest timer of this workout: loaded at open, saved on every change, and holding back hints while it counts. */
export function useRest(sessionId: string) {
  const [rest, setRestState] = useState<Rest | null>(() => loadRest(sessionId));
  // localStorage there but unreadable (PLAN 2.0c): the workout still opens; the rest comes from its
  // IndexedDB copy, else there is none.
  useEffect(() => {
    if (!restUnreadable()) return;
    let live = true;
    void durableRest(sessionId).then((r) => {
      if (live && r) setRestState((cur) => cur ?? r);
    });
    return () => {
      live = false;
    };
  }, [sessionId]);

  // No first time hints while the rest timer counts (SPEC 13.5).
  useEffect(() => hints.setBlocked(rest !== null), [rest]);
  useEffect(() => () => hints.setBlocked(false), []);

  const setRest = useCallback((r: Rest | null) => {
    setRestState(r);
    saveRest(r);
  }, []);
  return { rest, setRest };
}
