import { useEffect, useState } from 'react';

/**
 * Who is signed in, and sign out. Renders nothing when there is no auth server
 * (plain `npm run dev`), so the UI shell can still be worked on without one.
 */
export function AccountMenu() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => (r.ok && r.headers.get('Content-Type')?.includes('json') ? r.json() : null))
      .then((me) => live && setName(me?.name ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!name) return null;

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    location.replace('/_login/');
  };

  return (
    <div className="account">
      <span className="account-name">{name}</span>
      <button type="button" className="account-signout" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
