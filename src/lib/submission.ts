// What one Log set write saves, as a stable fingerprint (PLAN 2.0l, Codex bughunt 1811 #2). Two
// tabs can hand the same pending row the same revision with different values; the revision alone
// then cannot tell "this very input was saved" from "another input was saved under this id". The
// fingerprint covers every value the set stores (count, kind, failure, every Load field, bar
// identity included), so the same total on another bar is a different payload. No weight math.
import type { Load, SetKind } from '../db/types';

export type Payload = { reps?: number; seconds?: number; load: Load; kind?: SetKind; failure?: boolean };

/** JSON with object keys sorted, so the same values always give the same text. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Evidence that is not a fingerprint (PLAN 3.2c): a legacy receipt (none stored) whose set was
 * deleted and left no record of its values. It equals no draft's fingerprint, so a revision match
 * alone never counts as "this input was saved".
 */
export const UNKNOWN_FP = 'unknown';

/** The fingerprint of what a Log set write stores. */
export function payloadFp(p: Payload): string {
  return stable({ reps: p.reps, seconds: p.seconds, load: p.load, kind: p.kind ?? 'work', failure: p.kind === 'work' || p.kind === undefined ? !!p.failure : false });
}
