import { randomToken, sha256 } from './crypto.js';
import type { Db } from './db.js';

export type Role = 'owner' | 'member';
export interface User {
  id: string;
  name: string;
  role: Role;
  webauthn_user_id: string;
}
export interface Credential {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
}
export interface Challenge {
  challenge: string;
  invite_hash: string | null;
}

const MINUTE = 60_000;
export const CHALLENGE_TTL_MS = 5 * MINUTE;
export const NAME_RE = /^[\p{L}\p{N} .'-]{1,40}$/u;

export class Store {
  private db: Db;
  private now: () => number;
  constructor(db: Db, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  private async one<T>(text: string, params: unknown[]): Promise<T | null> {
    return (await this.db.query<T>(text, params)).rows[0] ?? null;
  }

  // ---------- invites ----------

  /** The user behind an unused, unexpired invite whose account is active. */
  async userForInvite(inviteHash: string): Promise<User | null> {
    return this.one<User>(
      `SELECT u.id, u.name, u.role, u.webauthn_user_id FROM invites i JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > $2 AND NOT u.disabled`,
      [inviteHash, this.now()],
    );
  }

  /** Marks the invite used. Returns false if someone else used it first. */
  async consumeInvite(inviteHash: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE invites SET used_at = $1 WHERE token_hash = $2 AND used_at IS NULL AND expires_at > $1`,
      [this.now(), inviteHash],
    );
    return r.rowCount === 1;
  }

  // ---------- challenges ----------

  async saveChallenge(c: { challenge: string; kind: 'register' | 'login'; invite_hash: string | null }): Promise<string> {
    const id = randomToken();
    await this.db.query(`INSERT INTO challenges (id, challenge, kind, invite_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      c.challenge,
      c.kind,
      c.invite_hash,
      this.now() + CHALLENGE_TTL_MS,
    ]);
    return id;
  }

  /** Single use: the challenge is deleted whether or not it is still valid. */
  async takeChallenge(id: string, kind: 'register' | 'login'): Promise<Challenge | null> {
    const c = await this.one<Challenge & { valid: boolean }>(
      `DELETE FROM challenges WHERE id = $1 RETURNING challenge, invite_hash, (kind = $2 AND expires_at > $3) AS valid`,
      [id, kind, this.now()],
    );
    return c?.valid ? { challenge: c.challenge, invite_hash: c.invite_hash } : null;
  }

  // ---------- credentials ----------

  async credentialsForUser(userId: string): Promise<Credential[]> {
    return (await this.db.query<Credential>(`SELECT id, user_id, public_key, counter, transports FROM credentials WHERE user_id = $1`, [userId])).rows;
  }

  /** The credential and its owner, only if the owner is active. */
  async credentialWithUser(credentialId: string): Promise<{ credential: Credential; user: User } | null> {
    const row = await this.one<Credential & Omit<User, 'id'>>(
      `SELECT c.id, c.user_id, c.public_key, c.counter, c.transports, u.name, u.role, u.webauthn_user_id
       FROM credentials c JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 AND NOT u.disabled`,
      [credentialId],
    );
    if (!row) return null;
    const { name, role, webauthn_user_id, ...credential } = row;
    return { credential, user: { id: row.user_id, name, role, webauthn_user_id } };
  }

  async addCredential(c: {
    id: string;
    userId: string;
    publicKey: string;
    counter: number;
    transports?: string[];
    deviceType: string;
    backedUp: boolean;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO credentials (id, user_id, public_key, counter, transports, device_type, backed_up, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [c.id, c.userId, c.publicKey, c.counter, JSON.stringify(c.transports ?? []), c.deviceType, c.backedUp, this.now()],
    );
  }

  async touchCredential(id: string, counter: number): Promise<void> {
    await this.db.query(`UPDATE credentials SET counter = $1, last_used_at = $2 WHERE id = $3`, [counter, this.now(), id]);
  }

  // ---------- sessions ----------

  /** Returns the raw token for the cookie. Only its hash is stored. */
  async createSession(userId: string, ttlMs: number): Promise<string> {
    const token = randomToken();
    const now = this.now();
    await this.db.query(`DELETE FROM sessions WHERE expires_at <= $1`, [now]);
    await this.db.query(`DELETE FROM challenges WHERE expires_at <= $1`, [now]);
    await this.db.query(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`, [
      await sha256(token),
      userId,
      now,
      now + ttlMs,
    ]);
    return token;
  }

  async userForSession(token: string): Promise<User | null> {
    return this.one<User>(
      `SELECT u.id, u.name, u.role, u.webauthn_user_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2 AND NOT u.disabled`,
      [await sha256(token), this.now()],
    );
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.query(`DELETE FROM sessions WHERE token_hash = $1`, [await sha256(token)]);
  }

  // ---------- audit ----------

  async audit(event: string, userId: string | null, ip: string | null, detail?: string): Promise<void> {
    await this.db.query(`INSERT INTO audit_log (at, user_id, event, ip, detail) VALUES ($1, $2, $3, $4, $5)`, [
      this.now(),
      userId,
      event,
      ip,
      detail ?? null,
    ]);
  }

  // ---------- admin (run from the command line, never reachable from the web) ----------

  /** Creates the person if new, and a single-use invite. Returns the raw token for the link. */
  async createInvite(name: string, role: Role, hours = 24): Promise<string> {
    if (!NAME_RE.test(name)) throw new Error(`Name must be letters, numbers, spaces, . ' - (max 40): ${name}`);
    const now = this.now();
    await this.db.query(
      `INSERT INTO users (id, name, role, webauthn_user_id, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role`,
      [randomToken(16), name, role, randomToken(32), now],
    );
    const token = randomToken();
    await this.db.query(`INSERT INTO invites (token_hash, user_id, expires_at) SELECT $1, id, $2 FROM users WHERE name = $3`, [
      await sha256(token),
      now + hours * 3_600_000,
      name,
    ]);
    return token;
  }

  /** Blocks sign-in, ends open sessions and cancels unused invites. */
  async revoke(name: string): Promise<boolean> {
    const u = await this.one<{ id: string }>(`UPDATE users SET disabled = TRUE WHERE name = $1 RETURNING id`, [name]);
    if (!u) return false;
    await this.db.query(`DELETE FROM sessions WHERE user_id = $1`, [u.id]);
    await this.db.query(`DELETE FROM invites WHERE user_id = $1 AND used_at IS NULL`, [u.id]);
    return true;
  }

  async restore(name: string): Promise<boolean> {
    return (await this.db.query(`UPDATE users SET disabled = FALSE WHERE name = $1`, [name])).rowCount === 1;
  }

  /** For a lost device: removes every passkey and session for the person. */
  async forgetPasskeys(name: string): Promise<boolean> {
    const u = await this.one<{ id: string }>(`SELECT id FROM users WHERE name = $1`, [name]);
    if (!u) return false;
    await this.db.query(`DELETE FROM credentials WHERE user_id = $1`, [u.id]);
    await this.db.query(`DELETE FROM sessions WHERE user_id = $1`, [u.id]);
    return true;
  }

  async listUsers() {
    return (
      await this.db.query(
        `SELECT u.name, u.role, CASE WHEN u.disabled THEN 'revoked' ELSE 'active' END AS status,
                COUNT(c.id)::int AS passkeys, to_timestamp(MAX(c.last_used_at) / 1000.0) AS last_sign_in
         FROM users u LEFT JOIN credentials c ON c.user_id = u.id GROUP BY u.id ORDER BY u.created_at`,
      )
    ).rows;
  }

  async recentLog(limit = 50) {
    return (
      await this.db.query(
        `SELECT to_timestamp(a.at / 1000.0) AS at, a.event, u.name, a.ip FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT $1`,
        [limit],
      )
    ).rows;
  }
}
