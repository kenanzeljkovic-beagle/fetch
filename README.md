# Fetch — MVP prototype

**Version 0.2.0** — see [CHANGELOG.md](./CHANGELOG.md) for what changed each release.

A browser-based sales dialer that sits between **Twenty CRM** and **Telnyx**.

```
Twenty CRM ──contacts──▶ Fetch ──WebRTC──▶ Telnyx ──▶ PSTN
    ▲                      │
    └───call note──────────┘
```

Purpose of this prototype: prove one workflow end to end.

> Twenty contact → Fetch → real Telnyx call → disposition → note on that exact Twenty contact

Everything else (power dialing, recording, AI, multi-user, subsidiaries) is deliberately out of scope. See **Prototype limitations**.

---

## Project structure

```
fetch/
├── package.json            npm workspaces (server + web), root scripts
├── .env.example            every variable you need, with where to find it
├── Dockerfile              single-container deploy (server serves the built web app)
├── server/                 Node 20 + TypeScript + Express
│   ├── src/index.ts        app entry: routes, static hosting, error handler
│   ├── src/config.ts       env loading + validation
│   ├── src/routes/         health, contacts, telnyx (JWT), calls (lifecycle + logging), guard (rules)
│   ├── src/services/twenty.ts   Twenty REST client + note logging (+ isolated mock data)
│   ├── src/services/guard.ts    Fetch Guard: DNC, calling hours, per-rep Company Type permissions
│   ├── src/services/telnyx.ts   telephony credential + JWT minting (server-side only)
│   ├── src/store/          CallStore interface, JSON-file store, PostgreSQL store
│   ├── src/lib/phone.ts    E.164 normalisation
│   ├── db/schema.sql       PostgreSQL schema (optional)
│   └── scripts/migrate.js  applies schema.sql to DATABASE_URL
└── web/                    React 18 + TypeScript + Vite + Tailwind
    ├── src/App.tsx         the one screen: contacts → call → disposition → log
    ├── src/lib/api.ts      typed client for the Fetch backend
    ├── src/lib/dialer.ts   TelnyxDialer (real, @telnyx/webrtc) and MockDialer (mock mode)
    └── src/components/     ContactList, ContactCard, CallPanel, PendingCalls, Banner
```

## Quick start (mock mode, no credentials)

```bash
npm install
cp .env.example .env          # set MOCK_MODE=true
npm run dev                   # server on :4000, web on :5173
```

Open http://localhost:5173. Contacts are fake and calls are simulated (the `MOCK MODE` badge is shown). Use this to click through the UI. Nothing in mock mode touches Twenty or Telnyx.

## Real setup

### 1. Twenty

- Sign in to Twenty (cloud: `https://api.twenty.com` is the API base; self-hosted: your domain).
- **Settings → API & Webhooks → + Create key.** Copy it once.
- Make sure at least one Person has a phone number in the Phone field.

```
TWENTY_API_URL=https://api.twenty.com
TWENTY_API_KEY=<key>
```

### 2. Telnyx (about 15 minutes in the portal)

1. **API key** — Account → Keys & Credentials → API Keys → Create. → `TELNYX_API_KEY`
2. **Phone number** — Numbers → Buy Numbers → any voice-enabled US number. → `TELNYX_PHONE_NUMBER` (E.164, e.g. `+18135551234`)
3. **Credential SIP Connection** — Voice → SIP Connections → Add → type **Credentials**.
   - Outbound tab: create/select an **Outbound Voice Profile** (required for PSTN calls).
   - Copy the **Connection ID** (numeric). → `TELNYX_CONNECTION_ID`
4. **Assign the number to that connection** — Numbers → My Numbers → your number → Connection/App = the credential connection from step 3.
5. Optional: after the first run, the server logs the telephony credential it created. Put it in `TELNYX_CREDENTIAL_ID` so it is reused.

### 3. Run

```bash
npm run dev
```

Open http://localhost:5173 in Chrome. `localhost` counts as a secure origin, so the microphone prompt works. (Any other host needs HTTPS.)

---

## How the integrations work

### Twenty authentication and API calls

- Every request carries `Authorization: Bearer <TWENTY_API_KEY>`.
- Contacts: `GET {TWENTY_API_URL}/rest/people?limit=50&depth=1`. `depth=1` expands the `company` relation so the company name is available. The server normalises each person to `{ id, name, company, phoneRaw, phone (E.164), email }`. Phone data is read from the `phones` composite (`primaryPhoneNumber` + `primaryPhoneCallingCode`) with a fallback to the older flat `phone` field.
- The **Twenty person ID is carried on the call record from creation onward** and is the only thing used when logging. Fetch never searches Twenty again after the call.

