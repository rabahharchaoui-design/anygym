// PLAN 2.0f group 2: sleeve capacity respected by every load builder (Codex 1031 1657 #2).
import { describe, expect, it } from 'vitest';
import { makeGym } from '../../db/gyms';
import { fitsSleeve, barbellLoad, loadAt, nearestLoadable, sleeveOf, stepUp, type LoadSetup } from '../load';
import { confirmablePick, loadSetupFor, prefillLoad } from '../../screens/workout/exerciseLoad';
import { progress } from '../progression';

const kgGym = () => makeGym({ name: 'G', type: 'full', unit: 'kg', isActive: true }, 1);
const six25 = [25, 25, 25, 25, 25, 25];

describe('sleeve capacity (women\'s bar, 320 mm)', () => {
  it('barbellLoad refuses plates that do not fit the sleeve', () => {
    expect(barbellLoad(15, six25, 'none', 'kg', 'womens')).not.toBeNull(); // no sleeve given: unchecked
    expect(barbellLoad(15, six25, 'none', 'kg', 'womens', sleeveOf('womens', 'kg'))).toBeNull();
    expect(barbellLoad(15, six25, 'none', 'kg', 'olympic', sleeveOf('olympic', 'kg'))).not.toBeNull();
  });

  it('loadAt and stepUp never solve past the sleeve', () => {
    const g = kgGym();
    const s: LoadSetup = { unit: 'kg', ...loadSetupFor(g, 'barbell', 'barbell-row', 'Barbell Row', 'womens') };
    expect(s.sleeveLength).toBe(sleeveOf('womens', 'kg'));
    expect(loadAt('barbell', 315, s)).toBeNull();
    expect(loadAt('barbell', 315, { ...s, sleeveLength: sleeveOf('olympic', 'kg') })).not.toBeNull();
    const up = stepUp('barbell', 315, s);
    expect(up === null || loadAt('barbell', up, s) !== null).toBe(true);
    expect(nearestLoadable('barbell', 315, s)).toBeLessThan(315);
  });

  it('prefill and confirmation reject a 315 kg stack on the women\'s bar', () => {
    const g = kgGym();
    const prev = barbellLoad(20, six25, 'none', 'kg', 'olympic')!;
    expect(prev.total).toBe(320);
    expect(prefillLoad(prev, 'barbell', g, 'barbell-row', 'Barbell Row', 'olympic')?.total).toBe(320);
    expect(prefillLoad(prev, 'barbell', g, 'barbell-row', 'Barbell Row', 'womens')).toBeNull();
    expect(confirmablePick({ load: null, plates: six25, unit: 'kg' }, 'barbell', g, 'barbell-row', 'Barbell Row', 'womens')).toBeNull();
    expect(confirmablePick({ load: null, plates: six25, unit: 'kg' }, 'barbell', g, 'barbell-row', 'Barbell Row', 'olympic')?.load?.total).toBe(320);
  });

  it('progression on the women\'s bar suggests only loads that fit its sleeve', () => {
    const g = kgGym();
    const gym = loadSetupFor(g, 'barbell', 'barbell-row', 'Barbell Row', 'womens');
    const sleeve = sleeveOf('womens', 'kg');
    // 5 x 25 kg per side is 320 mm thick on a 320 mm sleeve: the heaviest the bar holds; one more step is impossible.
    const heavy = barbellLoad(15, [25, 25, 25, 25, 25], 'none', 'kg', 'womens', sleeve)!;
    const p = progress({
      exerciseId: 'barbell-row',
      loadKind: 'barbell',
      unit: 'kg',
      gym,
      repRange: [5, 5],
      history: [{ date: 1, gymId: 'g', unit: 'kg', sets: [{ kind: 'work', reps: 5, load: heavy }] }],
    });
    for (const l of [p.next.load, ...p.perSet.map((x) => x.target.load)]) {
      if (l) expect(fitsSleeve(l.perSide ?? [], 'kg', sleeve)).toBe(true);
    }
    expect(p.next.load?.total ?? 0).toBeLessThan(315);
  });

  it('normal loads still solve exactly with the sleeve check on', () => {
    const lb = makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1);
    const sl: LoadSetup = { unit: 'lb', ...loadSetupFor(lb, 'barbell', 'barbell-back-squat', 'Barbell Back Squat', 'olympic') };
    for (const w of [135, 225, 315, 405]) expect(loadAt('barbell', w, sl)?.total).toBe(w);
    const kg = kgGym();
    const sk: LoadSetup = { unit: 'kg', ...loadSetupFor(kg, 'barbell', 'barbell-back-squat', 'Barbell Back Squat', 'olympic') };
    expect(loadAt('barbell', 100, sk)?.total).toBe(100);
  });
});
