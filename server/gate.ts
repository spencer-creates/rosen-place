import { LOGIN_PATH, readCookie, SECURITY_HEADERS, SESSION_COOKIE } from './headers.js';
import type { Store } from './store.js';

/** Reachable without a session: the sign-in page and the passkey ceremony endpoints. */
export function isPublicPath(path: string): boolean {
  return path.startsWith(LOGIN_PATH) || path.startsWith('/api/auth/login/') || path.startsWith('/api/auth/register/');
}

/**
 * Runs before every request (Vercel Routing Middleware), including static files.
 * Returns null to let the request through, or the response to send instead.
 */
export async function gate(req: Request, store: Store): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  if (isPublicPath(path)) return null;

  const token = readCookie(req, SESSION_COOKIE);
  if (token && (await store.userForSession(token))) return null;

  const headers = new Headers({ ...SECURITY_HEADERS, 'Cache-Control': 'no-store' });
  if (token) headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);

  if (path.startsWith('/api/')) {
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: 'Sign in required.' }), { status: 401, headers });
  }
  const wantsHtml = req.method === 'GET' && (req.headers.get('Accept') ?? '').includes('text/html');
  if (!wantsHtml) return new Response('Sign in required.', { status: 401, headers });
  headers.set('Location', `${LOGIN_PATH}?next=${encodeURIComponent(path)}`);
  return new Response(null, { status: 302, headers });
}
