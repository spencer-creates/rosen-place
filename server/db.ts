import { neon } from '@neondatabase/serverless';

/** The one database call the app needs. Neon in production, PGlite in tests. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

/** Neon Postgres over HTTPS. Works in Vercel middleware (edge) and functions (Node). */
export function neonDb(url: string | undefined): Db {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const sql = neon(url, { fullResults: true });
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const r = await sql.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
  };
}
