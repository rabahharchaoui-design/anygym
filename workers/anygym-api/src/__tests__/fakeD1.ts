// A D1 stand in over node:sqlite (real SQL: upserts, RETURNING, the partial unique index), with the
// production DDL of the existing reports and rate tables.
import { DatabaseSync } from 'node:sqlite';
import type { D1Like, D1PreparedStatement, D1Result } from '../env';

export const PROD_DDL = [
  `CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('feedback','crash')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_count INTEGER NOT NULL DEFAULT 1,
  signature TEXT, message TEXT, stack TEXT, route TEXT, app_version TEXT, device TEXT,
  context_json TEXT, screenshot_b64 TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','queued','fixed','ignored')),
  plan_item TEXT, fix_commit TEXT, note TEXT)`,
  'CREATE INDEX idx_reports_status ON reports(status)',
  "CREATE UNIQUE INDEX idx_reports_open_sig ON reports(signature) WHERE status = 'open' AND kind = 'crash'",
  'CREATE TABLE rate (ip_hash TEXT NOT NULL, hour TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ip_hash, hour))',
];

type Row = Record<string, unknown>;

class Stmt implements D1PreparedStatement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: unknown[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Stmt(this.db, this.sql, values);
  }
  private args() {
    return this.params.map((v) => (v === undefined ? null : v)) as never[];
  }
  async first<T = Row>(): Promise<T | null> {
    const st = this.db.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql) || /^\s*SELECT/i.test(this.sql)) return ((st.all(...this.args())[0] as T) ?? null);
    st.run(...this.args());
    return null;
  }
  async all<T = Row>(): Promise<D1Result<T>> {
    return { results: this.db.prepare(this.sql).all(...this.args()) as T[], meta: {} };
  }
  async run(): Promise<D1Result> {
    if (/\bRETURNING\b/i.test(this.sql)) return { results: this.db.prepare(this.sql).all(...this.args()) as Row[], meta: {} };
    const r = this.db.prepare(this.sql).run(...this.args());
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  get text() {
    return this.sql;
  }
}

export class FakeD1 implements D1Like {
  readonly raw = new DatabaseSync(':memory:');
  /** Runs before each statement of a batch (tests: fail or race mid transaction). */
  onBatchStatement?: (sql: string, index: number) => void;
  /** Runs before a batch's transaction starts (tests: a twin request that commits first). */
  beforeBatch?: (sqls: string[]) => void;
  constructor() {
    for (const sql of PROD_DDL) this.raw.exec(sql);
  }
  prepare(sql: string): D1PreparedStatement {
    return new Stmt(this.raw, sql);
  }
  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const out: D1Result[] = [];
    this.beforeBatch?.(statements.map((s) => (s as Stmt).text));
    this.raw.exec('BEGIN');
    try {
      for (const [i, s] of statements.entries()) {
        this.onBatchStatement?.((s as Stmt).text, i);
        out.push(await s.run());
      }
      this.raw.exec('COMMIT');
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
    return out;
  }
  rows(sql: string): Row[] {
    return this.raw.prepare(sql).all() as Row[];
  }
}
