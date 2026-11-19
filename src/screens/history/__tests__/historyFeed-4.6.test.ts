import { describe, expect, it } from 'vitest';
import type { Session } from '../../../db/types';
import type { Run } from '../../../db/types';
import { historyFeed } from '../historyFeed';

const session = (id: string, startedAt: number, imported = false): Session => ({ id, gymId: 'g', startedAt, endedAt: startedAt + 1, imported });
const workout = (id: string, startedAt: number, imported = false) => ({ session: session(id, startedAt, imported), sets: 2 });
const run = (id: string, endedAt: number | undefined): Run => ({
  id,
  startedAt: (endedAt ?? 0) - 5,
  endedAt,
  type: 'free',
  movingSec: 1,
  elapsedSec: 1,
  distanceM: 100,
  points: [],
  gaps: [],
  splits: [],
});

describe('historyFeed (PLAN 4.6)', () => {
  it('mixes finished runs into the dated list and leaves imported workouts in their own group', () => {
    const feed = historyFeed([workout('w', 100), workout('old', 40), workout('imp', 1, true)], [run('r', 80), run('open', undefined)]);
    expect(feed.dated.map((x) => (x.kind === 'workout' ? x.workout.session.id : x.run.id))).toEqual(['w', 'r', 'old']);
    expect(feed.imported.map((w) => w.session.id)).toEqual(['imp']);
  });
});
