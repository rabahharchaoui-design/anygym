import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { generate } from '../../data/generator';
import { presetEquipment } from '../intake/funnel';
import { equipmentPreset } from '../../db/gyms';
import { intakeDeck } from '../intake/exerciseDeck';
import { buildIdeas, quickDepsFor, swapPool, sixOf, focusCards, type QuickItem } from '../quick';
import { profileFor } from '../../data/order';
import { workoutIdOf } from '../swap';
import type { GeneratorInput } from '../generator';

const CAND = new Set((JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { candidates: { id: string; name: string }[] }).candidates.map((c) => c.id.toLowerCase().replace(/_/g, '-')));
const CAND_RAW = new Set((JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { candidates: { id: string }[] }).candidates.map((c) => c.id));
const bad = (id: string) => CAND_RAW.has(id) || CAND.has(id);
const gym = { equipment: presetEquipment('full'), dumbbellRange: equipmentPreset('full', 'lb').dumbbellRange };
const base: GeneratorInput = { goals: ['muscle'], gym, experience: '1_2y' } as GeneratorInput;

describe('verify 3.5f parts 1+gate', () => {
  it('ladders hold no candidate id; intake deck, swap pools, six: none', () => {
    const all = Object.values(SWAP_DATA.patterns).flatMap((l) => l.candidates.map(workoutIdOf));
    expect(all.filter(bad)).toEqual([]);
    const deps = quickDepsFor(base, QUICK_DEPS);
    const deck = intakeDeck(gym as never, { data: SWAP_DATA, usable: deps.usable });
    expect(deck.length).toBeGreaterThan(5);
    expect(deck.filter(bad)).toEqual([]);
    let pools = 0;
    for (const minutes of [15, 30, 45, 60]) {
      const ideas = buildIdeas({ base, minutes, recent: [] }, QUICK_DEPS);
      const cards = [...ideas.cards, ...focusCards({ base, minutes, recent: [] }, QUICK_DEPS)];
      for (const c of cards)
        for (const it of c.items as QuickItem[]) {
          expect(bad(it.id)).toBe(false);
          const pool = swapPool(it, c.items, [], { data: SWAP_DATA, gym: gym as never, ok: deps.usable, profile: (id) => profileFor(id) });
          pools++;
          expect(sixOf(pool).length).toBeLessThanOrEqual(6);
          expect(pool.filter((o) => bad(o.id))).toEqual([]);
        }
    }
    expect(pools).toBeGreaterThan(30);
  });

  it('loved moves are included where they fit; never moves are excluded from plan and quick cards', () => {
    const plain = generate(base);
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    const ids = (p: typeof plain.plan) => p.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === 'single' ? [b.id] : b.items.map((i) => i.id))));
    const plainIds = ids(plain.plan);
    const neverId = plainIds[0]!;
    // a sure chest/back move not in the plain plan
    const sure = Object.values(SWAP_DATA.patterns).flatMap((l) => l.candidates.map(workoutIdOf)).filter((id) => QUICK_DEPS.usable(id) && !plainIds.includes(id));
    const loveId = sure.find((id) => profileFor(id).role === 'lift' && profileFor(id).pattern === 'biceps') ?? sure[0]!;
    const r = generate({ ...base, love: [loveId], never: [neverId] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const got = ids(r.plan);
    expect(got.includes(loveId), `love ${loveId} included`).toBe(true);
    expect(got.map((x) => SWAP_DATA.sameAs(x))).not.toContain(SWAP_DATA.sameAs(neverId));
    // quick cards
    for (const minutes of [15, 30, 45, 60]) {
      const cards = [...buildIdeas({ base: { ...base, never: [neverId] }, minutes, recent: [] }, QUICK_DEPS).cards, ...focusCards({ base: { ...base, never: [neverId] }, minutes, recent: [] }, QUICK_DEPS)];
      for (const c of cards) expect(c.items.map((i) => SWAP_DATA.sameAs(i.id))).not.toContain(SWAP_DATA.sameAs(neverId));
    }
    // never beats love
    const both = generate({ ...base, love: [neverId], never: [neverId] });
    if (both.ok) expect(ids(both.plan).map((x) => SWAP_DATA.sameAs(x))).not.toContain(SWAP_DATA.sameAs(neverId));
    console.log('neverId', neverId, 'loveId', loveId);
  });
});
