import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as webauthn from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { fromBase64Url, sha256, toBase64Url } from './crypto.js';
import type { Db } from './db.js';
import { CHALLENGE_COOKIE, SECURITY_HEADERS, SESSION_COOKIE } from './headers.js';
import { CHALLENGE_TTL_MS, Store, type User } from './store.js';

export interface Env {
  DB: Db;
  /** The site's hostname, e.g. "home.rosen.family". Passkeys are bound to it. */
  RP_ID: string;
  /** The exact origin, e.g. "https://home.rosen.family". */
  ORIGIN: string;
  SESSION_TTL_HOURS?: string;
}

/** WebAuthn functions, injectable so tests can stand in for a real authenticator. */
export type WebAuthn = Pick<
  typeof webauthn,
  'generateRegistrationOptions' | 'verifyRegistrationResponse' | 'generateAuthenticationOptions' | 'verifyAuthenticationResponse'
>;

type AppEnv = { Bindings: Env; Variables: { store: Store; user: User } };

export function createApp(opts: { webauthn?: WebAuthn; now?: () => number } = {}) {
  const wa = opts.webauthn ?? webauthn;
  const now = opts.now ?? Date.now;
  const app = new Hono<AppEnv>().basePath('/api');

  const ttlMs = (env: Env) => Number(env.SESSION_TTL_HOURS || '12') * 3_600_000;
  const ip = (c: Context<AppEnv>) => c.req.header('CF-Connecting-IP') ?? null;

  const setSession = async (c: Context<AppEnv>, user: User) => {
    const token = await c.var.store.createSession(user.id, ttlMs(c.env));
    setCookie(c, SESSION_COOKIE, token, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: Math.floor(ttlMs(c.env) / 1000),
    });
  };

  const setChallengeCookie = (c: Context<AppEnv>, id: string) =>
    setCookie(c, CHALLENGE_COOKIE, id, { path: '/', secure: true, httpOnly: true, sameSite: 'Strict', maxAge: CHALLENGE_TTL_MS / 1000 });

  const takeChallenge = async (c: Context<AppEnv>, kind: 'register' | 'login') => {
    const id = getCookie(c, CHALLENGE_COOKIE);
    deleteCookie(c, CHALLENGE_COOKIE, { path: '/', secure: true });
    return id ? c.var.store.takeChallenge(id, kind) : null;
  };

  const fail = (c: Context<AppEnv>, status: 400 | 401 | 403, message: string) => c.json({ error: message }, status);

  // Every API response gets security headers and is never cached.
  app.use('*', async (c, next) => {
    c.set('store', new Store(c.env.DB, now));
    await next();
    const res = new Response(c.res.body, c.res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    res.headers.set('Cache-Control', 'no-store');
    c.res = res;
  });

  // Cross-site request protection on top of SameSite=Strict cookies.
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('Origin') !== c.env.ORIGIN) {
      return fail(c, 403, 'Bad origin');
    }
    await next();
  });

  // ---------- registration (invite only) ----------

  app.post('/auth/register/options', async (c) => {
    const { invite } = await c.req.json<{ invite?: string }>().catch(() => ({ invite: undefined }));
    if (typeof invite !== 'string' || invite.length < 20) return fail(c, 400, 'This invite link is not valid.');
    const inviteHash = await sha256(invite);
    const user = await c.var.store.userForInvite(inviteHash);
    if (!user) {
      await c.var.store.audit('register.invalid_invite', null, ip(c));
      return fail(c, 403, 'This invite link is not valid, has expired, or was already used.');
    }
    const existing = await c.var.store.credentialsForUser(user.id);
    const options = await wa.generateRegistrationOptions({
      rpName: 'Rosen Place',
      rpID: c.env.RP_ID,
      userName: user.name,
      userDisplayName: user.name,
      userID: fromBase64Url(user.webauthn_user_id),
      attestationType: 'none',
      excludeCredentials: existing.map((cr) => ({ id: cr.id, transports: JSON.parse(cr.transports ?? '[]') })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    setChallengeCookie(c, await c.var.store.saveChallenge({ challenge: options.challenge, kind: 'register', invite_hash: inviteHash }));
    return c.json(options);
  });

  app.post('/auth/register/verify', async (c) => {
    const challenge = await takeChallenge(c, 'register');
    if (!challenge?.invite_hash) return fail(c, 400, 'That took too long. Open the invite link and try again.');
    const user = await c.var.store.userForInvite(challenge.invite_hash);
    if (!user) return fail(c, 403, 'This invite link is not valid, has expired, or was already used.');

    let result;
    try {
      result = await wa.verifyRegistrationResponse({
        response: await c.req.json<RegistrationResponseJSON>(),
        expectedChallenge: challenge.challenge,
        expectedOrigin: c.env.ORIGIN,
        expectedRPID: c.env.RP_ID,
        requireUserVerification: true,
      });
    } catch {
      result = { verified: false as const };
    }
    if (!result.verified) {
      await c.var.store.audit('register.failed', user.id, ip(c));
      return fail(c, 400, 'The passkey could not be verified.');
    }
    // Claim the invite before storing anything, so a link can only ever add one passkey.
    if (!(await c.var.store.consumeInvite(challenge.invite_hash))) return fail(c, 403, 'This invite link was already used.');

    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
    await c.var.store.addCredential({
      id: credential.id,
      userId: user.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });
    await c.var.store.audit('register.ok', user.id, ip(c));
    await setSession(c, user);
    return c.json({ ok: true, name: user.name });
  });

  // ---------- sign in ----------

  app.post('/auth/login/options', async (c) => {
    const options = await wa.generateAuthenticationOptions({ rpID: c.env.RP_ID, userVerification: 'required' });
    setChallengeCookie(c, await c.var.store.saveChallenge({ challenge: options.challenge, kind: 'login', invite_hash: null }));
    return c.json(options);
  });

  app.post('/auth/login/verify', async (c) => {
    const challenge = await takeChallenge(c, 'login');
    if (!challenge) return fail(c, 400, 'That took too long. Please try again.');
    const response = await c.req.json<AuthenticationResponseJSON>().catch(() => null);
    const found = typeof response?.id === 'string' ? await c.var.store.credentialWithUser(response.id) : null;
    if (!response || !found) {
      await c.var.store.audit('login.unknown_credential', null, ip(c));
      return fail(c, 401, 'This passkey is not allowed here.');
    }
    const { credential, user } = found;

    let result;
    try {
      result = await wa.verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: c.env.ORIGIN,
        expectedRPID: c.env.RP_ID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: fromBase64Url(credential.public_key),
          counter: credential.counter,
          transports: JSON.parse(credential.transports ?? '[]'),
        },
      });
    } catch {
      result = null;
    }
    if (!result?.verified) {
      await c.var.store.audit('login.failed', user.id, ip(c));
      return fail(c, 401, 'The passkey could not be verified.');
    }
    await c.var.store.touchCredential(credential.id, result.authenticationInfo.newCounter);
    await c.var.store.audit('login.ok', user.id, ip(c));
    await setSession(c, user);
    return c.json({ ok: true, name: user.name });
  });

  // ---------- signed-in only (the middleware gate checks too; this is the second lock) ----------

  app.use('*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const user = token ? await c.var.store.userForSession(token) : null;
    if (!user) return fail(c, 401, 'Sign in required.');
    c.set('user', user);
    await next();
  });

  app.get('/auth/me', (c) => c.json({ name: c.var.user.name, role: c.var.user.role }));

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await c.var.store.deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    await c.var.store.audit('logout', c.var.user.id, ip(c));
    return c.json({ ok: true });
  });

  app.all('*', (c) => c.json({ error: 'Not found' }, 404));

  return app;
}
