// PLAN 4.4d (1): the replay numbers as markdown tables for reports/run-lag-4.4d.md.
import type { Metrics } from './replay';
import { traceName, type TraceSpec } from './traces';

const f1 = (n: number | null) => (n === null ? '-' : Number.isFinite(n) ? n.toFixed(1) : 'never');

/** Worst over seeds of every number, one row per combination. */
export function worstBySpec(rows: Array<{ spec: TraceSpec; m: Metrics }>) {
  const groups = new Map<string, Array<{ spec: TraceSpec; m: Metrics }>>();
  for (const r of rows) {
    const key = traceName({ ...r.spec, seed: 0 }).replace(/-seed0$/, '');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups].map(([key, g]) => {
    const worst = (pick: (m: Metrics) => number | null, by = (n: number) => n): { v: number | null; m: Metrics } => {
      let best: { v: number | null; m: Metrics } = { v: null, m: g[0]!.m };
      for (const { m } of g) {
        const v = pick(m);
        if (v !== null && (best.v === null || by(v) > by(best.v))) best = { v, m };
      }
      return best;
    };
    const err = worst((m) => m.distErrPct, Math.abs);
    const frozen = worst((m) => m.frozenSec);
    return {
      key,
      spec: g[0]!.spec,
      errPct: err.v!,
      frozenSec: frozen.v!,
      frozenCause: frozen.m.frozenCause,
      paceFirstSec: worst((m) => m.paceFirstSec).v!,
      followSec: worst((m) => m.followSec).v,
      standingAddedM: worst((m) => m.standingAddedM).v,
      stillWhileMoving: g.reduce((s, r) => s + r.m.stillWhileMoving, 0),
      rejectedAccuracy: g.reduce((s, r) => s + (r.m.fates['rejected:accuracy'] ?? 0), 0),
      fixes: g.reduce((s, r) => s + Object.values(r.m.fates).reduce((a, b) => a + b, 0), 0),
    };
  });
}

export function markdownTable(rows: ReturnType<typeof worstBySpec>): string {
  const head = '| trace | distance error % | frozen s (cause) | pace first s | pace follow s | added standing m | accuracy rejects | still while moving |\n|---|---|---|---|---|---|---|---|';
  const lines = rows.map(
    (r) =>
      `| ${r.key} | ${r.errPct.toFixed(1)} | ${f1(r.frozenSec)}${r.frozenCause ? ` (${r.frozenCause})` : ''} | ${f1(r.paceFirstSec)} | ${f1(r.followSec)} | ${f1(r.standingAddedM)} | ${r.rejectedAccuracy}/${r.fixes} | ${r.stillWhileMoving} |`,
  );
  return [head, ...lines].join('\n');
}
