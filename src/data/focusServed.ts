// PLAN 3.6f: which focus choices the app cannot serve yet. Read from the same ladders and muscle
// facts the generator uses, never a list of names: when a sure move is added, the note goes away.
import { FOCUS_PICKS, type FocusPickId } from '../lib/intake/options';
import { workoutIdOf } from '../lib/swap';
import { focusFacts } from './focus';
import { profileFor } from './order';
import { SWAP_DATA } from './patterns';

/**
 * The choices no lift in any ladder trains, whatever the gym: picking one adds nothing to a plan
 * yet, and the focus step says so before it is picked. Mobility is stretch time and has its own
 * moves; balance asks for nothing.
 */
export function focusNotYet(): ReadonlySet<FocusPickId> {
  const served = new Set<FocusPickId>(['balance', 'mobility']);
  for (const [pattern, ladder] of Object.entries(SWAP_DATA.patterns)) {
    for (const c of ladder.candidates) {
      // The generator only takes a timed move for the core.
      if (c.timed && pattern !== 'core') continue;
      const id = workoutIdOf(c);
      const profile = profileFor(id);
      if (profile.role !== 'lift') continue;
      for (const pick of focusFacts(id, profile).picks) served.add(pick);
    }
  }
  return new Set(FOCUS_PICKS.map((p) => p.id).filter((id) => !served.has(id)));
}
