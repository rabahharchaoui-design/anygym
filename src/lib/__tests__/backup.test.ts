import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  DAMAGED,
  NEWER_VERSION,
  NOT_A_BACKUP,
  REMIND_AFTER_MS,
  SNOOZE_MS,
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
  shouldRemind,
  reminderReason,
  onlyOnPhone,
  backedUpIds,
  summarize,
  summaryLine,
  upgradeTables,
  RECORD_CHECKS,
  TABLE_NAMES,
  isDraft,
  type BackupTables,
  type TableName,
} from '../backup';
import { SCHEMA_VERSION } from '../../db/schema';

const empty = (): BackupTables => ({ profile: [], gyms: [], plans: [], planDays: [], sessions: [], sets: [], runs: [], exerciseSettings: [], planState: [], orderCounters: [], submissions: [], tombstones: [], journal: [] });

const gym = { id: 'g', name: 'Home', type: 'home', unit: 'kg', equipment: [], dumbbellRange: null, bars: { olympic: 45, womens: 35, ez_curl: null, trap: null, smith: 0 }, stackStep: 2.5, equipmentWeights: {}, plateInventory: [], collars: 'none', plateColors: 'color', isActive: true, createdAt: 1 };
const session = { id: 's', gymId: 'g', startedAt: 10, endedAt: 20, imported: false };
const set = { id: 'x', sessionId: 's', exerciseId: 'bench', order: 0, kind: 'work', reps: 5, load: { kind: 'barbell', unit: 'kg', total: 102.5, barWeight: 20, perSide: [25, 15, 1.25] }, uncertain: false };

const file = (over: Record<string, unknown> = {}, tables: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, appVersion: '0.1.0', schemaVersion: SCHEMA_VERSION, exportedAt: Date.UTC(2026, 9, 24, 12), tables: { ...empty(), gyms: [gym], sessions: [session], sets: [set], ...tables }, ...over });

