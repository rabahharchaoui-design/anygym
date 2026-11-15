// PLAN 3.6w (1): whether the saved plans are known (db/planRegistry.ts), for Today's error line with
// Try again. Re-renders when the registry is filled, so a plan found on Try again shows at once.
import { useSyncExternalStore } from 'react';
import { onRegistryStatus, registryStatus, retryPlanRegistry, type RegistryStatus } from '../db/planRegistry';

export function usePlanRegistry(): RegistryStatus & { retry: () => void } {
  const status = useSyncExternalStore(onRegistryStatus, registryStatus, registryStatus);
  return { ...status, retry: () => void retryPlanRegistry() };
}

/** The one sentence Today shows when the registry failed. */
export const registryWords = (missing: number): string =>
  missing === 1 ? 'One of your plans could not be loaded.' : missing > 1 ? `${missing} of your plans could not be loaded.` : 'Could not load your plans.';
