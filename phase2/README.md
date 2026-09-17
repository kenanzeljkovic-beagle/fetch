# Fetch — Phase 2 package

Click-to-call, the floating dialer, Guard, and automatic note logging inside Twenty — built as a
thin extension around the Fetch app you already deployed.

```
extension/            Chrome extension (Manifest V3). Run `npm run build:extension` first, then load unpacked.
  manifest.json
  content.js          record detection, phone tagging, pill / quick-call card / panel, iframe bridge
  dock.css.js         dock styles (injected into a shadow root)
  content.css         "Call with Fetch" tag styles (lives in Twenty's DOM)
  options.html/js     Twenty URL (self-hosted support), Fetch app URL, rep email, theme, microphone grant
  background.js       opens settings on install / toolbar click; relays the dialer to the offscreen document
  offscreen.html      hosts the Telnyx client and the mic (offscreen.js is built from web/src/offscreen/, not committed)
  icons/              placeholder icons — swap for the real Fetch logo any time
web-embed/            goes into web/src/embed/ in the Fetch repo
  EmbedDialer.tsx     the panel + manual-dial UI from the mockups (presentational)
  embed.css
  embedBridge.ts      typed postMessage protocol (iframe side)
server/
  embedHeaders.ts     frame-ancestors middleware so Twenty may frame the app
CLAUDE_CODE_PHASE2_PROMPT.md   paste into Claude Code inside the Fetch repo
```

## Tonight, in order

1. Copy this whole folder into the Fetch repo as `phase2/`.
2. Open Claude Code in the repo and paste `CLAUDE_CODE_PHASE2_PROMPT.md`. Answer its Step 0
   questions, then let it wire the embed mode, contact association, logging, and headers.
3. `npm run build:extension` (bundles the Telnyx SDK into `phase2/extension/offscreen.js`), then
   Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → pick `phase2/extension/`.
   Re-run the build and hit reload on the extension whenever `web/src/offscreen/` or `web/src/lib/dialer.ts` changes.
4. Click the Fetch toolbar icon → settings: your Twenty URL, Fetch app URL
   (`http://localhost:5173` for dev, `https://app.fetchdialer.com` for prod), your email → Save.
   Saving asks Chrome for permission on your Twenty domain and the Fetch app — the first turns the
   extension on in Twenty, the second lets the dialer fetch its Telnyx token. Then **Enable microphone**.
5. Set `EMBED_ALLOWED_ORIGINS=https://<your-twenty-origin>` on the Railway `fetch` service and redeploy.
6. Reload Twenty. Pill bottom-right. Open a person with a phone number and run the test list in the prompt.

## Things to know

- **Contact association:** the extension sends the Twenty record id from the URL
  (`/object/person/<uuid>`). The server re-reads that record by id before dialing and logging.
  A name is never used to decide where a note goes.
- **Microphone / where calls run:** Telnyx runs in the extension's offscreen document, not in the
  iframe, so Twenty's `Permissions-Policy` can't block the mic. Offscreen documents can't show a
  permission prompt, so the rep grants the mic once on the settings page (**Enable microphone**);
  until then a dial fails with an error saying so. Route: iframe `FETCH_DIALER` → content.js →
  background.js → offscreen.js, and call events come back the same way to the tab that dialed.
  One Telnyx connection serves every Twenty tab; a second tab can't dial while a call is live.
  Closing or reloading the tab that owns a call hangs it up.
- **Deploy order:** ship the web app before extension 0.5.0. The new web app still dials in the
  iframe for older extensions (their `FETCH_INIT` has no `dialerHost`), but 0.5.0 drops
  `allow="microphone"` from the iframe, so an old web app can't place calls under it.
- **Storage is partitioned** inside a cross-site iframe (Chrome), so the embed does not share
  localStorage with the standalone app tab. That is why the rep email is sent in via `FETCH_INIT`.
- **Guard calling hours** are still disabled from earlier testing
  (`PUT /api/guard/rules` with `callingHours.enabled=false`). Flip it back to `true` before any rep uses this.
- **Twenty's DOM:** phone fields render as `tel:` links, which is what the extension keys on first;
  plain-text numbers in small cells are tagged as a fallback. The extension only ever *adds a sibling
  element*, it never rewrites React-owned text, so Twenty's rendering is not disturbed.
- Recording is not in this phase on purpose — it needs the consent-disclosure decision first.