### Twenty activity logging

Twenty has no native "Call" activity object, so Fetch uses the closest reliable mechanism — a **Note attached to the person**:

1. `POST /rest/notes` with `{ title, bodyV2: { markdown } }` (falls back to `{ title, body }` if the workspace rejects `bodyV2`).
2. `POST /rest/noteTargets` with `{ noteId, personId }` — this is what places the note on that person's timeline.

Resulting note:

```
Outbound call via Fetch — Voicemail

Contact: John Smith
Phone: +18135551234
Duration: 2m 23s
Disposition: Voicemail
Telnyx Call ID: v3:…
Date: September 11, 2026
```

The note ID is stored on the call record; a second "Log Call" returns the existing note instead of creating a duplicate.

### Telnyx authentication (server side)

The browser never sees `TELNYX_API_KEY`. `POST /api/telnyx/token` does, per Telnyx's current docs:

1. `POST https://api.telnyx.com/v2/telephony_credentials` `{ connection_id, name }` → a credential for this connection (created once, ID cached / `TELNYX_CREDENTIAL_ID`).
2. `POST https://api.telnyx.com/v2/telephony_credentials/{id}/token` → a JWT valid for 24 hours.
3. The JWT and `TELNYX_PHONE_NUMBER` (caller ID) are returned to the browser.

### Telnyx browser calling

`web/src/lib/dialer.ts` uses the official `@telnyx/webrtc` SDK:

```ts
const client = new TelnyxRTC({ login_token: jwt });
client.remoteElement = 'remoteAudio';            // <audio> in index.html
client.on('telnyx.ready', …); client.on('telnyx.error', …);
client.on('telnyx.notification', n => { if (n.type === 'callUpdate') … n.call.state … });
client.connect();
const call = client.newCall({ destinationNumber: '+1813…', callerNumber: TELNYX_PHONE_NUMBER });
call.hangup();
```

Call state mapping: `new/trying/requesting/ringing/early` → **Calling**, `active` → **Connected**, `hangup/destroy` → **Call ended** (or **Call failed** if the hangup cause is an error and the call never connected). A `userMediaError` notification or a denied `getUserMedia` → "Microphone access was denied".

The Telnyx call ID stored on the record is `call.telnyxIDs.telnyxCallControlId` (falls back to the SDK call ID).

### Call lifecycle

```
Rep clicks Call
  → POST /api/calls            record created, number normalised (refused if invalid)   status: initiated
  → dialer.dial()              browser asks for mic, Telnyx dials                       status: calling
  → call.state = active        POST /api/calls/:id/status {connected, startedAt}        status: connected
  → hangup                     POST /api/calls/:id/status {completed | no-answer | failed, endedAt}
Rep picks disposition          POST /api/calls/:id/disposition
Rep clicks Log Call            POST /api/calls/:id/log   → note + noteTarget in Twenty → "✓ Call logged to Twenty"
```

If logging fails, the UI says **"Call completed, but the activity could not be logged to Twenty."** The record keeps the contact ID, disposition, duration and the error, and shows a **Retry logging** button. Unlogged calls (including ones interrupted by a page refresh) also appear in the **Unlogged calls** panel on the next load.

---

## Fetch Guard (compliance engine)

Every call is checked **server-side** in `POST /api/calls` before anything is dialed. A call is allowed only if every rule permits it. Refused calls are not silently dropped: they are stored with `status: "blocked"`, the rep, and the reason codes — that record is the audit trail.

| Rule | Reason code | Source of truth |
|---|---|---|
| Internal Do Not Call list | `DNC_INTERNAL` | Fetch settings (`guard.rules.dncList`); written to by the **Do Not Call** disposition |
| CRM Do Not Call flag | `DNC_CRM` | Twenty `Person.doNotCall` (custom boolean) |
| Per-rep Company Type permissions | `COMPANY_TYPE` | Fetch settings (`repPermissions[repEmail].companyTypes`) checked against Twenty `Company.companyType` |
| Calling hours | `CALLING_HOURS` | contact's local time from the US area code (8:00–21:00 default, the federal TSR window) |

The contact list is pre-checked for the rep entered in the header, so restricted contacts show a badge (**DNC**, **Not permitted**, **Outside hours**) and a disabled Call button *before* anyone clicks — silent when everything is allowed, immediate and clear when something isn't. The server re-checks anyway; the browser's copy of a contact is never trusted.

**Twenty fields to add** (Settings → Data model): a boolean `doNotCall` on **People** and a text/select `companyType` on **Companies**. If they don't exist, `DNC_CRM` never fires and Company Type permissions treat every company as untyped.

**Rep identity:** the prototype has no login, so the rep types their email once in the header (kept in the browser). V1 replaces this with real auth; the email is already the key used for permissions and audit.

