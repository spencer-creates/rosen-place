import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import './login.css';

const params = new URLSearchParams(location.search);
const invite = params.get('invite');
const button = document.getElementById('action') as HTMLButtonElement;
const lead = document.getElementById('lead')!;
const status = document.getElementById('status')!;

/** Only same-site paths, so the login page can't be used to bounce people elsewhere. */
function nextPath(): string {
  const next = params.get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data as T;
}

async function signIn() {
  const optionsJSON = await post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/login/options');
  const response = await startAuthentication({ optionsJSON });
  await post('/api/auth/login/verify', response);
}

async function setUp(token: string) {
  const optionsJSON = await post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/auth/register/options', { invite: token });
  const response = await startRegistration({ optionsJSON });
  const { name } = await post<{ name: string }>('/api/auth/register/verify', response);
  // Drop the invite from the address bar and history.
  history.replaceState(null, '', location.pathname);
  status.textContent = `Passkey saved. Welcome, ${name}.`;
}

if (invite) {
  lead.textContent = 'You were invited to Rosen Place. Create a passkey on this device to finish.';
  button.textContent = 'Create passkey';
}

if (!browserSupportsWebAuthn()) {
  button.disabled = true;
  status.textContent = 'This browser does not support passkeys. Try an up-to-date Safari, Chrome or Edge.';
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = '';
  try {
    if (invite) await setUp(invite);
    else await signIn();
    location.replace(nextPath());
  } catch (e) {
    const err = e as Error;
    status.textContent = err.name === 'NotAllowedError' ? 'Cancelled. Try again when ready.' : err.message;
    button.disabled = false;
  }
});
