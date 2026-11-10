// The backup reminder (SPEC 9.1): when "Back up your workouts" shows and what its line says. Split
// from lib/backup.ts (PLAN 3.5e, code organization), behavior unchanged; lib/backup.ts re-exports it.
import type { Backup } from './backup';

const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_MS = 14 * DAY;
export const SNOOZE_MS = 7 * DAY;
export const REMIND_MIN_SESSIONS = 6;

export type ReminderInput = {
  /** Finished workouts on the phone (ended or imported). */
  sessions: number;
  lastBackupAt?: number;
  snoozeUntil?: number;
  activeWorkout: boolean;
  now: number;
};

/** "Back up your workouts": more than 5 workouts, no backup in 14 days, not snoozed, never mid workout. */
export function shouldRemind({ sessions, lastBackupAt, snoozeUntil, activeWorkout, now }: ReminderInput): boolean {
  if (activeWorkout || sessions < REMIND_MIN_SESSIONS) return false;
  if (snoozeUntil !== undefined && now < snoozeUntil) return false;
  return lastBackupAt === undefined || now - lastBackupAt >= REMIND_AFTER_MS;
}

/**
 * The reason line under "Back up your workouts": "6 workouts are only on this phone. Last backup
 * 15 days ago." or "… No backup yet." `onlyHere` counts finished workouts newer than the last
 * backup (all of them when there is none).
 */
export function reminderReason({ onlyHere, lastBackupAt, now }: { onlyHere: number; lastBackupAt?: number; now: number }): string {
  const count = onlyHere <= 0 ? '' : onlyHere === 1 ? '1 workout is only on this phone. ' : `${onlyHere} workouts are only on this phone. `;
  if (lastBackupAt === undefined) return `${count}No backup yet.`;
  const days = Math.max(0, Math.floor((now - lastBackupAt) / DAY));
  const ago = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return `${count}Last backup ${ago}.`;
}

/** The finished (or imported) workouts a backup holds, by id: what "only on this phone" is measured against. */
export function backedUpIds(backup: Pick<Backup, 'tables'>): string[] {
  return backup.tables.sessions.filter((s) => s.endedAt !== undefined || s.imported).map((s) => s.id);
}

/** Finished workouts not in the last successful backup (all of them when no backup recorded which). */
export function onlyOnPhone(finishedIds: readonly string[], backedUp: readonly string[] | undefined): number {
  const held = new Set(backedUp ?? []);
  return finishedIds.filter((id) => !held.has(id)).length;
}
