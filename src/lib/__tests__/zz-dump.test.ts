import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { PLANS } from '../../data/plans';
import { presetEquipment } from '../intake/funnel';
import type { GymKit } from '../picker';
import type { GeneratorInput } from '../generator';
import type { Muscle } from '../order';
import { buildStyleCards, buildIdeas, metaLine, planConcept, shortLine, QUICK_MINUTES, type Concept } from '../quick';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const HOTEL: GymKit = { equipment: presetEquipment('hotel'), dumbbellRange: { min: 5, max: 50, step: 5 } };
const NOW = new Date(2026, 10, 9, 18, 0).getTime();
const DAY = 86_400_000;
const show = (c: Concept) => `  [${c.id}${c.variant ? ':' + c.variant : ''}] ${c.title} | ${c.chip} | ${metaLine(c.items, c.minutes)} | ${c.line}${shortLine(c) ? ' | SHORT: ' + shortLine(c) : ''}\n` + c.items.map((it) => `      ${it.group ?? '-'} ${it.name} ${it.sets}x${JSON.stringify(it.reps ?? it.seconds)} r${it.restSec}`).join('\n');
function dump(label: string, base: GeneratorInput, hist: boolean, plan = false) {
  const lastTrained: Partial<Record<Muscle, number>> = hist ? { quads: NOW - DAY, glutes: NOW - DAY, hamstrings: NOW - DAY, back: NOW - 4 * DAY, biceps: NOW - 4 * DAY, 'side delts': NOW - 6 * DAY, chest: NOW - 5 * DAY } : {};
  const recent: Muscle[] = hist ? ['quads', 'glutes', 'hamstrings'] : [];
  const out: string[] = [];
  for (const m of QUICK_MINUTES) {
    const p = plan ? planConcept({ plan: PLANS.find((x) => x.id === 'five-day-split')!, dayIndex: 1, weekIndex: 0, minutes: m, gym: base.gym, experience: base.experience, ...(base.easyOn ? { easyOn: base.easyOn } : {}) }, QUICK_DEPS) : null;
    const ideas = buildIdeas({ base, minutes: m, recent, lastTrained, now: NOW, recentWhen: 'yesterday', plan: p }, QUICK_DEPS);
    out.push(`== ${label} ${m} min: ${ideas.cards.length} cards, swapAt ${ideas.swapAt}, more: ${ideas.more.map((c, i) => c.id + ':' + c.variant + '@' + ideas.moreAt[i]).join(', ')}${ideas.fewer ? ' | FEWER: ' + ideas.fewer : ''}`);
    for (const c of ideas.cards) out.push(show(c) + '\n      primary: ' + [...c.primary].join('/'));
    if (process.env.ALL) for (const [id, cs] of buildStyleCards({ base, minutes: m, recent }, QUICK_DEPS)) for (const c of cs) out.push(`   avail ${id}:${c.variant} ${c.items.length}x ${c.minutes}m [${[...c.primary].join('/')}] ${c.items.map((it) => it.name).join(', ')}`);
  }
  appendFileSync('/tmp/dump35b.txt', out.join('\n') + '\n');
}
it('dump', () => {
  const which = process.env.DUMP ?? 'all';
  if (which === 'all' || which === 'hotel') dump('HOTEL hist 1_2y', { goals: ['muscle'], experience: '1_2y', gym: HOTEL }, true);
  if (which === 'all' || which === 'hotel0') dump('HOTEL nohist 1_2y', { goals: ['muscle'], experience: '1_2y', gym: HOTEL }, false);
  if (which === 'all' || which === 'knees') dump('BEGINNER knees full', { goals: ['muscle'], experience: 'new', easyOn: ['knees'], gym: FULL }, false);
  if (which === 'all' || which === 'full') dump('FULL 1_2y nohist', { goals: ['muscle'], experience: '1_2y', gym: FULL }, false);
  if (which === 'all' || which === 'plan') dump('FULL plan hist', { goals: ['muscle'], experience: '1_2y', gym: FULL }, true, true);
}, 60000);
