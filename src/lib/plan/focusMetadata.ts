// Validate saved explanations before displaying counts from a restored definition.
import { FOCUS_PICKS, type FocusPickId } from '../intake/options';
import type { FocusReport } from './focus';
export function readFocusReport(v: unknown): FocusReport | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (!count(o.budget) || o.budget > 12 || !count(o.spent) || o.spent > o.budget || !Array.isArray(o.priorities) || !Array.isArray(o.days)) return undefined;
  if (!o.priorities.every((v) => {
    if (!v || typeof v !== 'object') return false;
    const p = v as Record<string, unknown>;
    return FOCUS_PICKS.some((f) => f.id === p.id) && count(p.requested) && p.requested <= 4 && count(p.extra) && p.extra <= p.requested && count(p.total) && typeof p.shortfall === 'boolean' && (p.minutes === undefined || typeof p.minutes === 'number' && Number.isFinite(p.minutes) && p.minutes >= 0) && (p.reason === undefined || typeof p.reason === 'string') && (p.atLimit === undefined || p.atLimit === true) && (p.noMove === undefined || p.noMove === true);
  })) return undefined;
  if (!o.days.every((d) => Array.isArray(d) && d.every((s) => typeof s === 'string' && s.length < 500))) return undefined;
  const report = o as unknown as FocusReport;
  if (new Set(report.priorities.map((p) => p.id as FocusPickId)).size !== report.priorities.length) return undefined;
  return structuredClone(report);
}
