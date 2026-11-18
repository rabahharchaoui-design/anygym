import { useCallback, useEffect, useState } from 'react';
import { runEngine, useRunEngine } from '../../hooks/useRunEngine';
import { warmVoicePack } from '../../hooks/voiceWarm';
import { distanceWithUnit, readLiveAt } from '../../lib/run';
import { formatElapsed } from '../../lib/timer';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { LiveRun } from './LiveRun';
import { RunStart } from './RunStart';
import { RunSummary } from './RunSummary';

/**
 * The Run tab (SPEC 12). One of three things shows: the start screen, the live run over
 * everything, or the summary of the run that just ended. The run itself lives in the engine
 * (hooks/runEngine), so it goes on when this screen is hidden or another tab shows; a run that was
 * going when the app closed comes straight back here, paused.
 */
export function RunScreen() {
  const engine = useRunEngine();
  const reduceMotion = useReducedMotionLive();
  // The live run fills the screen unless it was hidden with the arrow at its top.
  const [shown, setShown] = useState(true);
  const open = useCallback(() => setShown(true), []);
  const { live, finished } = engine;
  // The voice coach's clips are saved for offline in the background, the first time this tab opens.
  useEffect(() => warmVoicePack(), []);

  if (finished) return <RunSummary finished={finished} reduceMotion={reduceMotion} onDone={runEngine.closeFinished} onDiscard={() => void runEngine.discardFinished()} />;
  if (live && shown) return <LiveRun live={live} wake={engine.wake} saveFailed={engine.saveFailed} reduceMotion={reduceMotion} onHide={() => setShown(false)} />;
  // The time as the live screen showed it when it was hidden (PLAN 4.4a).
  const reading = live ? readLiveAt(live, Date.now()) : null;
  const going = live && reading ? { readout: `${distanceWithUnit(reading.distanceM, live.unit)} · ${formatElapsed(reading.movingSec)}`, paused: reading.status === 'paused' } : null;
  return <RunStart going={going} onOpen={open} reduceMotion={reduceMotion} />;
}
