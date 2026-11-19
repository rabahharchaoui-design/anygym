import { useNavigate, useParams } from 'react-router-dom';
import { useFinishedRuns } from '../../hooks/useRuns';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { RunSummary } from '../run/RunSummary';

/**
 * PLAN M3: the finish screen of a saved run, opened by its id (#/dev/run-summary/<id>?dev), so the
 * screenshot spec can show worst case runs (99.99 mi, 30 splits, a GPS gap) without running them.
 * Only in the dev server and VITE_DEV_PREVIEW=1 builds, like the Monolith preview (App.tsx).
 */
export function RunSummaryDevScreen() {
  const { runId = '' } = useParams();
  const all = useFinishedRuns();
  const reduce = useReducedMotionLive();
  const navigate = useNavigate();
  const run = all.data?.runs.find((r) => r.id === runId);
  if (!run || !all.data) return null;
  const leave = () => navigate('/history');
  return <RunSummary finished={{ run, unit: all.data.unit }} reduceMotion={reduce} onDone={leave} onDiscard={leave} />;
}
