import { createApp } from './app';

// Cloudflare Worker entry. Runs before every request (run_worker_first in wrangler.jsonc),
// so no page, script or file is sent until the passkey session checks out.
export default createApp();
