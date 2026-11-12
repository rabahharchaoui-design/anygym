import 'fake-indexeddb/auto';
import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { liveQuery } from 'dexie';
import { AnyGymDB } from '../schema';
import { workoutWins, finishedWins } from '../history';
import { finishWorkout, logSet, startWorkout } from '../workouts';
d2('verify 3.6b premature commit', () => {
  i2('workoutWins inside liveQuery with and without a non-Dexie await', async () => {
    const db = new AnyGymDB('v36b-x'); await db.open();
    const bar = (t: number) => ({ kind: 'barbell', unit: 'lb', total: t, barWeight: 45, perSide: [] }) as never;
    for (const [i, w] of [185, 195].entries()) {
      const s = await startWorkout('g1', db, 1000 + i * 100000);
      await logSet({ id: `s${i}`, sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 5, load: bar(w), kind: 'work' }, db);
      await finishWorkout(s.id, db, 2000 + i * 100000);
    }
    const id = (await db.sessions.orderBy('startedAt').last())!.id;
    const out: string[] = [];
    const run = (label: string, f: () => Promise<unknown>) => new Promise<void>((res) => {
      const sub = liveQuery(f).subscribe({ next: () => { out.push(label + ' ok'); sub.unsubscribe(); res(); }, error: (e) => { out.push(label + ' ERR ' + e.name); res(); } });
    });
    await run('wins-plain', () => workoutWins(id, (x) => x, db));
    await run('wins-after-await', async () => { await new Promise((r) => setTimeout(r, 5)); return workoutWins(id, (x) => x, db); });
    await run('wins-then-other', async () => { const w = await workoutWins(id, (x) => x, db); await new Promise((r) => setTimeout(r, 5)); await finishedWins(id, (x) => x, db); return w; });
    await run('finishedWins', () => finishedWins(id, (x) => x, db));
    require('node:fs').writeFileSync('/tmp/v36b-premature.txt', out.join('\n'));
    e2(out.length).toBe(4);
  });
});
