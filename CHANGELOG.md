# Changelog

All notable changes to Fetch are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.2] — 2026-09-12

### Fixed
- **Do Not Call and Company Type not working on real Twenty data** — Twenty's REST API returns custom fields by their internal `name`, not their display `label`. The Person field labeled "doNotCall" is actually keyed `donotcall` (all lowercase) in the API response, and Company's "companyType" is keyed `companytype` — same class of bug as the noteTarget fix in 0.2.1. Fetch was reading the camelCase label names, which don't exist in the response, so both fields silently read as empty/false regardless of what was set in Twenty. Fixed in `server/src/services/twenty.ts`; verified against a mock Twenty server using the real lowercase field names — a DNC-flagged contact is now correctly blocked end to end.
- **Notes sometimes missing from the logged Twenty note** — notes autosave on a 600ms debounce. Clicking "Log Call" quickly after typing could fire the log request before the debounced save reached the server, so the note would log to Twenty with no notes attached even though the rep typed them. `logCall` now flushes any pending notes save first. Verified with a real browser test: typed notes and clicked Log Call with zero delay (well under the debounce window) — the notes made it into the record.
- **Silent notes-save failures** — if `POST /api/calls/:id/notes` ever failed (network issue, server restart mid-type, etc.), the error was swallowed with no feedback, so a note could look like it saved when it hadn't. Now surfaces a clear message under the Notes field ("Notes did not save — check your connection and try again"), the same way call and logging errors already do.

### Changed
- **New logo** — replaced the inline SVG icon + text wordmark with the finished Fetch logo (corgi head + tennis ball + wordmark), added as `web/public/fetch-logo.png` with the background removed. Header now renders this image directly.

### Verified
- Forced a notes-save failure via network interception in a real browser test and confirmed the error now displays instead of failing invisibly.
- Re-ran the full Do Not Call write-back path end to end against the current build (disposition → `addedToDnc: true` → DNC list → second attempt correctly `BLOCKED`/`DNC_INTERNAL`) — confirmed the backend logic itself is not regressed. **If DNC appears not to work after a fresh install**, the internal DNC list resets with each new copy of the project (it lives in `server/data/settings.json`, which is intentionally not shipped in the zip) — check `GET /api/guard/rules` (`rules.dncList`) to confirm whether a number was actually added before assuming a bug. The field-casing bug above is the more likely real-world cause if DNC was set directly on a Twenty contact rather than via the app's own disposition.

## [0.3.1] — 2026-09-12

### Added
- **Dialer sounds** — DTMF tones (ITU-T Q.23 dual-tone frequencies) play when pressing keypad digits, and a US-standard ringback tone (440+480 Hz, 2s on / 4s off) plays while a call is dialing. Both generated with the Web Audio API — no audio asset files needed. The ringback exists because Telnyx doesn't always send early media before a call connects, so without it the rep would hear silence during "Calling…".

### Verified
- Full press-through-hangup lifecycle run in a real browser with console/page error listeners attached: zero errors from the DTMF tone on keypress, ringback starting on "calling", stopping automatically on connect, and stopping again on hangup.

## [0.3.0] — 2026-09-12

### Added
- **Manual dialing** — a "Dial a number" panel with a full keypad (digits, letter overlays, backspace) alongside the contact list. Lets a rep call any number, not just existing Twenty contacts.
- Fetch Guard still runs on manual dials: internal DNC and calling-hours checks apply (there's no CRM record, so Company Type permissions don't apply). Verified a DNC-listed number is blocked whether dialed from a contact or typed by hand.
- Logging a manual-dial call skips the Twenty write (there's nothing to attach it to) and instead closes the call out locally, clearing it from Unlogged Calls. The UI shows a distinct amber "No Twenty contact linked — saved locally only" confirmation instead of the green "Logged to Twenty" one, so it's never mistaken for a CRM write.

### Changed
- `twentyContactId` is now nullable throughout the stack (store, Postgres schema, API, frontend types) to support calls with no linked CRM contact.
- `startCall` generalized to accept either a picked Twenty contact or a manually typed number through the same Guard → Telnyx → disposition → log pipeline.

## [0.2.1] — 2026-09-12

### Fixed
- **Twenty note logging** — `noteTargets` was being sent `{ noteId, personId }`, which every real Twenty workspace rejects (`Object noteTarget doesn't have any "personId" field`). Confirmed via Twenty's own metadata API (`GET /rest/metadata/objects?filter=nameSingular[eq]:noteTarget&depth=2`) that the real field is `targetPersonId` — a polymorphic relation shared with `targetCompanyId` and `targetOpportunityId`. Fixed in `server/src/services/twenty.ts` and verified against a mock Twenty server that rejects the old field name and requires the new one.

## [0.2.0] — 2026-09-12

### Added
- **Call notes** — free-text notes field, visible during and after a call. Saves as you type (debounced) via `POST /api/calls/:id/notes`, locks once the call is logged, and is appended to the Twenty note under a `**Notes**` heading alongside the outcome.
- Visual polish pass across the whole UI: avatars with initials, a status dot on call state, elevated panel styling (subtle border + shadow instead of flat borders), consistent 4px-grid spacing, unified focus/hover/active/disabled states on every control, and the Corgi mark in the header.
- Standalone dialer concept component (`FetchDialer.jsx`) exploring a compact, HubSpot-widget-style layout — kept as a design reference, not yet the shipped UI.

### Changed
- `ContactCard`, `ContactList`, `CallPanel`, and the app shell restyled for a consistent, production-feeling look. No changes to functionality, data flow, or the API surface (aside from the new notes endpoint).
- Call record now carries a `notes` field end to end (store, API, Postgres schema, Twenty note body).

### Verified
- Full lifecycle (idle → contact selected → calling → connected → post-call with notes → logged) driven through a real headless browser against the actual server in mock mode; confirmed via the API that notes persist through disposition and reach the record written to Twenty.

## [0.1.0] — 2026-09-11

### Added
- Initial working prototype: browser dialer (Telnyx WebRTC) wired to Twenty CRM.
- Contact list pulled from Twenty; call placed from the browser; disposition picker; call logged back to the exact Twenty contact as a Note (`notes` + `noteTargets`).
- **Fetch Guard** compliance engine: internal DNC list, Twenty `Person.doNotCall` flag, per-rep Company Type permissions, calling-hours enforcement by contact timezone. Blocked calls are refused server-side and stored as an audit record.
- Mock mode (`MOCK_MODE=true`) with isolated fixture contacts and a simulated dialer, for UI testing without credentials.
- JSON-file storage by default; PostgreSQL store + schema available via `DATABASE_URL`.
- Docker packaging (single container serves both API and built frontend).
- `docs/watchdog-vs-fetch-guard.md` — mapping between Fetch Guard and the existing Watchdog Chrome extension, and a convergence plan (shared Firestore rulebook, two enforcement points).
