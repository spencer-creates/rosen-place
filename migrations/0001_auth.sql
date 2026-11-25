-- Passkey auth for Rosen Place (Postgres).
-- There is no sign-up. A person exists only after an admin creates an invite
-- with `npm run admin -- invite <name>` (requires the database connection string).
-- Times are milliseconds since the epoch.

CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  role             TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  webauthn_user_id TEXT NOT NULL UNIQUE,     -- random, base64url; never the name
  disabled         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       BIGINT NOT NULL
);

CREATE TABLE credentials (
  id           TEXT PRIMARY KEY,             -- credential id, base64url
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,                -- COSE public key, base64url
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,                         -- JSON array
  device_type  TEXT,
  backed_up    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   BIGINT NOT NULL,
  last_used_at BIGINT
);
CREATE INDEX credentials_user ON credentials(user_id);

-- One-time links that let a named person register a passkey.
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,               -- SHA-256 of the token; the token itself is never stored
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  used_at    BIGINT
);

-- WebAuthn challenges, single use, short lived.
CREATE TABLE challenges (
  id          TEXT PRIMARY KEY,
  challenge   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('register', 'login')),
  invite_hash TEXT,
  expires_at  BIGINT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,               -- SHA-256 of the cookie value
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE audit_log (
  id      BIGSERIAL PRIMARY KEY,
  at      BIGINT NOT NULL,
  user_id TEXT,
  event   TEXT NOT NULL,
  ip      TEXT,
  detail  TEXT
);
