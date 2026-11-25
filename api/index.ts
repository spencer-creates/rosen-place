import { createApp, type Env } from '../server/app.js';
import { neonDb } from '../server/db.js';

// All /api/* requests are rewritten here (vercel.json). Node.js runtime.
const app = createApp();
const env = (): Env => ({
  DB: neonDb(process.env.DATABASE_URL),
  RP_ID: required('RP_ID'),
  ORIGIN: required('ORIGIN'),
  SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
});

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

const handle = (req: Request) => app.fetch(req, env());
export { handle as GET, handle as POST };