### Guard API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/guard/rules` | current rules |
| PUT | `/api/guard/rules` | partial update, e.g. `{"repPermissions":{"rep@co.com":{"companyTypes":["Property Management"]}}}` or `{"callingHours":{"startHour":9,"endHour":20,"enabled":true}}` |
| POST | `/api/guard/dnc` | `{ "phoneNumber": "(813) 555-0100" }` → adds to the internal list |
| POST | `/api/guard/check` | ad-hoc check `{ repEmail, phoneNumber, doNotCall?, companyType? }` → `{ allowed, reasons, detail, timezone }` — the seam a Watchdog bridge would use |

`POST /api/calls` returns **403 `BLOCKED`** with `reasons`, `detail`, and the stored `call` when refused. `GET /api/calls?rep=` and the audit list include blocked attempts; the unlogged-calls panel excludes them.

There is no auth on the rules endpoints in the prototype (single trusted operator on localhost). Do not expose them publicly before V1 auth.

See `docs/watchdog-vs-fetch-guard.md` for how this maps to Watchdog.

---

## API

All responses are JSON. Errors: `{ "error": "<human message>", "code": "<CODE>" }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{ ok, mode: 'live'|'mock', twenty, telnyx, store, callerNumber, problems[] }` |
| GET | `/api/contacts` | `{ contacts: Contact[], source }` — up to 50 people from Twenty |
| GET | `/api/contacts/:id` | one contact |
| POST | `/api/telnyx/token` | `{ token, callerNumber, expiresInSeconds }` (mock mode: `{ mock: true }`) |
| POST | `/api/calls` | body `{ twentyContactId, contactName, phoneNumber, sessionId?, repEmail? }` → `{ call, guard }` (201). 400 `NO_PHONE` / `INVALID_PHONE`; **403 `BLOCKED`** with `reasons` + stored audit record |
| GET | `/api/calls?unlogged=true` | recent calls; `unlogged=true` filters to ended-but-unlogged |
| GET | `/api/calls/:id` | one call |
| POST | `/api/calls/:id/status` | body `{ status, telnyxCallId?, startedAt?, endedAt? }`; computes `durationSeconds` |
| POST | `/api/calls/:id/disposition` | body `{ disposition }`; 409 `ALREADY_LOGGED` after logging; `do_not_call` also adds the number to the internal DNC list |
| POST | `/api/calls/:id/log` | writes the note; idempotent (`alreadyLogged: true`); 409 `CALL_ACTIVE` while in progress; 400 `NO_DISPOSITION`; 502 `TWENTY_LOG_FAILED` (retryable) |

Call record:

```json
{
  "id": "…", "twentyContactId": "…", "contactName": "John Smith", "phoneNumber": "+18135551234",
  "telnyxCallId": "v3:…", "status": "completed", "disposition": "voicemail",
  "startedAt": "…", "endedAt": "…", "durationSeconds": 143,
  "twentyNoteId": "…", "loggedAt": "…", "lastLogError": null, "sessionId": "…",
  "repEmail": "rep@company.com", "blockedReasons": null
}
```

Statuses: `initiated → calling → connected → completed` | `no-answer` | `failed` | `blocked` (refused by Guard, audit only).
Dispositions: `connected, no_answer, voicemail, busy, wrong_number, do_not_call, other`.

## Storage

- Default: `server/data/calls.json` and `server/data/settings.json` (Guard rules), created automatically. Enough for the prototype.
- PostgreSQL: set `DATABASE_URL`, run `npm run db:migrate -w server`. Schema is `server/db/schema.sql`; the store implementation is `server/src/store/postgresStore.ts`.

## Deployment

The server serves the built frontend, so one process is enough.

**Docker (any host: Railway, Render, Fly.io, a VPS):**

```bash
docker build -t fetch .
docker run -p 4000:4000 --env-file .env fetch
```

**Without Docker:**

```bash
npm ci && npm run build && npm start      # serves API + web on $PORT
```

Requirements in production:
- **HTTPS is mandatory** — browsers only allow microphone access and WebRTC on secure origins.
- Set `CORS_ORIGINS` to your site's origin (only needed if the frontend is hosted separately).
- Put all variables from `.env.example` in the host's environment settings; never commit `.env`.
- `MOCK_MODE=false`.

## Test plan

Success criteria (all must pass):

