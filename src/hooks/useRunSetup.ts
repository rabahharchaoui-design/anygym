// The run start screen's door to the database (PLAN 4.2): the remembered run type and goals, and
// the profile's distance unit. Changes show at once and are saved behind; a failed save keeps the
// choice for this visit.
import { useCallback, useEffect, useState } from 'react';
import { readRunSetup, saveRunSetup, saveRunUnit, type RunSetupState } from '../db/runSetup';
import type { DistanceUnit } from '../lib/intake/answers';
import type { RunSetup } from '../lib/run';

export type RunSetupHook = {
  /** Null until the saved choice is read (a few milliseconds). */
  state: RunSetupState | null;
  change: (patch: Partial<RunSetup>) => void;
  setUnit: (unit: DistanceUnit) => void;
};

export function useRunSetup(): RunSetupHook {
  const [state, setState] = useState<RunSetupState | null>(null);
  useEffect(() => {
    let alive = true;
    void readRunSetup()
      .catch(() => null)
      .then((s) => alive && s && setState((now) => now ?? s));
    return () => {
      alive = false;
    };
  }, []);
  const change = useCallback((patch: Partial<RunSetup>) => {
    setState((s) => {
      if (!s) return s;
      const setup = { ...s.setup, ...patch };
      void saveRunSetup(setup).catch(() => undefined);
      return { ...s, setup };
    });
  }, []);
  const setUnit = useCallback((unit: DistanceUnit) => {
    setState((s) => (s ? { ...s, unit } : s));
    void saveRunUnit(unit).catch(() => undefined);
  }, []);
  return { state, change, setUnit };
}
