import { it } from 'vitest';
import { equipmentPreset } from '../../src/db/gyms';
import { generate } from '../../src/data/generator';
const full = equipmentPreset('full', 'lb');
const show = (label: string, input: Parameters<typeof generate>[0]) => {
  const r = generate(input);
  if (!r.ok) { console.log(label, 'FAIL', r.reason); return; }
  console.log(`== ${label}: ${r.plan.name}`);
  for (const d of r.plan.days) console.log('  ', d.name, '|', d.blocks.map((b) => (b.type === 'single' ? `${b.exercise} ${b.sets}` : `[${b.items.map((i) => i.exercise).join(' + ')}] ${b.sets}`)).join(' ; '));
};
it('repro', () => {
  const base = { goals: ['muscle' as const], experience: 'new' as const, days: 3, minutes: 45, gym: { equipment: full.equipment, dumbbellRange: full.dumbbellRange }, place: 'full' as const };
  show('frozen (machines)', { ...base, style: 'machines' });
  show('mix no picks', { ...base, style: 'mix' });
  show('mix lats+biceps', { ...base, style: 'mix', focusPicks: ['lats', 'biceps'] as never });
  show('machines lats+biceps', { ...base, style: 'machines', focusPicks: ['lats', 'biceps'] as never });
});