1. `npm run dev` starts; `/api/health` shows `mode: live`, `twenty: configured`, `telnyx: configured`, `problems: []`
2. Contacts list shows real Twenty people with company and phone
3. Select a contact → name, company, formatted phone, email shown
4. Click **Call** → browser asks for microphone permission
5. Status shows **Calling…**; the destination phone rings from `TELNYX_PHONE_NUMBER`
6. Answer → status **Connected**, timer runs, audio both ways
7. **Hang up** → status **Call ended**, duration shown
8. Disposition buttons appear; pick one
9. **Log Call** → **✓ Call logged to Twenty**
10. Open the contact in Twenty → the note "Outbound call via Fetch — …" is on their timeline with the right duration and disposition
11. `GET /api/calls` shows the record with `twentyContactId`, `telnyxCallId`, `durationSeconds`, `twentyNoteId`

Error cases:

| Case | How to test | Expected |
|---|---|---|
| No phone number | select a contact without a phone | Call button disabled; message under the number |
| Invalid phone | put `12345` in a contact's phone | "can't be normalised" message; `POST /api/calls` returns 400 `INVALID_PHONE`, no call placed |
| Mic denied | block the microphone in the browser, click Call | "Microphone access was denied…", status **Call failed** |
| Telnyx auth failure | wrong `TELNYX_API_KEY` | `/api/telnyx/token` → 401 `TELNYX_AUTH`, shown in the call panel |
| Telnyx call failure | dial an unallocated number | **Call failed** with the Telnyx cause |
| Twenty auth failure | wrong `TWENTY_API_KEY` | red banner "Twenty rejected the API key" |
| Twenty unavailable | wrong `TWENTY_API_URL` | banner "Could not reach Twenty at …" |
| Logging failure | revoke the Twenty key after the call, then Log | "Call completed, but the activity could not be logged…", **Retry logging** works after restoring the key |
| Refresh during a call | reload the tab mid-call | on reload, the call appears under **Unlogged calls**; log it from there |
| Duplicate logging | call `POST /api/calls/:id/log` twice | second response `alreadyLogged: true`, one note in Twenty |
| Guard: CRM DNC | set `doNotCall` on a person in Twenty | badge **DNC**, Call disabled, `POST /api/calls` → 403 `DNC_CRM`, blocked record stored |
| Guard: permissions | `PUT /api/guard/rules` restricting your email to one Company Type | other types badge **Not permitted** and are refused |
| Guard: hours | set `callingHours` to a window that excludes now | badge **Outside hours**; check reports the contact's local hour and zone |
| Guard: write-back | log a call with disposition **Do Not Call** | number appears in `dncList`; next attempt refused `DNC_INTERNAL` |

Automated coverage run during development (mock mode and a fake Twenty server): every endpoint above, the outage → retry → single-note path, the duplicate guard, and both phone-number rejections.

## Prototype limitations

Intentionally **not** implemented:

- Login / users / roles — single anonymous rep; `/api/telnyx/token` has no auth. Do not expose this deployment publicly without adding authentication first.
- Multi-subsidiary data separation.
- Power dialing, parallel dialing, sequences, queues.
- Call recording. `ENABLE_CALL_RECORDING` is reserved and does nothing (recording needs consent handling and Telnyx connection-level configuration).
- Voicemail / answering-machine detection.
- Inbound calls.
- Guard is rules-only: no National DNC Registry scrub (needs an FTC subscription + scrub API), no consent capture, no recording-consent prompts, no abandonment pacing — those are V1 (see the blueprint).
- Guard rules have no admin UI; use the API.
- Analytics, dashboards, AI summaries, coaching.
- Contact search/pagination beyond the first 50 people.
- JWT refresh: the Telnyx token lasts 24 h; reload the page after that.
- Twenty webhooks (contacts are pulled on load / Refresh, not pushed).
- A native Twenty "Call" object — notes are used instead (see above). A custom `Call` object in Twenty is the planned V1 upgrade.

## Credentials and configuration you must supply

| Variable | Where it comes from |
|---|---|
| `TWENTY_API_URL` | `https://api.twenty.com` for cloud, or your self-hosted URL |
| `TWENTY_API_KEY` | Twenty → Settings → API & Webhooks → + Create key |
| `TELNYX_API_KEY` | Telnyx Portal → Account → Keys & Credentials → API Keys |
| `TELNYX_CONNECTION_ID` | Telnyx Portal → Voice → SIP Connections → your *Credentials* connection (with an Outbound Voice Profile) |
| `TELNYX_PHONE_NUMBER` | a Telnyx number assigned to that connection, E.164 |
| `TELNYX_CREDENTIAL_ID` | optional; printed by the server on first run, paste it back to reuse |
| `DATABASE_URL` | optional; PostgreSQL connection string. Empty = JSON file store |
| `MOCK_MODE` | `false` for real calls |
| `PORT`, `CORS_ORIGINS` | server port; allowed frontend origin(s) in dev |
"# fetch" 
