import { randomToken, sha256 } from './crypto';

/** The subset of Cloudflare D1 this app uses, so tests can run on node:sqlite. */
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<unknown>;
}
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

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
  id: string;
  challenge: string;
  kind: 'register' | 'login';
  invite_hash: string | null;
  expires_at: number;
}

const MINUTE = 60_000;
export const CHALLENGE_TTL_MS = 5 * MINUTE;

export class Store {
  private db: Db;
  private now: () => number;
  constructor(db: Db, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  // ---------- invites ----------

  /** The user behind an unused, unexpired invite whose account is active. */
  async userForInvite(inviteHash: string): Promise<User | null> {
    return this.db
      .prepare(
        `SELECT u.id, u.name, u.role, u.webauthn_user_id FROM invites i JOIN users u ON u.id = i.user_id
         WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND u.disabled = 0`,
      )
      .bind(inviteHash, this.now())
      .first<User>();
  }

  /** Marks the invite used. Returns false if someone else used it first. */
  async consumeInvite(inviteHash: string): Promise<boolean> {
    const r = await this.db
      .prepare(`UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`)
      .bind(this.now(), inviteHash, this.now())
      .run();
    return r.meta.changes === 1;
  }

  // ---------- challenges ----------

  async saveChallenge(c: Omit<Challenge, 'id' | 'expires_at'>): Promise<string> {
    const id = randomToken();
    await this.db
      .prepare(`INSERT INTO challenges (id, challenge, kind, invite_hash, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, c.challenge, c.kind, c.invite_hash, this.now() + CHALLENGE_TTL_MS)
      .run();
    return id;
  }

  /** Single use: the challenge is deleted whether or not it is still valid. */
  async takeChallenge(id: string, kind: Challenge['kind']): Promise<Challenge | null> {
    const c = await this.db.prepare(`DELETE FROM challenges WHERE id = ? RETURNING *`).bind(id).first<Challenge>();
    if (!c || c.kind !== kind || c.expires_at <= this.now()) return null;
    return c;
  }

  // ---------- credentials ----------

  async credentialsForUser(userId: string): Promise<Credential[]> {
    const r = await this.db.prepare(`SELECT * FROM credentials WHERE user_id = ?`).bind(userId).all<Credential>();
    return r.results;
  }

  /** The credential and its owner, only if the owner is active. */
  async credentialWithUser(credentialId: string): Promise<{ credential: Credential; user: User } | null> {
    const row = await this.db
      .prepare(
        `SELECT c.id, c.user_id, c.public_key, c.counter, c.transports,
                u.name, u.role, u.webauthn_user_id
         FROM credentials c JOIN users u ON u.id = c.user_id
         WHERE c.id = ? AND u.disabled = 0`,
      )
      .bind(credentialId)
      .first<Credential & Omit<User, 'id'>>();
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
    await this.db
      .prepare(
        `INSERT INTO credentials (id, user_id, public_key, counter, transports, device_type, backed_up, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(c.id, c.userId, c.publicKey, c.counter, JSON.stringify(c.transports ?? []), c.deviceType, c.backedUp ? 1 : 0, this.now())
      .run();
  }

  async touchCredential(id: string, counter: number): Promise<void> {
    await this.db.prepare(`UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?`).bind(counter, this.now(), id).run();
  }

  // ---------- sessions ----------

  /** Returns the raw token for the cookie. Only its hash is stored. */
  async createSession(userId: string, ttlMs: number): Promise<string> {
    const token = randomToken();
    const now = this.now();
    await this.db.batch([
      this.db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now),
      this.db.prepare(`DELETE FROM challenges WHERE expires_at <= ?`).bind(now),
      this.db
        .prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
        .bind(await sha256(token), userId, now, now + ttlMs),
    ]);
    return token;
  }

  async userForSession(token: string): Promise<User | null> {
    return this.db
      .prepare(
        `SELECT u.id, u.name, u.role, u.webauthn_user_id FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
      )
      .bind(await sha256(token), this.now())
      .first<User>();
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  }

  // ---------- audit ----------

  async audit(event: string, userId: string | null, ip: string | null, detail?: string): Promise<void> {
    await this.db
      .prepare(`INSERT INTO audit_log (at, user_id, event, ip, detail) VALUES (?, ?, ?, ?, ?)`)
      .bind(this.now(), userId, event, ip, detail ?? null)
      .run();
  }
}
