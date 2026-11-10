import { describe, expect, it } from 'vitest';
import { liftVerdict } from '../coach/levelUp';
import { targetOf } from '../coach/target';
import { loadAt, stackLoad } from '../load';
import { KG, LB, NOW, lift, nov, sess } from './coach/fixtures';

function run(setup: typeof LB, pinV: number, added: number) {
  const old = stackLoad(pinV, setup.unit, added || undefined);
  const l = lift({ exerciseId: 'lat-pulldown', loadKind: 'stack', pattern: 'vertical pull', setup, sessions: [sess(nov(5), [12, 12, 12], old)] });
  const v = liftVerdict(l, [], NOW);
  if (!v || !('raise' in v)) throw new Error('no raise ' + JSON.stringify(v));
  const t = targetOf(v.raise, NOW);
  const next = loadAt('stack', t.value, setup)!;
  return { old, raise: v.raise, next };
}
describe('3.5c verify stack add-on', () => {
  it('lb 120 + 5', () => {
    const r = run(LB, 120, 5);
    console.log('LB', JSON.stringify({ from: r.raise.from, to: r.raise.to, reason: r.raise.reason, nextTotal: r.next.total, nextAdded: r.next.added, oldTotal: r.old.total }));
    expect(r.next).not.toBeNull();
    expect(r.next.total).toBeGreaterThan(125);
    expect(r.raise.reason).toContain('+5 lb');
    expect(r.raise.reason).not.toContain('+30');
  });
  it('kg 60 + 2.5', () => {
    const r = run(KG, 60, 2.5);
    console.log('KG', JSON.stringify({ from: r.raise.from, to: r.raise.to, reason: r.raise.reason, nextTotal: r.next.total, nextAdded: r.next.added }));
    expect(r.next.total).toBeGreaterThan(62.5);
    expect(r.raise.reason).toContain('+2.5 kg');
  });
  it('no add-on unchanged', () => {
    const r = run(LB, 100, 0);
    console.log('LB0', JSON.stringify({ to: r.raise.to, reason: r.raise.reason }));
    expect(r.raise.to).toBeGreaterThan(100);
  });
});
