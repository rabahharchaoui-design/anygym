// PLAN 2.0j (1): catalog photos only for exact and variant matches kept by the 2.5 audit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demoForPlan, infoForCatalog, infoForPlan, ownerPreviewForCatalog, photoEligibility } from '../exerciseInfo';
import { CATALOG, EXERCISE_MAP } from '../muscles';
import { exercisesForMuscle } from '../muscleExercises';

const audit = readFileSync('reports/audit-2.5.md', 'utf8')
  .split('\n')
  .filter((l) => /^\| [a-z0-9-]+ \|/.test(l) && !l.startsWith('| planId'))
  .map((l) => l.split('|').map((c) => c.trim()))
  .map((c) => ({ planId: c[1]!, match: c[2]!, catalogId: c[3]!, verdict: c[6]! }));
// PLAN 3.5a round 2: plus the catalog only swap candidates checked by hand (data/catalog-demos.json).
const handChecked = (JSON.parse(readFileSync('data/catalog-demos.json', 'utf8')) as { exercises: { catalogId: string; reason: string }[] }).exercises;
const keptIds = new Set([...audit.filter((a) => a.verdict === 'keep').map((a) => a.catalogId), ...handChecked.map((e) => e.catalogId)]);
const rejectedIds = new Set(audit.filter((a) => a.verdict !== 'keep').map((a) => a.catalogId));

describe('catalog photo eligibility', () => {
  it('the hand checked list only adds catalog exercises no audit rejected, each with its reason', () => {
    for (const e of handChecked) {
      expect(rejectedIds.has(e.catalogId), e.catalogId).toBe(false);
      expect(e.reason.length).toBeGreaterThan(10);
      expect(CATALOG.some((c) => c.id === e.catalogId)).toBe(true);
    }
  });

  it('reads the audit table', () => {
    expect(audit.length).toBe(48);
    expect(keptIds.size).toBeGreaterThan(30);
  });

  it('every catalog id: photos only when the audit kept it', () => {
    for (const e of CATALOG) {
      const info = infoForCatalog(e.id);
      const kept = keptIds.has(e.id);
      expect(photoEligibility(e.id) !== 'none', e.id).toBe(kept);
      expect(!!info.demo, e.id).toBe(kept);
      expect(info.match === 'exact', `${e.id} never a synthesized exact`).toBe(kept && photoEligibility(e.id) === 'exact');
    }
  });

  it('muscle lists carry no thumbnail for ineligible ids', () => {
    for (const region of ['abs', 'chest', 'upper-back'] as const) {
      for (const row of exercisesForMuscle(region)) expect(!!row.thumb, row.id).toBe(keptIds.has(row.id));
    }
  });

  it('Plank and Close-Grip_Front_Lat_Pulldown never regain public photos', () => {
    for (const id of ['Plank', 'Close-Grip_Front_Lat_Pulldown']) {
      expect(rejectedIds.has(id) || !keptIds.has(id)).toBe(true);
      expect(infoForCatalog(id).demo).toBeNull();
      expect(photoEligibility(id)).toBe('none');
    }
    for (const p of ['plank', 'elbow-plank', 'narrow-grip-lat-pulldown']) {
      expect(infoForPlan(p).demo).toBeNull();
      expect(demoForPlan(p)).toBeNull();
    }
  });

  it('plan entries and unknown ids agree with the same lookup', () => {
    for (const m of EXERCISE_MAP) {
      expect(!!infoForPlan(m.planId).demo, m.planId).toBe(m.match !== 'none' && photoEligibility(m.catalogId) !== 'none');
    }
    expect(infoForCatalog('Not_A_Real_Id').demo).toBeNull();
    expect(photoEligibility(null)).toBe('none');
  });

  it('keeps verified muscles for a photo reject, and the owner preview is separate', () => {
    expect(infoForCatalog('Plank').muscles).not.toBeNull();
    expect(ownerPreviewForCatalog('Plank').demo).not.toBeNull();
    expect(ownerPreviewForCatalog('Close-Grip_Front_Lat_Pulldown').demo).not.toBeNull();
  });
});
