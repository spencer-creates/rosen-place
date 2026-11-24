# Rosen Place

Family hub for the Rosen family, organized around the family's Future document and its five areas: Partnership, Health, Children, Wealth, Creativity.

This is the navigation shell plus passkey sign-in. No feature logic yet.

## Run

```bash
npm install
npm run dev      # local dev server
npm test         # nav structure + auth checks
npm run build
```

## Security: passkey sign-in

The whole app sits behind a passkey (Face ID, Touch ID, Windows Hello or a security key). It runs on Cloudflare: a Worker checks the session on **every** request before any page, script or file is sent, and keeps people, passkeys and sessions in a D1 database. Without a valid session you only get the sign-in page.

- **No sign-up.** A person can only add a passkey with a one-time invite link, made from the command line by someone with access to the Cloudflare account. Links work once and expire (24h by default).
- **Passkeys only.** No passwords, no email codes, nothing to phish. User verification (biometric or device PIN) is required.
- **Sessions** last 12 hours (`SESSION_TTL_HOURS`), live in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, and only a hash of the token is stored. Sign out ends the session on the server.
- **Revocation** is instant: `revoke` blocks the person and ends their open sessions.
- Strict headers on every response (CSP, HSTS, no framing, `noindex`), origin checks on every POST, and an audit log of sign-ins.

### Who has access

```bash
npm run admin -- invite "Spencer" --owner --remote   # prints a one-time link; open it on your phone/laptop
npm run admin -- invite "Spencer" --owner --remote   # again for each extra device
npm run admin -- invite "Sara" --remote              # when Sara should get in
npm run admin -- list --remote                       # who has access, passkey count, last sign-in
npm run admin -- log --remote                        # recent sign-in events
npm run admin -- revoke "Sara" --remote              # lock someone out now (restore "Sara" to undo)
npm run admin -- forget-passkeys "Spencer" --remote  # lost device: delete passkeys, then invite again
```

Send invite links privately. Anyone holding an unused link could register a passkey with it until it expires or is used.

### First deploy (one time)

1. Create a free Cloudflare account and add the domain you want (e.g. `home.yourdomain.com`).
2. `npx wrangler login`
3. `npx wrangler d1 create rosen-place`, then paste the `database_id` into both places in `wrangler.jsonc`.
4. In `wrangler.jsonc` → `env.production`, set the route, `RP_ID` (the hostname) and `ORIGIN` (`https://` + hostname). Passkeys are tied to that hostname, so pick it once.
5. `npm run deploy`
6. `npm run admin -- invite "Spencer" --owner --remote` and open the link.

Optional second lock: put Cloudflare Access (free for small teams) in front of the hostname, allowing only your email. Then someone would need your email inbox **and** your passkey.

### Local

```bash
npm run dev          # UI only, no sign-in (for working on screens)
npm run dev:secure   # full build behind the passkey gate at http://localhost:8787
npm run admin -- invite "Spencer" --owner --local
```

## Navigation (three layers, max)

1. **Top bar**: Future + the five areas. Acts as a filter. Future shows every tab; an area shows only its tabs.
2. **Sidebar**: tabs for the selected area. Carets expand one level only (e.g. Kids > All kids, Daughter 1, Daughter 2).
3. **Page tabs**: one row of views inside a page (e.g. Finances > Dashboard ... Commitments). Never nested.

Anything deeper is page content, not navigation.

All structure lives in `src/nav/config.ts`. Each sidebar tab has exactly one `area`. `validateNavConfig` (run at startup and in tests) rejects duplicate ids, unknown areas, nesting past one level, and the word "goals".

### Swapping the area nav for plain tabs

Set `NAV_MODE` in `src/nav/config.ts` to `'flat-tabs'`, or build with `VITE_NAV_MODE=flat-tabs`. The top bar becomes one plain tab per section; routes, pages and data are unchanged.

## Open questions (placeholders in the UI)

Tabs marked **idea** were raised but not decided; **placeholder** means nothing has been chosen yet.

- Sidebar tabs for Partnership, Health, Children and Creativity aren't settled. Current stand-ins: Partnership (Dating, Development), Health (one placeholder), Children (Kids > All kids, Daughter 1, Daughter 2), Creativity (Home improvements, Travel, Music).
- Daughters' names and their page tabs (Development plan, School, Activities are stand-ins).
- Where the shared calendar and "doings" sit relative to the area filter. Currently an "Always visible" section under the sidebar, outside the filter.
- Whether a promise created here auto-schedules in I'm Doing Now or lands as "pending scheduling."
- Whether the five-area nav sticks (see the swap above).
