// The one count of sets shown anywhere ("Workout saved · 6 sets", the finish tiles, the live header,
// History). Warm ups never count toward progress (SPEC 2.5): working sets only, drop sets and sets to
// failure included.
import type { SetKind } from '../db/types';

export const isWorkSet = (s: { kind: SetKind }): boolean => s.kind !== 'warmup';

export const workSetCount = (sets: readonly { kind: SetKind }[]): number => sets.reduce((n, s) => n + (isWorkSet(s) ? 1 : 0), 0);