describe('parseBackup', () => {
  it('reads a good file and keeps numbers exactly', () => {
    const r = parseBackup(file());
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.tables.sets[0]!.load!.perSide).toEqual([25, 15, 1.25]);
    expect(r.backup.tables.sets[0]!.load!.total).toBe(102.5);
  });

  it('round trips buildBackup → serialize → parse', () => {
    const t = { ...empty(), gyms: [gym], sessions: [session], sets: [set] } as unknown as BackupTables;
    const r = parseBackup(serializeBackup(buildBackup(t, {}, '9.9.9', 5)));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.tables).toEqual(t);
    expect(r.backup.appVersion).toBe('9.9.9');
  });

  it.each([
    ['not JSON', 'hello'],
    ['JSON but not an object', '[1,2]'],
    ['an import file', JSON.stringify({ format: 'anygym-import-v1', sessions: [] })],
    ['no tables', JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 6, exportedAt: 1, appVersion: '1' })],
    ['bad schema version', file({ schemaVersion: 'six' })],
    ['schema version 0', file({ schemaVersion: 0 })],
  ])('refuses %s as not a backup', (_, text) => {
    expect(parseBackup(text)).toEqual({ ok: false, error: NOT_A_BACKUP });
  });

  it('refuses a newer schema', () => {
    expect(parseBackup(file({ schemaVersion: SCHEMA_VERSION + 1 }))).toEqual({ ok: false, error: NEWER_VERSION });
  });

  it.each([
    ['a set with a text weight', { sets: [{ ...set, load: { ...set.load, total: '100' } }] }],
    ['a set with an unknown kind', { sets: [{ ...set, kind: 'cluster' }] }],
    ['a set of a missing workout', { sets: [{ ...set, sessionId: 'nope' }] }],
    ['duplicate ids', { sets: [set, set] }],
    ['a gym with no unit', { gyms: [{ ...gym, unit: 'stone' }] }],
    ['a table that is not a list', { runs: {} }],
    ['missing sessions', { sessions: undefined }],
    ['duplicate exercise settings', { exerciseSettings: [{ exerciseId: 'a', gymId: '' }, { exerciseId: 'a', gymId: '' }] }],
    ['bad plan state', { planState: [{ id: 'other', planId: 'p', nextDayIndex: 0, weekIndex: 0, doneDays: [] }] }],
  ])('refuses %s as damaged', (_, tables) => {
    expect(parseBackup(file({}, tables))).toEqual({ ok: false, error: DAMAGED });
  });

  it.each([
    ['runs', 6],
    ['profile', 6],
    ['exerciseSettings', 6],
    ['tombstones', 6],
    ['orderCounters', 4],
    ['planState', 3],
    ['exerciseSettings', 2],
    ['planDays', 1],
  ])('refuses a backup missing %s that its schema v%i has', (table, version) => {
    const tables: Record<string, unknown> = { ...empty(), gyms: [gym], sessions: [session], sets: [set] };
    delete tables[table];
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, appVersion: '1', schemaVersion: version, exportedAt: 1, tables }))).toEqual({ ok: false, error: DAMAGED });
  });

  it('fills only tables added after the backup schema', () => {
    const tables: Record<string, unknown> = { ...empty(), gyms: [gym], sessions: [session], sets: [set] };
    for (const t of ['exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones']) delete tables[t];
    const r = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, appVersion: '1', schemaVersion: 1, exportedAt: 1, tables }));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.tables.exerciseSettings).toEqual([]);
    expect(r.backup.tables.tombstones).toEqual([]);
  });

  it('refuses a missing date', () => {
    expect(parseBackup(file({ exportedAt: 'today' }))).toEqual({ ok: false, error: DAMAGED });
  });

  it('opens an older schema: missing tables start empty, renamed plan ids are upgraded', () => {
    const r = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        appVersion: '0.0.1',
        schemaVersion: 3,
        exportedAt: 1,
        tables: {
          profile: [],
          plans: [],
          planDays: [],
          exerciseSettings: [],
          gyms: [gym],
          sessions: [{ ...session, planId: 'ohrabah-split', dayId: 'd1' }],
          sets: [set],
          runs: [],
          planState: [{ id: 'active', planId: 'ohrabah-split', startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [0, 1, 2] }],
        },
      }),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.tables.sessions[0]!.planId).toBe('five-day-split');
    expect(r.backup.tables.planState[0]).toEqual({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [0, 1, 2] });
    expect(r.backup.tables.orderCounters).toEqual([]);
    expect(r.backup.tables.exerciseSettings).toEqual([]);
    expect(r.backup.tables.tombstones).toEqual([]);
  });

  it('upgradeTables leaves v5+ data alone', () => {
    const t = upgradeTables({ sessions: [{ id: 's', planId: 'ohrabah-split' }] }, 5);
    expect(t.sessions[0]!.planId).toBe('ohrabah-split');
  });
});

describe('words', () => {
  it('file name uses the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59).getTime())).toBe('anygym-backup-2026-01-05.json');
    expect(backupFileName(new Date(2026, 11, 31, 0, 1).getTime())).toBe('anygym-backup-2026-12-31.json');
  });

  it('summary line', () => {
    const r = parseBackup(file());
    if (!r.ok) throw new Error(r.error);
    expect(summaryLine(summarize(r.backup))).toBe('This backup has 1 workout, 1 set, 1 gym, from Oct 24, 2026.');
    expect(summaryLine({ workouts: 12, sets: 140, gyms: 2, exportedAt: new Date(2026, 2, 3).getTime() })).toBe('This backup has 12 workouts, 140 sets, 2 gyms, from Mar 3, 2026.');
  });
});

describe('shouldRemind', () => {
  const now = 100 * REMIND_AFTER_MS;
  const base = { sessions: 6, activeWorkout: false, now };
  it('needs more than 5 workouts', () => {
    expect(shouldRemind({ ...base, sessions: 5 })).toBe(false);
    expect(shouldRemind({ ...base, sessions: 6 })).toBe(true);
  });
  it('waits 14 days after a backup', () => {
    expect(shouldRemind({ ...base, lastBackupAt: now - REMIND_AFTER_MS + 1 })).toBe(false);
    expect(shouldRemind({ ...base, lastBackupAt: now - REMIND_AFTER_MS })).toBe(true);
  });
  it('Not now hides it for 7 days', () => {
    expect(shouldRemind({ ...base, snoozeUntil: now + 1 })).toBe(false);
    expect(shouldRemind({ ...base, snoozeUntil: now - SNOOZE_MS + SNOOZE_MS })).toBe(true);
  });
  it('never during a workout', () => {
    expect(shouldRemind({ ...base, activeWorkout: true })).toBe(false);
  });
});

