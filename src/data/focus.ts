// Detailed priorities come from source muscles and the reviewed muscle overrides, never names.
import { musclesForCatalog, musclesForPlan } from './muscles';
import type { FocusPickId } from '../lib/intake/options';
import type { Profile } from '../lib/order';

type Target = { muscle: string; label: string };
/** The picks a list of sure muscles stands for. */
function picksOf(targets: readonly Target[]): FocusPickId[] {
  const source = targets.map((m) => m.muscle);
  const labels = targets.map((m) => m.label.toLowerCase());
  const picks: FocusPickId[] = [];
  const has = (muscle: string, ...ids: FocusPickId[]) => { if (source.includes(muscle)) picks.push(...ids); };
  has('chest', 'chest');
  if (labels.includes('upper chest')) picks.push('upper_chest');
  has('lats', 'back', 'lats'); has('middle back', 'back', 'upper_back');
  has('lower back', 'back', 'lower_back');
  for (const [label, pick] of [['front delts', 'front_delts'], ['side delts', 'side_delts'], ['rear delts', 'rear_delts']] as const) {
    if (labels.includes(label)) picks.push('shoulders', pick);
  }
  has('biceps', 'arms', 'biceps'); has('triceps', 'arms', 'triceps'); has('forearms', 'arms', 'forearms', 'grip');
  has('abdominals', 'core', 'abs'); has('obliques', 'core', 'obliques');
  has('glutes', 'glutes'); has('quadriceps', 'legs', 'quads'); has('hamstrings', 'legs', 'hamstrings'); has('calves', 'legs', 'calves');
  // Work toward posture with back/rear shoulder strength; no promise to correct posture.
  if (source.includes('middle back') || labels.includes('rear delts')) picks.push('posture');
  return [...new Set(picks)];
}

/** `also` (PLAN 3.6g2): the picks the move works as a helper muscle (a row for the lats). Never counted as sets; only so the plan does not say nothing here trains them. */
export function focusFacts(id: string, profile: Profile): { muscles: string[]; picks: FocusPickId[]; also?: FocusPickId[] } {
  const map = musclesForPlan(id) ?? musclesForCatalog(id);
  if (profile.role === 'stretch' && ['static-quadricep-stretch', 'static-proximal-hamstring-stretch', 'static-pigeon-stretch'].includes(id)) return { muscles: [], picks: ['mobility'] };
  if (!map || profile.role !== 'lift') return { muscles: [], picks: [] };
  const source = map.primary.map((m) => m.muscle);
  const labels = map.primary.map((m) => m.label.toLowerCase());
  const canonical: Record<string, string> = { lats: 'back', 'middle back': 'back', quadriceps: 'quads', abdominals: 'abs' };
  const muscles = source.flatMap((m) => m === 'shoulders' ? labels.filter((l) => l.endsWith('delts')) : [canonical[m] ?? m]);
  const picks = picksOf(map.primary);
  return { muscles: [...new Set(muscles)], picks, also: picksOf(map.secondary).filter((x) => !picks.includes(x)) };
}

/** Existing audited plan stretches, with known floor-only requirements (data/patterns.json). */
export const FOCUS_MOBILITY = ['static-quadricep-stretch', 'static-proximal-hamstring-stretch', 'static-pigeon-stretch'].map((id) => ({ id, requires: [], timed: true as const }));
