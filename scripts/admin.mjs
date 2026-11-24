#!/usr/bin/env node
// Rosen Place access admin. Only someone with access to the Cloudflare account can run this,
// which is what keeps the allowlist closed: the website itself has no sign-up.
//
//   npm run admin -- invite "Spencer" --owner --remote   one-time passkey link (also for a new device)
//   npm run admin -- invite "Sara" --remote               same, as a member
//   npm run admin -- revoke "Sara" --remote               block sign-in and end their sessions now
//   npm run admin -- restore "Sara" --remote              undo revoke
//   npm run admin -- forget-passkeys "Sara" --remote      delete their passkeys (e.g. lost phone)
//   npm run admin -- list --remote                        who has access, passkeys, last use
//   npm run admin -- log --remote                         last 50 sign-in events
//
// Use --local instead of --remote against `wrangler dev`'s local database.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const DB_NAME = 'rosen-place';
const NAME_RE = /^[\p{L}\p{N} .'-]{1,40}$/u;

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function sha256(value) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

/** SQL that creates the user if needed and a single-use invite for them. */
export async function inviteSql({ name, role, token, now, hours }) {
  if (!NAME_RE.test(name)) throw new Error(`Name must be letters, numbers, spaces, . ' - (max 40): ${name}`);
  if (role !== 'owner' && role !== 'member') throw new Error(`Bad role: ${role}`);
  const userId = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const webauthnId = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return [
    `INSERT OR IGNORE INTO users (id, name, role, webauthn_user_id, created_at) VALUES (${q(userId)}, ${q(name)}, ${q(role)}, ${q(webauthnId)}, ${now});`,
    `UPDATE users SET role = ${q(role)} WHERE name = ${q(name)};`,
    `INSERT INTO invites (token_hash, user_id, expires_at) SELECT ${q(await sha256(token))}, id, ${now + hours * 3_600_000} FROM users WHERE name = ${q(name)};`,
  ].join('\n');
}

function readOrigin() {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  // The last ORIGIN in the file is the production one (env.production.vars).
  return [...text.matchAll(/"ORIGIN"\s*:\s*"([^"]+)"/g)].at(-1)?.[1];
}

function d1(sql, where) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, where, ...(where === '--remote' ? ['--env', 'production'] : []), '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(out).flatMap((r) => r.results ?? []);
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const where = flags.has('--remote') ? '--remote' : flags.has('--local') ? '--local' : null;
  if (!cmd || !where) {
    console.error('Usage: npm run admin -- <invite|revoke|restore|forget-passkeys|list|log> [name] (--remote | --local) [--owner]');
    process.exit(1);
  }
  const name = args[0];
  const needName = () => {
    if (!name || !NAME_RE.test(name)) throw new Error('Give the person’s name, e.g. "Sara".');
  };
  const now = Date.now();

  switch (cmd) {
    case 'invite': {
      needName();
      const hours = Number(rest.find((a) => a.startsWith('--hours='))?.split('=')[1] ?? 24);
      const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
      d1(await inviteSql({ name, role: flags.has('--owner') ? 'owner' : 'member', token, now, hours }), where);
      const origin = where === '--local' ? 'http://localhost:8787' : readOrigin();
      console.log(`\nOne-time passkey link for ${name} (expires in ${hours}h, works once):\n\n  ${origin}/_login/?invite=${token}\n`);
      console.log('Open it on the device that should hold the passkey. Send it privately, never by group chat.');
      break;
    }
    case 'revoke':
      needName();
      d1(`UPDATE users SET disabled = 1 WHERE name = ${q(name)}; DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE name = ${q(name)}); DELETE FROM invites WHERE used_at IS NULL AND user_id IN (SELECT id FROM users WHERE name = ${q(name)});`, where);
      console.log(`${name} can no longer sign in, and any open sessions were ended.`);
      break;
    case 'restore':
      needName();
      d1(`UPDATE users SET disabled = 0 WHERE name = ${q(name)};`, where);
      console.log(`${name} can sign in again with their existing passkeys.`);
      break;
    case 'forget-passkeys':
      needName();
      d1(`DELETE FROM credentials WHERE user_id IN (SELECT id FROM users WHERE name = ${q(name)}); DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE name = ${q(name)});`, where);
      console.log(`${name}'s passkeys were deleted. Send a new invite to set one up again.`);
      break;
    case 'list':
      console.table(
        d1(
          `SELECT u.name, u.role, CASE u.disabled WHEN 1 THEN 'revoked' ELSE 'active' END AS status,
                  COUNT(c.id) AS passkeys, datetime(MAX(c.last_used_at) / 1000, 'unixepoch') AS last_sign_in_utc
           FROM users u LEFT JOIN credentials c ON c.user_id = u.id GROUP BY u.id ORDER BY u.created_at`,
          where,
        ),
      );
      break;
    case 'log':
      console.table(
        d1(
          `SELECT datetime(a.at / 1000, 'unixepoch') AS utc, a.event, u.name, a.ip FROM audit_log a
           LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 50`,
          where,
        ),
      );
      break;
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
