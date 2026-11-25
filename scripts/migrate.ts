// Applies migrations/*.sql in order, once each. Usage: npm run db:migrate (needs DATABASE_URL)
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { neonDb, type Db } from '../server/db.js';

export async function migrate(db: Db, log: (msg: string) => void = console.log): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ name: string }>(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(new URL(file, dir), 'utf8').replace(/--.*$/gm, '');
    for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    await db.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    log(`applied ${file}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate(neonDb(process.env.DATABASE_URL));
}
