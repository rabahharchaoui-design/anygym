// Tester checks for PLAN 3.5d (independent of quick-3.5d.test.ts). Prints card lists to /tmp/v35d-cards.txt.
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import type { GymKit } from '../picker';
import { buildIdeas, nextSwap, QUICK_MINUTES, type Concept } from '../quick';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const out: string[] = [];

describe('verify 3.5d check 7: full gym, no history, lists', () => {
  for (const exp of [undefined, '1_2y', '3y'] as const)
    it(`cards ${exp ?? 'no intake'}`, () => {
      let repeats = 0;
      for (const minutes of QUICK_MINUTES) {
        const ideas = buildIdeas({ base: { goals: ['muscle'], gym: FULL, ...(exp ? { experience: exp } : {}) }, minutes, recent: [] }, QUICK_DEPS);
        out.push(`## ${exp ?? 'none'} ${minutes} min: cards=${ideas.cards.map((c) => c.id).join(',')} more=${ideas.more.map((c) => c.id).join(',')}`);
        const seen = new Map<string, string>();
        ideas.cards.forEach((c: Concept, ci) => {
          out.push(`  [${ci}] ${c.id} "${c.title}" ${c.minutes}min | ${c.line} | ${c.items.map((i) => i.name + (i.group ? `(g${i.group})` : '')).join('; ')}`);
          for (const it of c.items) {
            const k = SWAP_DATA.sameAs(it.id);
            if (seen.has(k)) {
              repeats++;
              const taken = ideas.cards.filter((x) => x !== c).flatMap((x) => x.items.map((y) => y.id));
              const alt = nextSwap(it, c.items, [], { data: SWAP_DATA, gym: FULL, ok: QUICK_DEPS.usable, profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name, avoid: taken });
              out.push(`     REPEAT ${it.name} (also in ${seen.get(k)}) pattern=${it.pattern} slot=${it.slot} alt-with-demo=${alt ?? 'none'}`);
            } else seen.set(k, c.id);
          }
        });
        if (minutes > 30) expect(ideas.cards.concat(ideas.more).some((c) => c.id === 'armsAbs')).toBe(false);
        expect(ideas.cards[0]!.id).not.toBe('armsAbs');
      }
      out.push(`TOTAL repeats ${exp ?? 'none'}: ${repeats}`);
      writeFileSync('/tmp/v35d-cards.txt', out.join('\n'));
    });
  it('no intake gets Easy start and no Strength focus', () => {
    for (const minutes of QUICK_MINUTES) {
      const i = buildIdeas({ base: { goals: ['muscle'], gym: FULL }, minutes, recent: [] }, QUICK_DEPS);
      const all = [...i.cards, ...i.more];
      expect(all.some((c) => c.id === 'strength')).toBe(false);
      expect(all.some((c) => /easy/i.test(c.title)), `${minutes} easy`).toBe(true);
    }
  });
});

describe('verify 3.5d check 8: chest trained yesterday', () => {
  const NOW = new Date(2026, 10, 9, 18, 0).getTime();
  const lines: string[] = [];
  it('lists cards, chest moves, why lines', () => {
    const lastTrained = { chest: NOW - DAYMS, 'front delts': NOW - DAYMS, triceps: NOW - DAYMS, back: NOW - 5 * DAYMS, biceps: NOW - 5 * DAYMS, quads: NOW - 4 * DAYMS, glutes: NOW - 4 * DAYMS, hamstrings: NOW - 4 * DAYMS } as never;
    for (const minutes of QUICK_MINUTES) {
      const ideas = buildIdeas({ base: { goals: ['muscle'], gym: FULL, experience: '1_2y' }, minutes, recent: ['chest'] as never, lastTrained, now: NOW }, QUICK_DEPS);
      lines.push(`## ${minutes}`);
      for (const c of ideas.cards) {
        const chest = c.items.filter((it) => QUICK_DEPS.profile(it.id).targets.includes('chest' as never));
        lines.push(`  ${c.id} | why: ${c.line} | chest moves: ${chest.map((i) => i.name).join(',') || 'none'} | ${c.items.map((i) => i.name).join('; ')}`);
      }
      const l = ideas.cards.map((c) => c.line);
      expect(new Set(l).size, l.join(' / ')).toBe(l.length);
    }
    writeFileSync('/tmp/v35d-48h.txt', lines.join('\n'));
  });
});
const DAYMS = 86_400_000;

describe('verify 3.5d r2 check 5 and 2: cross card, 48 h', () => {
  it('3y lifter cards: lat pulldown / deadlift replacements', () => {
    const lines: string[] = [];
    for (const minutes of QUICK_MINUTES) {
      const ideas = buildIdeas({ base: { goals: ['muscle'], gym: FULL, experience: '3y' }, minutes, recent: [] }, QUICK_DEPS);
      for (const c of ideas.cards) lines.push(`${minutes} ${c.id}: ${c.items.map((i) => `${i.name}[${i.sets}x${i.reps ?? ''}]`).join('; ')}`);
    }
    writeFileSync('/tmp/v35d-3y.txt', lines.join('\n'));
  });
  it('48 h: no style card has a chest move (any experience)', () => {
    const NOW = new Date(2026, 10, 9, 18, 0).getTime();
    const lastTrained = { chest: NOW - DAYMS, 'front delts': NOW - DAYMS, triceps: NOW - DAYMS } as never;
    const bad: string[] = [];
    for (const experience of [undefined, '1_2y', '3y'] as const)
      for (const minutes of QUICK_MINUTES) {
        const ideas = buildIdeas({ base: { goals: ['muscle'], gym: FULL, ...(experience ? { experience } : {}) }, minutes, recent: ['chest'] as never, lastTrained, now: NOW }, QUICK_DEPS);
        for (const c of [...ideas.cards, ...ideas.more])
          if (c.id !== 'plan') for (const it of c.items) if (QUICK_DEPS.profile(it.id).targets.includes('chest' as never)) bad.push(`${experience} ${minutes} ${c.id} ${it.name}`);
      }
    expect(bad).toEqual([]);
  });
});
