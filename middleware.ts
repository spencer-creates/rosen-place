import { next } from '@vercel/functions';
import { neonDb } from './server/db.js';
import { gate } from './server/gate.js';
import { Store } from './server/store.js';

// Vercel Routing Middleware. Runs before every request, static files included,
// so no page, script or file is sent until the passkey session checks out.
export default async function middleware(req: Request): Promise<Response> {
  return (await gate(req, new Store(neonDb(process.env.DATABASE_URL)))) ?? next();
}
