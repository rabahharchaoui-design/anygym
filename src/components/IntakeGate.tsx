import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { startDb } from '../db/bootstrap';
import { intakeDoneHere, intakeDraftHere, intakeToResume, needsIntake } from '../db/intake';

/**
 * PLAN 3.3: a brand new user opening Today goes to the intake funnel first. Anyone who finished it,
 * or used the app before it (a profile, a workout, a plan), never sees it open by itself: the local
 * flag answers on the first paint, the database answers once otherwise. A funnel left unfinished
 * (a draft, nothing started yet) is picked up again. Other screens pass through.
 */
export function IntakeGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const home = pathname === '/' || pathname === '';
  const [state, setState] = useState<'done' | 'checking' | 'needed'>(() => (intakeDoneHere() && !intakeDraftHere() ? 'done' : 'checking'));
  useEffect(() => {
    if (state !== 'checking' || !home) return;
    let alive = true;
    startDb()
      .then(async () => (await needsIntake()) || (await intakeToResume()))
      // Storage that cannot be read never blocks the app: Today shows, as before.
      .then(
        (needed) => alive && setState(needed ? 'needed' : 'done'),
        () => alive && setState('done'),
      );
    return () => {
      alive = false;
    };
  }, [state, home]);
  if (!home) return <>{children}</>;
  if (state === 'needed') return <Navigate to="/welcome" replace />;
  if (state === 'checking') return null;
  return <>{children}</>;
}
