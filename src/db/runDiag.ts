// The run diagnostics log on the phone (PLAN 4.4d (2), lib/run/diag.ts). Its own small database
// beside the main one, so the main schema (and every run saved in it) is untouched, a backup never
// carries it, and losing it loses nothing but diagnosis. Written in chunks (one per save of the
// live run, every 5 s), so a 2 hour run never rewrites its whole log.
import Dexie, { type Table } from 'dexie';
import { KEEP_DIAG_RUNS, MAX_DIAG_ENTRIES, type DiagEntry } from '../lib/run/diag';

export type DiagChunk = { runId: string; seq: number; startedAt: number; entries: DiagEntry[] };

export const DIAG_DB_NAME = 'anygym-diag';

/** Version 1: chunks by run and sequence number, findable by run and by the run's start. */
export const DIAG_SCHEMA_V1 = { chunks: '[runId+seq], runId, startedAt' } as const;

export class RunDiagDB extends Dexie {
  chunks!: Table<DiagChunk, [string, number]>;
  constructor(name = DIAG_DB_NAME) {
    super(name);
    this.version(1).stores(DIAG_SCHEMA_V1);
  }
}

let shared: RunDiagDB | null = null;
const open = (): RunDiagDB => (shared ??= new RunDiagDB());

/** Adds one chunk of a run's log. */
export async function appendDiag(chunk: DiagChunk, db: RunDiagDB = open()): Promise<void> {
  if (chunk.entries.length) await db.chunks.put(chunk);
}

/** A run's whole log, in order (at most MAX_DIAG_ENTRIES). Empty when it has none. */
export async function readDiag(runId: string, db: RunDiagDB = open()): Promise<DiagEntry[]> {
  const chunks = await db.chunks.where('runId').equals(runId).sortBy('seq');
  return chunks.flatMap((c) => c.entries).slice(0, MAX_DIAG_ENTRIES);
}

/** Whether a run has a log. */
export async function hasDiag(runId: string, db: RunDiagDB = open()): Promise<boolean> {
  return (await db.chunks.where('runId').equals(runId).count()) > 0;
}

/** Forgets a run's log (the run was discarded). */
export async function deleteDiag(runId: string, db: RunDiagDB = open()): Promise<void> {
  await db.chunks.where('runId').equals(runId).delete();
}

/** Keeps the logs of the newest KEEP_DIAG_RUNS runs (by their start) and forgets the rest. */
export async function pruneDiag(keep = KEEP_DIAG_RUNS, db: RunDiagDB = open()): Promise<void> {
  const starts = new Map<string, number>();
  await db.chunks.each((c) => void starts.set(c.runId, c.startedAt));
  const old = [...starts].sort((a, b) => b[1] - a[1]).slice(keep).map(([id]) => id);
  if (old.length) await db.chunks.where('runId').anyOf(old).delete();
}
