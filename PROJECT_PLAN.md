# Project Plan

## Goal
`.pkt` file in → XML file out, in the browser, with the smallest reliable codebase. Used for personal networking study and shared with other learners so they can analyze Packet Tracer work with AI.

## Core workflow
Select file → validate → Convert → status → Download XML → "Convert another" (no page reload).

## Non-goals (initial release)
- Accounts, authentication, database, cloud storage, payments, analytics.
- Calling any AI API from the site (the user does that themselves).
- XML → `.pkt` re-encryption, the upstream `-f`, `-nets`, `-logs`, `--forge`, or Packet Tracer patching features.
- `.pka` activity files (see D-005), `.pkz`/`.pksz`, pre-v5 legacy `.pkt` (see D-006).
- Summarizing, slimming, or analyzing the XML (possible later; see OQ-7).
- A server-side conversion service (only if the fallback in D-002 is triggered).

## MVP requirements
Priority order: correctness → simplicity → debuggability → compactness → UI polish.

| # | Requirement | Owner doc |
|---|---|---|
| M1 | Real `.pkt` files convert to XML identical to the upstream tool's output | [TESTING_PLAN.md](TESTING_PLAN.md) |
| M2 | Validation by content, not extension alone (EAX authentication tag decides validity) | [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) |
| M3 | Each failure yields a short user message plus a stable error code and stage | [ARCHITECTURE.md](ARCHITECTURE.md) |
| M4 | UI: title, explanation, drag-and-drop + picker, filename/size, Convert, status, Download, Convert-another, privacy notice; responsive | [FILE_STRUCTURE.md](FILE_STRUCTURE.md) |
| M5 | Files never leave the user's device; enforced by CSP `connect-src 'none'` | [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) |
| M6 | Size/time/memory limits with clear messages | [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) |
| M7 | Deployed from GitHub to Vercel with no environment variables | [DEPLOYMENT.md](DEPLOYMENT.md) |
| M8 | Upstream license notice shipped with the site | [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) |

## Acceptance criteria for first usable release
All must be true and demonstrated, not assumed:
1. At least 3 real, legitimately obtained `.pkt` fixtures (ideally from different Packet Tracer major versions) convert in the deployed Vercel site, and the downloaded XML is byte-identical to the XML from the pinned upstream binary.
2. Differential suite (port vs upstream binary) passes on synthetic inputs spanning sizes 0 B – 25 MB, including sizes either side of 46,341 bytes (see TECHNICAL_FEASIBILITY §4.3).
3. Every error code in ARCHITECTURE §Error model is triggered by at least one automated test.
4. Corrupt, empty, random, wrong-extension, and oversize files never hang the tab and always show an error with a code.
5. Double-clicking Convert produces one conversion.
6. Browser test passes on current Chrome, Firefox, and Safari (desktop) and one mobile browser.
7. Production smoke test passes (TESTING_PLAN §Smoke).
8. Network panel shows **zero** requests carrying file data during a conversion.
9. README documents setup; `NOTICE.md` carries the upstream BSD-2-Clause text.

## Blocking items before coding
Listed in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) §Gate G0.
