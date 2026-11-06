// Switching the active gym (PLAN 3.9, SPEC 19). Without a workout in progress it is one write. With
// one, the rows still to do are checked against the new gym first (lib/gymSwitch.ts), the preview
// shows what will change, and the switch writes exactly that plan or nothing (a changed workout
// since the preview: SwitchStaleError, the caller previews again). The sets already logged keep the
// gym they were lifted at (WorkoutSet.gymId, additive), so machine and Smith history never moves
// between gyms. Undo puts everything back while nothing was logged since.
import { planById } from '../data/plans';
import { planExercise } from '../data/planExercises';
import { exerciseNameOf } from '../data/importMatch';
import { SWAP_DATA, candidateLoadOf, countsEachSide } from '../data/patterns';
import { dayIndexOf } from '../lib/plans';
import { dayWorkout, doneCounts, quickEntry } from '../lib/planWorkout';
import { liveEntries } from '../lib/swap';
import { planGymSwitch, type SwitchChange, type SwitchPlan } from '../lib/gymSwitch';
import { liveRowAdjustments } from '../lib/extraSets';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Gym, Session, SessionSwap, WorkoutSet } from './types';
import { getActiveSession, WorkoutFinishedError } from './workouts';
import { SwapPendingError } from './swaps';
import { trimmedPlan } from '../lib/timeBudget';

/** The workout changed since the preview: nothing was written; preview again. */
export class SwitchStaleError extends Error {
  constructor() {
    super('The workout changed since the preview');
    this.name = 'SwitchStaleError';
  }
}

/** A set was logged after the switch: it stays at the new gym. Nothing changed. */
export class SwitchUndoStaleError extends Error {
  constructor() {
    super('A set was logged since the switch');
    this.name = 'SwitchUndoStaleError';
  }
}

export class GymMissingError extends Error {
  constructor() {
    super('That gym is gone');
    this.name = 'GymMissingError';
  }
}

export type SwitchPreview = {
  gymId: string;
  /** The workout in progress and what switching does to it; null without one. */
  workout: { sessionId: string; changes: SwitchChange[]; fp: string } | null;
};

export type SwitchReceipt = {
  /** The active gym before, and the one switched to. */
  from: string | null;
  to: string;
  /** The new gym's lastUsedAt before the switch. */
  toLastUsed: number | undefined;
  workout?: {
    sessionId: string;
    gymBefore: string;
    exerciseIds: string[];
    swaps: SessionSwap[] | undefined;
    /** Sets given their gym by the switch (they had none). */
    stamped: string[];
    /** The workout's set count right after the switch. */
    sets: number;
  };
};

const sessionSets = (sessionId: string, db: AnyGymDB) => db.sets.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();

/** The workout's rows as the day list shows them, and what the new gym does to them. */
export function workoutAtGym(session: Session, sets: readonly WorkoutSet[], gym: Pick<Gym, 'equipment' | 'dumbbellRange'>): SwitchPlan {
  const plan = planById(session.planId);
  const dayIndex = plan ? dayIndexOf(plan, session.dayId) : -1;
  const planEntries = plan && dayIndex >= 0 ? dayWorkout(trimmedPlan(plan, dayIndex, session.trim, session.weekIndex ?? 0), dayIndex, session.weekIndex ?? 0) : [];
  const byPlan = new Map(planEntries.map((e) => [e.exerciseId, e]));
  const nameOf = (id: string) => byPlan.get(id)?.name ?? exerciseNameOf(id) ?? id;
  const loadOf = (id: string) => planExercise(id)?.loadType ?? candidateLoadOf(id);
  const exerciseIds = session.exerciseIds ?? [];
  const rows = liveEntries({
    planEntries,
    exerciseIds,
    make: (id, block) => quickEntry(id, nameOf(id), loadOf(id), block),
    swaps: session.swaps,
    adjust: liveRowAdjustments(session.id, new Set(sets.map((s) => s.id))),
    sets,
    nameOf,
    eachSideOf: countsEachSide,
  });
  const done = doneCounts(rows, sets);
  return planGymSwitch(
    SWAP_DATA,
    { exerciseIds, swaps: session.swaps ?? [] },
    rows.map((e) => ({
      id: e.exerciseId,
      seconds: e.seconds !== undefined || (e.reps === undefined && loadOf(e.exerciseId) === 'timed'),
      finisher: !!e.finisher,
      finished: e.sets > 0 && (done[e.exerciseId] ?? 0) >= e.sets,
      logged: sets.some((s) => s.exerciseId === e.exerciseId),
    })),
    gym,
  );
}

