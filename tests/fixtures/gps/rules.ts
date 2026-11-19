// PLAN 4.4d (4): the pass rules, exactly as PLAN 4.4d writes them, and the priority groups the
// orchestrator set (Nov 19): group 1 decides whether G's real run feels right.
import type { Metrics } from './replay';
import type { TraceSpec } from './traces';

export const comboKey = (s: Omit<TraceSpec, 'seed'>) => `${s.speed}-${s.cadence}s-${s.noise}m-${s.scenario}`;

/**
 * 1: fixes every second at 5 and 15 m (walk, jog, run; every scenario, the 60 m start included, and
 * the still phone). 2: 30 m at 1 s, and 5 s fixes at 5 and 15 m. 3: 50 m, and 30 m at 5 s.
 */
export function priority(s: Omit<TraceSpec, 'seed'>): 1 | 2 | 3 {
  if (s.cadence === 1 && s.noise <= 15) return 1;
  if ((s.cadence === 1 && s.noise === 30) || (s.cadence === 5 && s.noise <= 15)) return 2;
  return 3;
}

export type RuleFailure = { rule: 'distance' | 'frozen' | 'pace first' | 'pace follow' | 'standing'; value: string };

/**
 * Distance within 3% of the true path; the shown distance never frozen more than 6 s while moving
 * at 1.2 m/s or faster with fixes arriving; pace shows within 20 s of the start and follows a speed
 * change within 20 s; no distance added while standing (at the light, from 10 s after stopping; a
 * still phone, after its first 10 s: the 8 s standing rule needs that long; End included).
 */
export function ruleFailures(s: TraceSpec, m: Metrics): RuleFailure[] {
  const out: RuleFailure[] = [];
  if (s.scenario === 'still') {
    const added = (m.stillEndM ?? 0) - (m.stillFirstM ?? 0);
    if (added > 0.5) out.push({ rule: 'standing', value: `${added.toFixed(1)} m` });
    return out;
  }
  if (Math.abs(m.distErrPct) > 3) out.push({ rule: 'distance', value: `${m.distErrPct.toFixed(1)}%` });
  if (m.frozenSec > 6) out.push({ rule: 'frozen', value: `${m.frozenSec} s (${m.frozenCause})` });
  if (m.paceFirstSec > 20) out.push({ rule: 'pace first', value: Number.isFinite(m.paceFirstSec) ? `${m.paceFirstSec} s` : 'never' });
  if ((m.followSec ?? 0) > 20) out.push({ rule: 'pace follow', value: Number.isFinite(m.followSec!) ? `${m.followSec} s` : 'never' });
  if ((m.standingAddedM ?? 0) > 0.5) out.push({ rule: 'standing', value: `${m.standingAddedM!.toFixed(1)} m` });
  return out;
}