// ---- per record type (table driven) ----

const good: Record<TableName, Record<string, unknown>> = {
  profile: { id: 'me', defaultUnit: 'lb', createdAt: 1, lastBackupAt: 2 },
  gyms: { ...gym, equipmentWeights: { leg_press: { kind: 'starting_resistance', value: 118 }, smith: { kind: 'bar_weight', value: null } }, dumbbellRange: { min: 5, max: 50, step: 5 }, plateInventory: [{ weight: 45, enabled: true }] },
  plans: { id: 'p', name: 'Mine', source: 'generated', createdAt: 1 },
  planDays: { id: 'pd', planId: 'p', order: 0, name: 'Day 1' },
  sessions: { ...session, planId: 'five-day-split', dayId: 'd1', exerciseIds: ['bench'], weekIndex: 0 },
  sets: { ...set, failure: true, rpe: 8, note: 'ok' },
  runs: { id: 'r', startedAt: 1, type: 'easy', movingSec: 1, elapsedSec: 2, distanceM: 3, points: [[1, 2, 3, 4]], gaps: [[1, 2]], splits: [300] },
  exerciseSettings: { exerciseId: 'bench', gymId: '', loadType: 'barbell', barId: 'olympic', restSec: 90, note: 'x' },
  planState: { id: 'active', planId: 'p', startedAt: 1, weekIndex: 0, nextDayIndex: 1, doneDays: [0], partial: { 1: 0.5 } },
  orderCounters: { sessionId: 's', next: 3 },
  submissions: { id: 'x', sessionId: 's', exerciseId: 'bench', rev: 1 },
  tombstones: { id: 'x', sessionId: 's', set, expiresAt: 5, undo: true },
  journal: { id: 'j', sessionId: 's', exerciseId: 'bench', key: 'bench@0', rev: 2, draft: { id: 'j', load: set.load, plates: [25, 15, 1.25], reps: 5, rev: 2, unit: 'kg' }, at: 9 },
};

const without = (r: Record<string, unknown>, k: string) => {
  const c = { ...r };
  delete c[k];
  return c;
};

const bad: Array<[TableName, string, Record<string, unknown>]> = [
  ['profile', 'no unit', without(good.profile, 'defaultUnit')],
  ['profile', 'text lastBackupAt', { ...good.profile, lastBackupAt: 'yesterday' }],
  ['gyms', 'no equipmentWeights', without(good.gyms, 'equipmentWeights')],
  ['gyms', 'no stackStep', without(good.gyms, 'stackStep')],
  ['gyms', 'bars missing smith', { ...good.gyms, bars: { olympic: 45, womens: 35, ez_curl: null, trap: null } }],
  ['gyms', 'text bar weight', { ...good.gyms, bars: { olympic: '45', womens: 35, ez_curl: null, trap: null, smith: 0 } }],
  ['gyms', 'bad plate', { ...good.gyms, plateInventory: [{ weight: 45 }] }],
  ['gyms', 'bad collars', { ...good.gyms, collars: 'spring' }],
  ['gyms', 'bad machine answer', { ...good.gyms, equipmentWeights: { leg_press: { kind: 'guess', value: 1 } } }],
  ['gyms', 'bad dumbbell range', { ...good.gyms, dumbbellRange: { min: 5, max: 50 } }],
  ['plans', 'bad source', { ...good.plans, source: 'ai' }],
  ['planDays', 'no order', without(good.planDays, 'order')],
  ['sessions', 'no gymId', without(good.sessions, 'gymId')],
  ['sessions', 'text startedAt', { ...good.sessions, startedAt: '2026-10-24' }],
  ['sessions', 'exerciseIds not text', { ...good.sessions, exerciseIds: [1] }],
  ['sets', 'load without total', { ...set, load: { kind: 'barbell', unit: 'lb' } }],
  ['sets', 'load with text perSide', { ...set, load: { ...set.load, perSide: ['45'] } }],
  ['sets', 'load with unknown bar', { ...set, load: { ...set.load, barId: 'cambered' } }],
  ['sets', 'load with unknown kind', { ...set, load: { ...set.load, kind: 'band' } }],
  ['sets', 'text reps', { ...set, reps: '5' }],
  ['runs', 'short point', { ...good.runs, points: [[1, 2, 3]] }],
  ['runs', 'no splits', without(good.runs, 'splits')],
  ['exerciseSettings', 'no gymId', without(good.exerciseSettings, 'gymId')],
  ['exerciseSettings', 'bad loadType', { ...good.exerciseSettings, loadType: 'machine' }],
  ['exerciseSettings', 'text restSec', { ...good.exerciseSettings, restSec: '90' }],
  ['planState', 'text partial', { ...good.planState, partial: { 1: 'half' } }],
  ['orderCounters', 'no next', without(good.orderCounters, 'next')],
  ['submissions', 'no rev', without(good.submissions, 'rev')],
  ['tombstones', 'bad set', { ...good.tombstones, set: { ...set, kind: 'x' } }],
  ['journal', 'no rev', without(good.journal, 'rev')],
  ['journal', 'bad draft', { ...good.journal, draft: { id: 'j', load: { kind: 'barbell' } } }],
  ['journal', 'draft of another row', { ...good.journal, draft: { id: 'other', load: null } }],
];

