// Validate saved explanations before displaying counts from a restored definition.
import { FOCUS_PICKS, type FocusPickId } from '../intake/options';
import type { FocusReport } from './focus';

const STATES = ['extra', 'plenty', 'short', 'no_move', 'no_share'];
const count = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const amount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isPick = (id: unknown) => FOCUS_PICKS.some((f) => f.id === id);
const each = (v: unknown, ok: (o: Record<string, unknown>) => boolean) => Array.isArray(v) && v.every((x) => !!x && typeof x === 'object' && ok(x as Record<string, unknown>));

/** A saved focus report, or undefined when anything in it is not what the app writes (reports from before round 2 have no state, parts or dayExtra, and those before round 3 no dayLead or coveredBy: all still read). */
export function readFocusReport(v: unknown): FocusReport | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (!count(o.budget) || o.budget > 12 || !count(o.spent) || o.spent > o.budget || !Array.isArray(o.days)) return undefined;
  const priority = (p: Record<string, unknown>) =>
    isPick(p.id) && count(p.requested) && p.requested <= 4 && count(p.extra) && p.extra <= 12 && count(p.total) && typeof p.shortfall === 'boolean'
    && (p.minutes === undefined || amount(p.minutes)) && (p.session === undefined || amount(p.session)) && (p.reason === undefined || typeof p.reason === 'string')
    && (p.atLimit === undefined || p.atLimit === true) && (p.noMove === undefined || p.noMove === true)
    && (p.state === undefined || STATES.includes(p.state as string))
    && (p.shared === undefined || count(p.shared)) && (p.coveredBy === undefined || (Array.isArray(p.coveredBy) && p.coveredBy.every(isPick)))
    && (p.parts === undefined || each(p.parts, (x) => typeof x.muscle === 'string' && x.muscle.length < 40 && count(x.sets)));
  if (!each(o.priorities, priority)) return undefined;
  if (!o.days.every((d) => Array.isArray(d) && d.every((s) => typeof s === 'string' && s.length < 500))) return undefined;
  if (o.dayExtra !== undefined && !(Array.isArray(o.dayExtra) && o.dayExtra.every((d) => each(d, (x) => isPick(x.id) && count(x.extra) && (x.minutes === undefined || amount(x.minutes)))))) return undefined;
  if (o.dayLead !== undefined && !(Array.isArray(o.dayLead) && o.dayLead.every((x) => x === null || isPick(x)))) return undefined;
  const report = o as unknown as FocusReport;
  if (new Set(report.priorities.map((p) => p.id as FocusPickId)).size !== report.priorities.length) return undefined;
  return structuredClone(report);
}
