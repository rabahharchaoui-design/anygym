import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approvedFocusLifts, loadCandidateFile, setApproved } from '../candidateGate';
import { equipmentPreset } from '../../db/gyms';
import { demoFor } from '../exerciseInfo';
import { focusNotYet } from '../focusServed';
import { generate } from '../generator';
import { FOCUS_PICKS } from '../../lib/intake/options';
import { generatorInputOf } from '../../lib/intake/yourPlan';

describe('focusNotYet (PLAN 3.6f)', () => {
  it('names exactly the choices a full gym plan reports as having no sure move', () => {
    const notYet = focusNotYet();
    expect(notYet.has('balance')).toBe(false);
    expect(notYet.has('mobility')).toBe(false);
    for (const { id } of FOCUS_PICKS) {
      if (id === 'balance' || id === 'mobility') continue;
      const built = generate(generatorInputOf({ goal: 'muscle', goals: ['muscle'], days: 4, minutes: 60, experience: '3y', place: 'full', equipmentFor: 'full', focusPicks: [id] } as never));
      if (!built.ok) throw new Error(`no plan for ${id}`);
      const result = built.applied.focusReport!.priorities.find((p) => p.id === id)!;
      expect(notYet.has(id), id).toBe(result.noMove === true);
    }
  });
});

// PLAN 3.6g, point 5. The approved catalog has no lift whose primary muscle is the forearms or the
// obliques (and no farmer's carry, dead hang, wrist curl, reverse curl or plate pinch); its Russian
// twist and side bridge have no sure demo and are reviewed as abs. The candidates have wrist curls
// (primary: forearms), usable only once approved on this phone. Nothing has obliques as its primary
// muscle but two stretches, so Obliques keeps saying "no exercises yet".
describe('Grip, Forearms and Obliques (PLAN 3.6g)', () => {
  const WRIST = 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench';
  beforeAll(async () => { await loadCandidateFile(); setApproved([]); });
  afterAll(() => setApproved([]));
  const build = (pick: 'grip' | 'forearms' | 'obliques', place: 'full' | 'none') => {
    const built = generate({ goals: ['muscle'], experience: '3y', days: 3, minutes: 60, focusPicks: [pick], scheduleStyle: 'flexible', gym: equipmentPreset(place, 'lb') });
    if (!built.ok) throw new Error(built.reason);
    return { report: built.applied.focusReport!.priorities[0]!, ids: built.plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === 'superset' ? b.items.map((x) => x.id) : [b.id]))) };
  };
  it('with nothing approved all three say so, and nothing is invented', () => {
    expect(approvedFocusLifts()).toEqual([]);
    for (const pick of ['grip', 'forearms', 'obliques'] as const) {
      expect(focusNotYet().has(pick), pick).toBe(true);
      expect(build(pick, 'full').report).toMatchObject({ state: 'no_move', extra: 0, total: 0 });
    }
  });
  it('a wrist curl approved on this phone serves Grip and Forearms where the gym has its gear, with its sure demo; Obliques still has no exercise', () => {
    setApproved([WRIST, 'Dumbbell_Side_Bend', 'Standing_Lateral_Stretch']);
    expect(approvedFocusLifts().map((c) => [c.id, c.requires])).toEqual([[WRIST, [['dumbbells'], ['flat_bench', 'adjustable_bench']]]]);
    expect(demoFor(WRIST)).toBeTruthy();
    const notYet = focusNotYet();
    expect(notYet.has('grip')).toBe(false);
    expect(notYet.has('forearms')).toBe(false);
    // A side bend is reviewed as abs and the lateral stretch is a stretch: neither makes Obliques a served choice.
    expect(notYet.has('obliques')).toBe(true);
    for (const pick of ['grip', 'forearms'] as const) {
      const full = build(pick, 'full');
      expect(full.report.state, pick).toBe('extra');
      expect(full.report.extra, pick).toBeGreaterThanOrEqual(4);
      expect(full.report.total, pick).toBeLessThanOrEqual(20);
      expect(full.ids).toContain(WRIST);
      // No dumbbells and no bench: the move is not offered, and the pick says there is no exercise (never a move this gym cannot do).
      const bare = build(pick, 'none');
      expect(bare.ids).not.toContain(WRIST);
      expect(bare.report).toMatchObject({ state: 'no_move', extra: 0 });
    }
    expect(build('obliques', 'full').report.state).toBe('no_move');
  });
  it('no picks: an approved wrist curl changes nothing in a plan', () => {
    const input = { goals: ['muscle' as const], experience: '3y' as const, days: 4, minutes: 60, scheduleStyle: 'flexible' as const, gym: equipmentPreset('full', 'lb') };
    setApproved([]);
    const before = generate(input);
    setApproved([WRIST]);
    expect(generate(input)).toEqual(before);
  });
});