/** What switching to this gym would change, read in one snapshot. */
export async function previewGymSwitch(gymId: string, db: AnyGymDB = defaultDb): Promise<SwitchPreview> {
  return db.transaction('r', [db.gyms, db.sessions, db.sets], async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new GymMissingError();
    const session = await getActiveSession(db);
    if (!session) return { gymId, workout: null };
    const { changes } = workoutAtGym(session, await sessionSets(session.id, db), gym);
    return { gymId, workout: { sessionId: session.id, changes, fp: JSON.stringify(changes) } };
  });
}

async function activate(gymId: string, now: number, db: AnyGymDB): Promise<{ from: string | null; toLastUsed: number | undefined }> {
  const gyms = await db.gyms.orderBy('createdAt').toArray();
  const before = gyms.find((g) => g.isActive) ?? gyms[0];
  const target = gyms.find((g) => g.id === gymId);
  if (!target) throw new GymMissingError();
  for (const g of gyms) {
    const isActive = g.id === gymId;
    if (isActive) await db.gyms.put({ ...g, isActive: true, lastUsedAt: now });
    else if (g.isActive) await db.gyms.put({ ...g, isActive: false });
  }
  return { from: before?.id ?? null, toLastUsed: target.lastUsedAt };
}

/**
 * Makes `gymId` the active gym. With a workout in progress, `expect` is the preview's fingerprint:
 * the workout's rows change exactly as previewed or nothing is written (SwitchStaleError).
 */
export async function switchGym(gymId: string, expect: string | null, db: AnyGymDB = defaultDb, now = Date.now()): Promise<SwitchReceipt> {
  return db.transaction('rw', [db.gyms, db.sessions, db.sets, db.journal, db.submissions], async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new GymMissingError();
    const session = await getActiveSession(db);
    if (!session) {
      if (expect !== null) throw new SwitchStaleError();
      return { to: gymId, ...(await activate(gymId, now, db)) };
    }
    // A Log set or a change that has not landed stays in front of the lifter, at the gym it was typed at.
    for (const j of await db.journal.where('sessionId').equals(session.id).toArray()) {
      if (j.mutation || !((await db.sets.get(j.id)) || (await db.submissions.get(j.id)))) throw new SwapPendingError();
    }
    const sets = await sessionSets(session.id, db);
    const plan = workoutAtGym(session, sets, gym);
    if (JSON.stringify(plan.changes) !== expect) throw new SwitchStaleError();
    const stamped: string[] = [];
    if (session.gymId !== gymId) {
      for (const x of sets) {
        if (x.gymId !== undefined) continue;
        await db.sets.put({ ...x, gymId: session.gymId });
        stamped.push(x.id);
      }
    }
    const updated: Session = { ...session, gymId, exerciseIds: plan.state.exerciseIds };
    if (plan.state.swaps.length) updated.swaps = plan.state.swaps;
    else delete updated.swaps;
    await db.sessions.put(updated);
    const active = await activate(gymId, now, db);
    return {
      to: gymId,
      ...active,
      workout: { sessionId: session.id, gymBefore: session.gymId, exerciseIds: session.exerciseIds ?? [], swaps: session.swaps, stamped, sets: sets.length },
    };
  });
}

/** Undo of switchGym: the gym before is active again and the workout is exactly as it was. */
export async function undoGymSwitch(r: SwitchReceipt, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.gyms, db.sessions, db.sets], async () => {
    if (r.workout) {
      const w = r.workout;
      const s = await db.sessions.get(w.sessionId);
      if (!s || s.endedAt !== undefined) throw new WorkoutFinishedError();
      if ((await sessionSets(w.sessionId, db)).length !== w.sets) throw new SwitchUndoStaleError();
      const back: Session = { ...s, gymId: w.gymBefore, exerciseIds: w.exerciseIds };
      if (w.swaps?.length) back.swaps = w.swaps;
      else delete back.swaps;
      await db.sessions.put(back);
      for (const id of w.stamped) {
        const x = await db.sets.get(id);
        if (!x) continue;
        const next = { ...x };
        delete next.gymId;
        await db.sets.put(next);
      }
    }
    const gyms = await db.gyms.toArray();
    const from = r.from && gyms.some((g) => g.id === r.from) ? r.from : null;
    for (const g of gyms) {
      const isActive = from ? g.id === from : g.isActive;
      const next: Gym = { ...g, isActive };
      if (g.id === r.to && g.id !== from) {
        if (r.toLastUsed === undefined) delete next.lastUsedAt;
        else next.lastUsedAt = r.toLastUsed;
      }
      if (next.isActive !== g.isActive || next.lastUsedAt !== g.lastUsedAt) await db.gyms.put(next);
    }
  });
}
