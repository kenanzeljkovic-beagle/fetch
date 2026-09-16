/**
 * Telnyx integration (server side only — the browser never sees TELNYX_API_KEY).
 *
 * Browser calling uses Telnyx's WebRTC JS SDK (@telnyx/webrtc) authenticated with a
 * short-lived JWT. The JWT chain, per Telnyx's current docs:
 *   1. A *Credential* SIP Connection exists in the portal  -> TELNYX_CONNECTION_ID
 *   2. POST /v2/telephony_credentials { connection_id, name } -> credential id (one per user)
 *   3. POST /v2/telephony_credentials/{id}/token             -> JWT, valid 24h
 * The browser then does `new TelnyxRTC({ login_token })` and `client.newCall(...)`.
 */
import { config } from '../config';
import { HttpError } from '../lib/errors';

const API = 'https://api.telnyx.com/v2';

async function telnyxFetch(path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.telnyx.apiKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  } catch (e: any) {
    throw new HttpError(502, `Could not reach Telnyx: ${e.message}`, 'TELNYX_UNREACHABLE');
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(401, 'Telnyx rejected the API key. Check TELNYX_API_KEY.', 'TELNYX_AUTH');
  return res;
}

let cachedCredentialId: string | null = config.telnyx.credentialId || null;

/** Returns a telephony credential ID for this connection, creating one if needed. */
export async function ensureCredential(): Promise<string> {
  if (cachedCredentialId) return cachedCredentialId;
  const res = await telnyxFetch('/telephony_credentials', {
    method: 'POST',
    body: JSON.stringify({ connection_id: config.telnyx.connectionId, name: `fetch-${Date.now()}` }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.data?.id) {
    const detail = json?.errors?.map((e: any) => e.detail || e.title).join('; ') || res.statusText;
    throw new HttpError(502, `Telnyx could not create a telephony credential: ${detail}`, 'TELNYX_CREDENTIAL');
  }
  cachedCredentialId = json.data.id;
  console.log(`[telnyx] created telephony credential ${cachedCredentialId} — set TELNYX_CREDENTIAL_ID=${cachedCredentialId} in .env to reuse it`);
  return cachedCredentialId!;
}

/** Mints a 24h JWT for the browser SDK. */
export async function createLoginToken(): Promise<string> {
  const credId = await ensureCredential();
  const res = await telnyxFetch(`/telephony_credentials/${credId}/token`, { method: 'POST' });
  const text = await res.text();
  if (!res.ok) {
    // A stale credential ID (e.g. deleted in the portal) — drop the cache so the next call recreates it.
    if (res.status === 404) cachedCredentialId = null;
    throw new HttpError(502, `Telnyx could not mint a login token (${res.status}): ${text.slice(0, 200)}`, 'TELNYX_TOKEN');
  }
  // The token endpoint returns the JWT as plain text; some clients wrap it in JSON.
  try { const j = JSON.parse(text); return j?.data?.token ?? j?.token ?? text; } catch { return text.trim(); }
}