describe('RECORD_CHECKS', () => {
  it.each(TABLE_NAMES.map((t) => [t]))('accepts a good %s record', (t) => {
    expect(RECORD_CHECKS[t](good[t])).toBe(true);
  });
  it.each(bad)('refuses %s with %s', (t, _, r) => {
    expect(RECORD_CHECKS[t](r)).toBe(false);
  });
  it('a bad record anywhere refuses the whole file', () => {
    expect(parseBackup(file({}, { gyms: [without(gym, 'equipmentWeights')] }))).toEqual({ ok: false, error: DAMAGED });
  });
});

describe('dumbbell ranges (PLAN 1.7i)', () => {
  it.each([
    ['a zero step', { min: 5, max: 100, step: 0 }],
    ['a negative step', { min: 5, max: 100, step: -5 }],
    ['a reversed range', { min: 100, max: 5, step: 5 }],
    ['a negative minimum', { min: -5, max: 50, step: 5 }],
    ['millions of dumbbells', { min: 0, max: 1e7, step: 0.5 }],
  ])('refuses %s as damaged', (_, dumbbellRange) => {
    expect(parseBackup(file({}, { gyms: [{ ...gym, dumbbellRange }] }))).toEqual({ ok: false, error: DAMAGED });
  });
  it('accepts a real rack, and a single dumbbell', () => {
    expect(parseBackup(file({}, { gyms: [{ ...gym, dumbbellRange: { min: 2.5, max: 50, step: 2.5 } }] })).ok).toBe(true);
    expect(parseBackup(file({}, { gyms: [{ ...gym, dumbbellRange: { min: 20, max: 20, step: 5 } }] })).ok).toBe(true);
  });
});

describe('references', () => {
  it.each([
    ['a workout at a gym not in the file', { sessions: [{ ...session, gymId: 'gone' }] }],
    ['an order counter of a missing workout', { orderCounters: [{ sessionId: 'gone', next: 1 }] }],
    ['a submission of a missing workout', { submissions: [{ id: 'x', sessionId: 'gone', exerciseId: 'bench', rev: 1 }] }],
    ['a tombstone of a missing workout', { tombstones: [{ id: 'x', sessionId: 'gone', set: { ...set, sessionId: 'gone' }, expiresAt: 1 }] }],
    ['a tombstone whose set has another id', { tombstones: [{ id: 'y', sessionId: 's', set, expiresAt: 1 }] }],
    ['a pending journal entry of a missing workout', { journal: [{ ...good.journal, sessionId: 'gone' }] }],
    ['a tombstone whose set is in another workout', { tombstones: [{ id: 'x', sessionId: 's', set: { ...set, sessionId: 'other' }, expiresAt: 1 }] }],
  ])('refuses %s', (_, tables) => {
    expect(parseBackup(file({}, tables))).toEqual({ ok: false, error: DAMAGED });
  });
});

