// Where the phone is, for the run start screen (PLAN 4.2): the permission, one watch for the blue
// dot and the GPS chip, stopped when the screen leaves or the app goes to the background. This is
// not run tracking (4.3 feeds lib/gps); nothing here is stored.
import { useCallback, useEffect, useRef, useState } from 'react';
import { GEO_START, type GeoState } from '../lib/run';

const ASKED_KEY = 'anygym.run.geoAsked';
const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };

const askedBefore = (): boolean => {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
};
const rememberAsked = (): void => {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Private mode: the phone asks again next visit.
  }
};

export type Geo = GeoState & {
  /** Starts listening. On a phone that has not decided yet this shows the system question, so call it from a tap. */
  ask: () => void;
};

/**
 * `auto`: start listening on arrival when the phone already said yes (or was asked on an earlier
 * visit). Otherwise nothing is asked until `ask` runs from a tap.
 */
export function useGeo(auto = true): Geo {
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation;
  const [state, setState] = useState<GeoState>({ ...GEO_START, supported });
  const watchId = useRef<number | null>(null);
  const wanted = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (!supported || watchId.current !== null) return;
    wanted.current = true;
    setState((s) => ({ ...s, watching: true, problem: null }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        rememberAsked();
        // The phone's clock at arrival, so "fresh" never depends on the GPS chip's own clock.
        setState((s) => ({ ...s, permission: 'granted', problem: null, fix: { lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : Infinity, t: Date.now() } }));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stop();
          wanted.current = false;
          setState((s) => ({ ...s, permission: 'denied', problem: 'denied', watching: false, fix: null }));
        } else {
          setState((s) => ({ ...s, problem: err.code === err.TIMEOUT ? 'timeout' : 'unavailable' }));
        }
      },
      OPTIONS,
    );
  }, [stop, supported]);

  // The permission, when the phone can tell without asking (and its changes while the screen is open).
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    let status: PermissionStatus | null = null;
    const apply = () => {
      if (!alive || !status) return;
      const permission = status.state;
      setState((s) => ({ ...s, permission, ...(permission === 'denied' ? { problem: 'denied' as const, fix: null } : s.problem === 'denied' ? { problem: null } : {}) }));
      if (permission === 'granted' && auto) start();
    };
    const query = navigator.permissions?.query?.({ name: 'geolocation' });
    if (query) {
      query
        .then((s) => {
          status = s;
          apply();
          s.addEventListener?.('change', apply);
        })
        .catch(() => {
          if (alive && auto && askedBefore()) start();
        });
    } else if (auto && askedBefore()) start();
    return () => {
      alive = false;
      status?.removeEventListener?.('change', apply);
    };
  }, [auto, start, supported]);

  // Listening stops in the background (battery) and on leaving the screen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        setState((s) => ({ ...s, watching: false }));
      } else if (wanted.current) start();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [start, stop]);

  const ask = useCallback(() => {
    rememberAsked();
    // A second try after "denied": the watch starts fresh and the phone answers again.
    setState((s) => (s.permission === 'denied' ? { ...s, permission: 'unknown', problem: null } : s));
    start();
  }, [start]);

  return { ...state, ask };
}
