// The coach on Today (PLAN 3.8, SPEC 15): one live read of the logged workouts and the coach's
// rows, the engine's single recommendation, and Auto level up applied once when it is on.
import { useEffect, useMemo, useRef } from 'react';
import { useLive } from '../../hooks/useLive';
import { coachData, regionWord, weekdaysOf, type CoachData } from '../../db/coachData';
import { applyChanges, resolveOutcomes } from '../../db/coach';
import { planById } from '../../data/plans';
import { coachToday, currentEstimate, freshBands, learnedScale, newOutcomes, weeklyRate, type CoachToday, type FreshBand } from '../../lib/coach';
import type { Region } from '../../lib/bodyArt';
import type { CoachLiftRow } from '../../db/coachTypes';

export type CoachView = {
  /** The first read landed (or failed: then the coach stays quiet, Today still works). */
  ready: boolean;
  today: CoachToday | null;
  data: CoachData | undefined;
  /** Fresh muscles: regions by band, only from logged sets; empty without any. */
  fresh: Partial<Record<Region, FreshBand>>;
};

const NONE: Partial<Record<Region, FreshBand>> = {};

/** What the engine learned for each lift (stored on its row when a change lands). Internal only. */
export function learnedOf(data: CoachData, now: number): Record<string, CoachLiftRow['learned']> {
  const out: Record<string, CoachLiftRow['learned']> = {};
  for (const l of data.lifts) {
    const unit = l.setup?.unit ?? 'lb';
    out[l.key] = { estimate: currentEstimate(l.sessions, unit), rate: weeklyRate(l.sessions, unit, now), scale: learnedScale(l, data.changes), at: now };
  }
  return out;
}

export function useCoach(enabled: boolean): CoachView {
  const live = useLive(() => (enabled ? coachData(Date.now()) : Promise.resolve(undefined)), [enabled]);
  const data = live.data;
  const today = useMemo(() => {
    if (!data) return null;
    const plan = planById(data.planState?.planId);
    return coachToday({
      now: data.now,
      lifts: data.lifts,
      dates: data.dates,
      changes: data.changes,
      closed: data.closed,
      autoLevelUp: data.profile?.coach?.autoLevelUp === true,
      activeWorkout: data.active,
      ...(plan ? { plan: { daysPerWeek: plan.daysPerWeek, weekdays: weekdaysOf(data.profile) } } : {}),
      ...(data.recovery ? { recovery: { ...data.recovery, nameOf: regionWord } } : {}),
    });
  }, [data]);
  const fresh = useMemo(() => (data ? freshBands(data.fresh, data.now) : NONE), [data]);

  // Codex 3.8 #3: each raise's outcome is judged once and stored, as soon as it can be.
  useEffect(() => {
    if (!data) return;
    const list = newOutcomes(data.lifts, data.changes);
    if (list.length) resolveOutcomes(list).catch(() => undefined);
  }, [data]);

  // Auto level up (SPEC 15): last week's earned raises, applied once, on their own.
  const applying = useRef<string | null>(null);
  const auto = today?.autoApply ?? null;
  useEffect(() => {
    if (!auto || !data || applying.current === auto.cardId) return;
    applying.current = auto.cardId;
    const now = Date.now();
    applyChanges(auto.cardId, auto.weekKey, auto.earned.map((c) => ({ ...c, source: 'auto' as const })), undefined, now, learnedOf(data, now)).catch(() => {
      applying.current = null;
    });
  }, [auto, data]);

  return { ready: !enabled || live.ready, today: live.error ? null : today, data, fresh: live.error ? NONE : fresh };
}