describe('drafts', () => {
  const live = { id: 'live', gymId: 'g', startedAt: 30, imported: false };
  const draft = { id: 'next-set', load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] }, plates: [45], reps: 8, rev: 3, submitted: 2, type: 'failure', watch: { startedAt: 1000, accumulated: 2500 } };

  it('buildBackup keeps drafts of workouts in progress only', () => {
    const t = { ...empty(), gyms: [gym], sessions: [session, live] } as unknown as BackupTables;
    const b = buildBackup(t, { live: { bench: draft }, s: { bench: draft }, gone: { bench: draft } } as never, '1', 1);
    expect(b.drafts).toEqual({ live: { bench: draft } });
  });

  it('parses drafts exactly, refuses bad ones and drafts of finished or missing workouts', () => {
    const r = parseBackup(file({ drafts: { live: { bench: draft } } }, { sessions: [session, live] }));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.drafts).toEqual({ live: { bench: draft } });
    expect(parseBackup(file({ drafts: { s: { bench: draft } } }, { sessions: [session, live] }))).toEqual({ ok: false, error: DAMAGED });
    expect(parseBackup(file({ drafts: { live: { bench: { ...draft, rev: 'x' } } } }, { sessions: [session, live] }))).toEqual({ ok: false, error: DAMAGED });
    expect(parseBackup(file({ drafts: { live: { bench: { ...draft, watch: { startedAt: 1 } } } } }, { sessions: [session, live] }))).toEqual({ ok: false, error: DAMAGED });
    expect(parseBackup(file({ drafts: [] }))).toEqual({ ok: false, error: DAMAGED });
    expect(isDraft({ id: 'a', load: null })).toBe(true);
  });
});

describe('reminderReason', () => {
  const now = Date.UTC(2026, 9, 25, 12);
  const DAY = 24 * 60 * 60 * 1000;
  it('says how many workouts are only here and when the last backup was', () => {
    expect(reminderReason({ onlyHere: 6, lastBackupAt: now - 15 * DAY, now })).toBe('6 workouts are only on this phone. Last backup 15 days ago.');
    expect(reminderReason({ onlyHere: 1, lastBackupAt: now - DAY - 1, now })).toBe('1 workout is only on this phone. Last backup 1 day ago.');
    expect(reminderReason({ onlyHere: 2, lastBackupAt: now - 1000, now })).toBe('2 workouts are only on this phone. Last backup today.');
  });
  it('every workout already backed up: only when the last backup was', () => {
    expect(reminderReason({ onlyHere: 0, lastBackupAt: now - 20 * DAY, now })).toBe('Last backup 20 days ago.');
  });
  it('no backup yet', () => {
    expect(reminderReason({ onlyHere: 8, now })).toBe('8 workouts are only on this phone. No backup yet.');
  });
});

describe('only on this phone: by the ids the last backup held', () => {
  it('counts finished workouts missing from the last backup, imported ones too', () => {
    expect(onlyOnPhone(['a', 'b', 'c'], undefined)).toBe(3);
    expect(onlyOnPhone(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    // Three workouts imported after the backup count, whatever their dates.
    expect(onlyOnPhone(['a', 'b', 'c', 'imp-1', 'imp-2', 'imp-3'], ['a', 'b', 'c'])).toBe(3);
  });
  it('a backup holds its finished and imported workouts, not the one in progress', () => {
    const tables = { sessions: [
      { id: 'done', gymId: 'g', startedAt: 1, endedAt: 2, imported: false },
      { id: 'imp', gymId: 'g', startedAt: 3, imported: true },
      { id: 'live', gymId: 'g', startedAt: 4, imported: false },
    ] } as unknown as Parameters<typeof backedUpIds>[0]['tables'];
    expect(backedUpIds({ tables })).toEqual(['done', 'imp']);
  });
});
