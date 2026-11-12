// workoutWins is the first call inside a liveQuery on the workout screen (the live "New best" chip).
// It used to open its own transaction there and Dexie aborted it (PrematureCommitError).
import 'fake-indexeddb/auto';
import { liveQuery } from 'dexie';
import { describe, expect, it } from 'vitest';
import { finishedWins, workoutWins } from '../history';
import { AnyGymDB } from '../schema';
import { finishWorkout, logSet, startWorkout } from '../workouts';

const bar = (total: number) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] }) as never;

const firstValue = <T>(f: () => Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const sub = liveQuery(f).subscribe({
      next: (v) => {
        sub.unsubscribe();
        resolve(v);
      },
      error: reject,
    });
  });

describe('workoutWins inside a liveQuery', () => {
  it('works as the first call, after other work, and agrees with finishedWins', async () => {
    const db = new AnyGymDB('wins-livequery');
    await db.open();
    for (const [i, w] of [185, 195].entries()) {
      const s = await startWorkout('g1', db, 1000 + i * 100000);
      await logSet({ id: `s${i}`, sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 5, load: bar(w), kind: 'work' }, db);
      await finishWorkout(s.id, db, 2000 + i * 100000);
    }
    const id = (await db.sessions.orderBy('startedAt').last())!.id;
    const live = await firstValue(() => workoutWins(id, (x) => x, db));
    expect(live.records).toHaveLength(1);
    expect(live.win).not.toBeNull();
    const later = await firstValue(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return workoutWins(id, (x) => x, db);
    });
    expect(later).toEqual(live);
    const finished = await firstValue(() => finishedWins(id, (x) => x, db));
    expect(finished!.groups.flatMap((g) => g.records)).toEqual(live.records);
  });
});
