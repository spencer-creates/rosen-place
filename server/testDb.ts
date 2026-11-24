import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Db, Stmt } from './store';

/** A D1-shaped wrapper over node:sqlite, loaded with the real migrations. Tests only. */
export function testDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8'));

  const stmt = (sql: string, values: unknown[] = []): Stmt & { exec(): void } => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T>() => (raw.prepare(sql).get(...(values as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: raw.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...(values as never[])).changes) } }),
    exec: () => void raw.prepare(sql).run(...(values as never[])),
  });

  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try {
        for (const s of stmts) (s as ReturnType<typeof stmt>).exec();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
