// PLAN 3.6p: a CPU profile of the slow reveals (build + fit line), summed by function (self time).
// Run: npx vitest run --config scripts/perf/vitest.perf.config.ts scripts/perf/profile.perf.ts
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { it } from 'vitest';
import { generate } from '../../src/data/generator';
import { focusFit } from '../../src/lib/intake/focusFit';
import { seededInput } from './seeded';

const OUT = process.env.PERF_OUT ?? '/tmp/3.6p-profile.txt';
const CASES: Array<[number, number, number, number]> = [[10, 2, 30, 0], [7, 2, 45, 1], [9, 3, 20, 0], [9, 4, 45, 1], [9, 3, 75, 1], [11, 5, 60, 0], [5, 5, 60, 0], [7, 3, 75, 0], [1, 5, 75, 0]];
type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };

it('profiles', async () => {
  const session = new Session();
  session.connect();
  const post = <T>(method: string, params?: object) => new Promise<T>((res, rej) => session.post(method as 'Profiler.stop', params as never, (e: Error | null, r: unknown) => (e ? rej(e) : res(r as T))));
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: 200 });
  await post('Profiler.start');
  const t0 = performance.now();
  for (const [c, d, m, rep] of CASES) {
    const input = seededInput(c, d, m, rep);
    const r = generate(input);
    if (r.ok) focusFit({ days: d as 3, minutes: m as 45 }, r.applied.focusReport, (a) => { const x = generate({ ...input, days: a.days!, minutes: a.minutes! }); return x.ok ? x.applied.focusReport : undefined; });
  }
  const wall = performance.now() - t0;
  const { profile } = await post<{ profile: { nodes: Node[]; samples: number[]; timeDeltas: number[] } }>('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map<string, number>(), total = new Map<string, number>();
  const nameOf = (n: Node) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\/(src|node_modules)\//, '$1/')}:${n.callFrame.lineNumber + 1}`;
  let all = 0;
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0;
    all += dt;
    const n = byId.get(id)!;
    self.set(nameOf(n), (self.get(nameOf(n)) ?? 0) + dt);
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) { const k = nameOf(byId.get(at)!); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) ?? 0) + dt); } }
  });
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)} ms ${((v / all) * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
  writeFileSync(OUT, `wall ${wall.toFixed(0)} ms over ${CASES.length} reveals\n\nSELF TIME\n${top(self, 35)}\n\nTOTAL TIME (inclusive)\n${top(total, 60)}\n`);
});
