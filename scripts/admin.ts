// Rosen Place access admin. Needs DATABASE_URL (and ORIGIN for links), e.g. from
// `vercel env pull .env.local`. The website itself has no sign-up, so this is the only way in.
//
//   npm run admin -- invite "Spencer" --owner     one-time passkey link (run again per device)
//   npm run admin -- invite "Sara"                same, as a member
//   npm run admin -- revoke "Sara"                block sign-in and end their sessions now
//   npm run admin -- restore "Sara"               undo revoke
//   npm run admin -- forget-passkeys "Sara"       delete their passkeys (e.g. lost phone)
//   npm run admin -- list                         who has access, passkeys, last use
//   npm run admin -- log                          last 50 sign-in events
import { neonDb } from '../server/db.js';
import { NAME_RE, Store } from '../server/store.js';

const [cmd, ...rest] = process.argv.slice(2);
const name = rest.find((a) => !a.startsWith('--'));
const flag = (f: string) => rest.includes(f);

function needName(): string {
  if (!name || !NAME_RE.test(name)) throw new Error('Give the person’s name, e.g. "Sara".');
  return name;
}
const report = (ok: boolean, msg: string) => console.log(ok ? msg : `No one named "${name}".`);

try {
  const store = new Store(neonDb(process.env.DATABASE_URL));
  switch (cmd) {
    case 'invite': {
      const who = needName();
      const hours = Number(rest.find((a) => a.startsWith('--hours='))?.split('=')[1] ?? 24);
      const token = await store.createInvite(who, flag('--owner') ? 'owner' : 'member', hours);
      const origin = process.env.ORIGIN ?? 'https://YOUR-DOMAIN';
      console.log(`\nOne-time passkey link for ${who} (expires in ${hours}h, works once):\n\n  ${origin}/_login/?invite=${token}\n`);
      console.log('Open it on the device that should hold the passkey. Send it privately, never in a group chat.');
      break;
    }
    case 'revoke':
      report(await store.revoke(needName()), `${name} can no longer sign in, and any open sessions were ended.`);
      break;
    case 'restore':
      report(await store.restore(needName()), `${name} can sign in again with their existing passkeys.`);
      break;
    case 'forget-passkeys':
      report(await store.forgetPasskeys(needName()), `${name}'s passkeys were deleted. Send a new invite to set one up again.`);
      break;
    case 'list':
      console.table(await store.listUsers());
      break;
    case 'log':
      console.table(await store.recentLog());
      break;
    default:
      console.error('Usage: npm run admin -- <invite|revoke|restore|forget-passkeys|list|log> ["Name"] [--owner] [--hours=24]');
      process.exit(1);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
