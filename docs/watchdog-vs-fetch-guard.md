# Watchdog vs. Fetch Guard

Fetch Guard was built first **without** any Watchdog dependency, using Twenty as the only data source. This document maps where the two agree, where they differ, and how they converge — without rebuilding either.

## What each one is

| | Watchdog (existing, production) | Fetch Guard (new, prototype) |
|---|---|---|
| Form | Chrome extension + Firebase admin dashboard | Module inside the Fetch server |
| Where it runs | In the rep's browser, on HubSpot pages | On the server, inside `POST /api/calls` |
| What it protects | HubSpot's native dialer — a dial path Fetch doesn't own | Fetch's own dial path (Telnyx) |
| Enforcement | **Warns** — pops up before the click; the rep can still act (HubSpot places the call) | **Refuses** — the call is never created; the attempt is stored |
| Rules store | Firestore, edited in the admin dashboard | Fetch settings store (`settings.json` / Postgres `settings`), edited via API |
| CRM | HubSpot | Twenty |

## Rule-by-rule mapping

| Rule | Watchdog | Fetch Guard | Same? |
|---|---|---|---|
| Internal DNC list | Firestore list; bulk import parser | `guard.rules.dncList`; `POST /api/guard/dnc`; written by the *Do Not Call* disposition | same rule, different store; Guard adds write-back |
| CRM DNC flag | reads HubSpot contact properties | reads Twenty `Person.doNotCall` | same rule, different source |
| Company Type permissions | reads Company Type on HubSpot company pages; per-rep multi-select (All / several / one) in the dashboard | `repPermissions[repEmail].companyTypes: 'ALL' | [...]` checked against Twenty `Company.companyType`; unlisted reps get `defaultCompanyTypes` | same model, same layering ("allowed only if every restriction permits") |
| Calling hours | not in Watchdog | timezone from area code, 8–21 local by default | **Guard only** |
| Layering | all checks must pass | all checks must pass | same |
| Popup principle | silent when allowed, immediate and clear when restricted | badges + disabled Call button + red panel, same wording style | same |

## Behavioural differences that matter

1. **Warn vs. refuse.** Watchdog can only interrupt; HubSpot still owns the dial. Guard sits in the dial path, so a blocked call is physically impossible. This is the single biggest upgrade.
2. **Audit trail.** Watchdog has no record of what it stopped. Guard stores every refused attempt (`status: blocked`, `repEmail`, `blockedReasons`, timestamp). That is evidence for a compliance review; Watchdog's popup is not.
3. **Learning from calls.** Watchdog never hears the outcome of a call. Guard's *Do Not Call* disposition writes straight to the DNC list, so the number is blocked on the next attempt — in Fetch immediately, and in HubSpot too once the stores are joined (below).
4. **Identity.** Watchdog identifies reps through the extension/dashboard. Guard uses the rep's email typed in the header (prototype) → real auth in V1. Email is the join key between the two systems.
5. **Trust model.** Watchdog runs with the user's browser privileges and reads Firestore client-side under Firestore rules. Guard would read Firestore server-side with admin credentials — a different trust boundary that needs its own rules audit before the bridge is built.
6. **Keepalive.** Watchdog needs a keepalive because a background service worker can be suspended. Guard has no equivalent problem; the server is always on.
7. **Pre-check.** Watchdog evaluates on the page the rep is viewing. Guard pre-checks the whole contact list per rep, so restrictions are visible in the list, not just on the open record.
8. **Company Type source.** Watchdog scrapes it from the HubSpot company page DOM (a selector that breaks when HubSpot changes markup). Guard reads a typed field from Twenty's API — no selector fragility.

## Convergence: one rulebook, two enforcement points

The goal is not to port Watchdog into Fetch or to retire it. It is:

```
              Watchdog rules (Firestore + admin dashboard)   ← keep as the single source of truth
                                  │
                        thin Guard API  (check(rep, number, companyType) → allowed, reasons)
                        ┌─────────┴──────────┐
        Watchdog extension                 Fetch server
        (warns inside HubSpot)             (refuses inside Fetch)
                                              │
                          "Do Not Call" disposition → internal DNC in Firestore → effective in HubSpot too
```

Fetch Guard already exposes `POST /api/guard/check` with stable reason codes (`DNC_INTERNAL`, `DNC_CRM`, `COMPANY_TYPE`, `CALLING_HOURS`). The bridge is a `GuardRulesProvider` swap inside `server/src/services/guard.ts`:

| Today (`getRules()`) | Bridged |
|---|---|
| reads `settings.json` / Postgres | reads Firestore: `dnc` collection → `dncList`; `reps/{email}.companyTypes` → `repPermissions` |
| `addToDnc()` writes locally | writes to the Firestore `dnc` collection (so Watchdog sees it) |

Everything else in Guard — the check, the reason codes, the blocked audit record, the UI — stays exactly as it is. The extension keeps reading Firestore as it does today; nothing on the HubSpot side changes.

## Order of work (respecting the "don't rebuild working systems" rule)

1. **Audit** Watchdog's Firestore rules and the exact document shapes for the DNC list and per-rep permissions.
2. **Add a read-only Firestore provider** to Guard behind an env flag (`GUARD_RULES_SOURCE=firestore`), with the local provider as the fallback. Verify both produce identical `check()` results for the same inputs.
3. **Turn on write-back** (`addToDnc` → Firestore) only after step 2 has run for a week with no divergence.
4. **Leave the extension alone** until Guard has been the source of truth for a month; then, optionally, point the extension at `/api/guard/check` so the DOM-scraping selectors can be retired.
5. **Calling hours** stays Guard-only until it has been tested with real reps; it is the one rule Watchdog never had, and an over-aggressive window would block legitimate calls.

## What this means for the product

Watchdog becomes **Fetch Guard's HubSpot mode**: enforcement inside a CRM whose dialer Fetch doesn't own. Fetch Guard is the server-side mode where it does. Same rules, same reason codes, same admin — and the audit trail, the write-back loop, and calling-hours enforcement are things Watchdog alone could never provide.
