// A first run in a city (PLAN 4.6, SPEC 12.9 "passport stamp if new"). Pure. The city is whatever
// the run already has stored; this never looks one up. The full passport stamp is PLAN 4.7.
import type { Run } from '../../db/types';
import type { Moment } from '../../ui/celebrate/types';
import { happenedBefore } from './records';

const cityOf = (run: Run): string => run.city?.trim() ?? '';

/** This finished run's city, when no earlier finished run has the same one. Null when it has no city. */
export function newCityMoment(run: Run, runs: readonly Run[]): Moment | null {
  const city = cityOf(run);
  if (!city || run.endedAt === undefined) return null;
  if (runs.some((r) => r.id !== run.id && r.endedAt !== undefined && cityOf(r) === city && happenedBefore(r, run))) return null;
  const country = run.country?.trim() ?? '';
  return {
    id: `city:${run.id}`,
    kind: 'city_stamp',
    big: false,
    weight: 1,
    title: 'New city',
    hero: city,
    caption: country || 'First run here',
    detail: country ? `${city}, ${country}` : `${city}, first run here`,
  };
}
