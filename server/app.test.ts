import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, CHALLENGE_COOKIE, SESSION_COOKIE, type Env, type WebAuthn } from './app';
import { testDb } from './testDb';
import { toBase64Url } from './crypto';
// @ts-expect-error plain JS admin script
import { inviteSql } from '../scripts/admin.mjs';

const ORIGIN = 'https://home.example';

/**
 * A pretend authenticator. Registration "creates" a key whose public key is the credential id;
 * a sign-in is valid only if it echoes the server's challenge and is signed by that key.
 */
let counter = 0;
const fakeWebAuthn: WebAuthn = {
  generateRegistrationOptions: (async (o: { rpID: string }) => ({ challenge: `reg-${++counter}`, rp: { id: o.rpID } })) as never,
  generateAuthenticationOptions: (async () => ({ challenge: `auth-${++counter}` })) as never,
  verifyRegistrationResponse: (async (o: { response: { id: string; challenge: string; origin: string }; expectedChallenge: string; expectedOrigin: string }) => {
    if (o.response.challenge !== o.expectedChallenge || o.response.origin !== o.expectedOrigin) return { verified: false };
    return {
      verified: true,
      registrationInfo: {
        credential: { id: o.response.id, publicKey: new TextEncoder().encode(o.response.id), counter: 0, transports: ['internal'] },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    };
  }) as never,
  verifyAuthenticationResponse: (async (o: {
    response: { challenge: string; signedBy: string };
    expectedChallenge: string;
    credential: { publicKey: Uint8Array };
  }) => {
    const ok = o.response.challenge === o.expectedChallenge && o.response.signedBy === new TextDecoder().decode(o.credential.publicKey);
    if (!ok) throw new Error('bad signature');
    return { verified: true, authenticationInfo: { newCounter: 1 } };
  }) as never,
};

let db: ReturnType<typeof testDb>;
let env: Env;
let now = Date.UTC(2026, 10, 24);
const app = createApp({ webauthn: fakeWebAuthn, now: () => now });

const assets = { fetch: async (req: Request) => new Response(`asset:${new URL(req.url).pathname}`, { headers: { 'Content-Type': 'text/html' } }) };

beforeEach(() => {
  db = testDb();
  now = Date.UTC(2026, 10, 24);
  env = { DB: db, ASSETS: assets, RP_ID: 'home.example', ORIGIN };
});

/** A tiny browser: keeps cookies, sends Origin on POST. */
function browser(origin = ORIGIN) {
  const jar = new Map<string, string>();
  return {
    jar,
    async req(path: string, init: { method?: string; body?: unknown; accept?: string } = {}) {
      const headers: Record<string, string> = { Accept: init.accept ?? 'application/json' };
      if (init.method && init.method !== 'GET') headers.Origin = origin;
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await app.request(`${ORIGIN}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }, env);
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const [k, v] = pair.split('=');
        if (attrs.some((a) => /max-age=0/i.test(a)) || v === '') jar.delete(k);
        else jar.set(k, v);
      }
      return res;
    },
  };
}

async function invite(name: string, role = 'member', hours = 24) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  db.raw.exec(await inviteSql({ name, role, token, now, hours }));
  return token;
}

async function register(b: ReturnType<typeof browser>, token: string, credId: string) {
  const optsRes = await b.req('/api/auth/register/options', { method: 'POST', body: { invite: token } });
  if (!optsRes.ok) return optsRes;
  const opts = await optsRes.json();
  return b.req('/api/auth/register/verify', { method: 'POST', body: { id: credId, challenge: opts.challenge, origin: ORIGIN } });
}

async function login(b: ReturnType<typeof browser>, credId: string, signedBy = credId) {
  const opts = await (await b.req('/api/auth/login/options', { method: 'POST' })).json();
  return b.req('/api/auth/login/verify', { method: 'POST', body: { id: credId, challenge: opts.challenge, signedBy } });
}

describe('the gate', () => {
  it('serves nothing from the app without a session', async () => {
    const b = browser();
    const page = await b.req('/wealth/finances', { accept: 'text/html' });
    expect(page.status).toBe(302);
    expect(page.headers.get('Location')).toBe('/_login/?next=%2Fwealth%2Ffinances');

    expect((await b.req('/assets/index-abc.js', { accept: '*/*' })).status).toBe(401);
    expect((await b.req('/api/auth/me')).status).toBe(401);
    expect((await b.req('/api/anything')).status).toBe(401);
  });

  it('serves the login page, but not the app shell through a mistyped login path', async () => {
    const b = browser();
    expect(await (await b.req('/_login/', { accept: 'text/html' })).text()).toBe('asset:/_login/');
    expect((await b.req('/_login/nope', { accept: 'text/html' })).status).toBe(404);
  });

  it('sets strict security headers', async () => {
    const res = await browser().req('/_login/', { accept: 'text/html' });
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('rejects a made-up session cookie', async () => {
    const b = browser();
    b.jar.set(SESSION_COOKIE, 'forged');
    expect((await b.req('/api/auth/me')).status).toBe(401);
  });
});

describe('invite-only registration', () => {
  it('has no way in without an invite', async () => {
    const b = browser();
    expect((await b.req('/api/auth/register/options', { method: 'POST', body: {} })).status).toBe(400);
    expect((await b.req('/api/auth/register/options', { method: 'POST', body: { invite: 'x'.repeat(43) } })).status).toBe(403);
  });

  it('registers a passkey from an invite and signs the person in', async () => {
    const token = await invite('Spencer', 'owner');
    const b = browser();
    const res = await register(b, token, 'cred-spencer');
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(await (await b.req('/api/auth/me')).json()).toEqual({ name: 'Spencer', role: 'owner' });
    expect(await (await b.req('/wealth', { accept: 'text/html' })).text()).toBe('asset:/wealth');
  });

  it('only stores session hashes, never the cookie value', async () => {
    const b = browser();
    await register(b, await invite('Spencer', 'owner'), 'cred-spencer');
    const stored = db.raw.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(stored.map((s) => s.token_hash)).not.toContain(b.jar.get(SESSION_COOKIE));
  });

  it('an invite works exactly once', async () => {
    const token = await invite('Spencer', 'owner');
    expect((await register(browser(), token, 'cred-1')).status).toBe(200);
    expect((await register(browser(), token, 'cred-2')).status).toBe(403);
  });

  it('an invite expires', async () => {
    const token = await invite('Sara', 'member', 1);
    now += 2 * 3_600_000;
    expect((await register(browser(), token, 'cred-sara')).status).toBe(403);
  });

  it('rejects a response for a different challenge or origin', async () => {
    const token = await invite('Spencer', 'owner');
    const b = browser();
    await b.req('/api/auth/register/options', { method: 'POST', body: { invite: token } });
    const res = await b.req('/api/auth/register/verify', { method: 'POST', body: { id: 'c', challenge: 'reg-guess', origin: ORIGIN } });
    expect(res.status).toBe(400);
    // The failed attempt used up the challenge, and the invite is still unused for a real try.
    expect((await register(b, token, 'cred-ok')).status).toBe(200);
  });
});

describe('sign in', () => {
  beforeEach(async () => {
    await register(browser(), await invite('Spencer', 'owner'), 'cred-spencer');
  });

  it('signs in with a registered passkey', async () => {
    const b = browser();
    expect((await login(b, 'cred-spencer')).status).toBe(200);
    expect((await b.req('/api/auth/me')).status).toBe(200);
  });

  it('refuses an unknown passkey', async () => {
    expect((await login(browser(), 'cred-stranger')).status).toBe(401);
  });

  it('refuses a bad signature', async () => {
    expect((await login(browser(), 'cred-spencer', 'someone-else')).status).toBe(401);
  });

  it('refuses a replayed challenge', async () => {
    const b = browser();
    const opts = await (await b.req('/api/auth/login/options', { method: 'POST' })).json();
    const body = { id: 'cred-spencer', challenge: opts.challenge, signedBy: 'cred-spencer' };
    expect((await b.req('/api/auth/login/verify', { method: 'POST', body })).status).toBe(200);
    b.jar.set(CHALLENGE_COOKIE, 'replayed');
    expect((await b.req('/api/auth/login/verify', { method: 'POST', body })).status).toBe(400);
  });

  it('refuses an expired challenge', async () => {
    const b = browser();
    const opts = await (await b.req('/api/auth/login/options', { method: 'POST' })).json();
    now += 6 * 60_000;
    const res = await b.req('/api/auth/login/verify', { method: 'POST', body: { id: 'cred-spencer', challenge: opts.challenge, signedBy: 'cred-spencer' } });
    expect(res.status).toBe(400);
  });

  it('blocks POSTs from another site', async () => {
    const evil = browser('https://evil.example');
    expect((await evil.req('/api/auth/login/options', { method: 'POST' })).status).toBe(403);
  });

  it('sessions expire after 12 hours by default', async () => {
    const b = browser();
    await login(b, 'cred-spencer');
    now += 11 * 3_600_000;
    expect((await b.req('/api/auth/me')).status).toBe(200);
    now += 2 * 3_600_000;
    expect((await b.req('/api/auth/me')).status).toBe(401);
  });

  it('sign out ends the session on the server', async () => {
    const b = browser();
    await login(b, 'cred-spencer');
    const token = b.jar.get(SESSION_COOKIE)!;
    await b.req('/api/auth/logout', { method: 'POST' });
    b.jar.set(SESSION_COOKIE, token); // even if the old cookie is kept
    expect((await b.req('/api/auth/me')).status).toBe(401);
  });

  it('revoking a person locks them out immediately', async () => {
    const sara = browser();
    await register(sara, await invite('Sara'), 'cred-sara');
    expect((await sara.req('/api/auth/me')).status).toBe(200);
    db.raw.exec(`UPDATE users SET disabled = 1 WHERE name = 'Sara'`);
    expect((await sara.req('/api/auth/me')).status).toBe(401);
    expect((await login(browser(), 'cred-sara')).status).toBe(401);
  });

  it('a second invite adds a passkey for another device', async () => {
    expect((await register(browser(), await invite('Spencer', 'owner'), 'cred-spencer-laptop')).status).toBe(200);
    expect((await login(browser(), 'cred-spencer-laptop')).status).toBe(200);
    expect((await login(browser(), 'cred-spencer')).status).toBe(200);
  });
});
