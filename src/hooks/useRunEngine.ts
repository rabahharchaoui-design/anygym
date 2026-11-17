// The screens' door to the run engine (PLAN 4.3): the live run, re-drawn whenever it changes.
import { useEffect, useSyncExternalStore } from 'react';
import { runEngine, type EngineState } from './runEngine';

export function useRunEngine(): EngineState {
  const state = useSyncExternalStore(runEngine.subscribe, runEngine.get);
  // A run that was going when the app closed comes back the first time anything asks.
  useEffect(() => void runEngine.restore(), []);
  return state;
}

export { runEngine };
export type { EngineState };
