# Fetch — Phase 2: click-to-call inside Twenty (ASAP)

We are shipping Phase 2 tonight. Be decisive, reuse what exists, and stop to ask me before any
change that could break the working Phase 1 dialer.

## Architecture (already decided — do not redesign)

The Fetch web app becomes embeddable. A Chrome extension (already written, in `phase2/extension/`)
injects a dock into Twenty's pages and loads the Fetch web app in an iframe at `/?embed=1`.
The extension passes the phone number and the Twenty record id in; the app reports call state out.
Nothing about Telnyx calling, Fetch Guard, dispositions, or note logging is reimplemented — the
extension is a thin shell around the app we already have.

```
Twenty page ─ extension content script ─ iframe: <appUrl>/?embed=1 ─ existing Fetch web app
                (dock, tags, quick-call card)         (queue / call / notes / outcome / keypad)
                                                                 │
                                                       existing server + Telnyx + Twenty API
```

Files I am handing you (read them first, in this order):

- `phase2/web-embed/embedBridge.ts` — typed postMessage protocol for the iframe side
- `phase2/web-embed/EmbedDialer.tsx` + `embed.css` — the UI from my mockups, purely presentational
- `phase2/server/embedHeaders.ts` — `frame-ancestors` middleware so Twenty may frame the app
- `phase2/extension/content.js` — read the PROTOCOL comment at the top; that is the contract

## Step 0 — inspect before touching anything

Inspect the repo and tell me, in a short list, what already exists for: Twenty contact lookup
(by id and by search), placing a call (client + `routes/calls.ts`), Telnyx client setup in `web`,
dispositions/outcomes, note creation in Twenty (`twentyNoteId`, note targets), rep identity
(where `repEmail` comes from), and whether helmet or any CSP header is already set.
Then propose the smallest diff that satisfies the steps below. Do not start until I say go.

## Step 1 — embed mode in `web`

- Detect `?embed=1` with `isEmbedded()` from `embedBridge.ts`. In embed mode render **only**
  `EmbedDialer` (no app nav/chrome), full-viewport, background `var(--bg)`.
- Move `EmbedDialer.tsx`, `embed.css`, `embedBridge.ts` into `web/src/embed/`.
- Create `web/src/embed/EmbedApp.tsx` (container) that owns embed state and wires
  `EmbedDialer` to the **existing** hooks/services. Do not fork the calling logic.
- Theme comes from `FETCH_INIT` / `FETCH_THEME`; default light until told.
- On mount: connect the Telnyx client exactly as the standalone app does, then `sendToParent({type:'FETCH_READY'})`.
- Handle inbound messages:
  - `FETCH_INIT` → store `repEmail` (this is the rep for Guard + logging in embed mode), theme.
  - `FETCH_DIAL {phone, contact}` → add to the session queue, set as current contact, run the
    **same** pre-call Guard check the standalone app runs, then place the call automatically.
    If Guard refuses: `callState='blocked'`, show `blockedDetail` (same strings the server returns).
  - `FETCH_OPEN {view}` → switch view.
- Emit outbound messages:
  - `FETCH_STATE {state, seconds, contactName}` on every state change and once per second while
    dialing/ringing/connected (the pill in Twenty shows the timer).
  - `FETCH_MINIMIZE` from the header minimize button.
- Stats in the header (`callsToday`, `connects`, `talkSeconds`) come from an endpoint; add
  `GET /api/stats/today?rep=<email>` computed from the existing calls store if nothing exists.
  Keep it simple.
- Manual dial: `manualDigits` → E.164 (`10 digits → +1…`), Guard check, place call. Invalid or
  empty numbers never reach the server: show `manualError` in the UI.
- Outcomes: reuse the existing disposition list. Selecting an outcome after the call ends logs
  the note (Step 3). Notes textarea is free text included in the note.
- The queue is session-only for Phase 2 (contacts that arrived via `FETCH_DIAL`). No persistence.

## Step 2 — contact association (the hard requirement)

- `FETCH_DIAL.contact.recordId` is the Twenty record id taken from the page URL
  (`/object/person/<uuid>` or `/object/company/<uuid>`). It is the **only** thing logging trusts.
- Extend call creation (`routes/calls.ts`) to accept `twenty: { objectType, recordId }`.
  Server re-reads that record from Twenty **by id** (source of truth), takes the authoritative
  name/phone/company/doNotCall/companyType from it, and runs `checkCall()` on that — same as today.
- If the record id does not resolve in Twenty → 404 with a clear message; do not fall back to
  a name or phone search, and do not place the call.
- Manual-dial calls with no `twenty` block: store the call record only. **No Twenty note.**
  (Reverse lookup by phone is a later feature; a wrong match is worse than no note.)
- `FETCH_DIAL.contact.name` / `company` are display-only until the server responds.

## Step 3 — automatic note logging

After a call ends (or is blocked), log to the exact Twenty record from Step 2 using the existing
note-creation code path (`twentyNoteId` guards against duplicates — keep that). Note body includes:
- outcome label, duration, phone number called (E.164 + formatted), caller ID used
- timestamp (ISO + local), rep email
- the notes text from the panel
- for blocked calls: `Blocked by Fetch Guard: <reasons>`

Company records: if the existing note code only targets people, add the company target in the
same way Twenty's note targets work. If that needs a schema/API decision, stop and ask.

## Step 4 — server headers

- Mount `embedHeaders(process.env.EMBED_ALLOWED_ORIGINS)` before static/web serving.
- If helmet is present, disable its frameguard (see the file header) so there is exactly one
  frame policy. Verify with `curl -I https://app.fetchdialer.com/?embed=1` that
  `Content-Security-Policy: frame-ancestors …` is present and `X-Frame-Options` is absent.
- Add `EMBED_ALLOWED_ORIGINS` to `.env.example` and tell me to set it on Railway.

## Step 5 — end-to-end test (do this, do not skip)

1. Load `phase2/extension/` as an unpacked extension. Open its settings, set Twenty URL,
   Fetch app URL (`http://localhost:5173` for dev), and my email.
2. Open a Twenty person record that has a phone. Expect: "Call with Fetch" tag next to the
   number, and the pill bottom-right.
3. Click the tag → quick-call card shows name + number → Call → panel opens → call connects.
4. Hang up → pick an outcome → the note appears on **that** person in Twenty with all fields.
5. Navigate to a different person without reloading → tag/pill update; card from the previous
   record is gone.
6. Pill → "Dial a number" → keypad → call a number that is not in Twenty → call works → no
   Twenty note, Fetch call record exists.
7. Dial a number on the internal DNC list → blocked state renders in the panel and the pill.
8. Dark mode: switch Twenty to dark → dock and panel follow.

Stop and ask me if you hit: an auth model question (how the embed identifies the rep beyond
`FETCH_INIT`), an existing CSP/helmet config, note targets for companies, or any Telnyx client
change beyond "connect on mount".
