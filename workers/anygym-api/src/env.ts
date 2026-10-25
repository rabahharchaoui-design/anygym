// The Worker's bindings. A minimal D1 surface (what this Worker uses), so the handlers also run
// over a fake D1 in tests. The real binding satisfies it.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Like;
  /** G's ntfy topic (a Worker secret). No topic: no pushes. */
  NTFY_TOPIC?: string;
  /** 'production' on the deployed Worker. Anything else is a dev or preview environment. */
  ENVIRONMENT?: string;
  /** Comma separated extra origins (local vite preview). Honored only outside production. */
  DEV_ORIGINS?: string;
  /** Optional salt for hashing IPs. */
  IP_SALT?: string;
}

/** What the handlers need from the outside world, injectable in tests. */
export interface Deps {
  now: () => Date;
  fetch: typeof fetch;
  /** Background work after the response (ctx.waitUntil on Cloudflare). */
  waitUntil: (p: Promise<unknown>) => void;
}
