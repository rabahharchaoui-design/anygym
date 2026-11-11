// The pre check (PLAN 3.5i): data/candidate-precheck.json lists the candidate ids the orchestrator
// was unsure about when it looked at their photos, and why. Those are shown first, one by one; all
// the others go to the grid. It only sorts the piles: nothing in it approves anything. Its own
// chunk, loaded only by the owner Review screen. Missing, empty or broken: everything is grid mode.
import { NO_PRECHECK, parsePrecheck, type Precheck } from '../lib/candidates/fastReview';

let loaded: Promise<Precheck> | null = null;

export function loadPrecheck(): Promise<Precheck> {
  loaded ??= import('../../data/candidate-precheck.json').then(
    (m) => parsePrecheck(m.default),
    () => NO_PRECHECK,
  );
  return loaded;
}
