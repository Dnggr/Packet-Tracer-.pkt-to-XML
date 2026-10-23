# Security and Privacy

Applies to the recommended browser-only design. If a server component is ever added, this document must be rewritten before coding it.

## 1. Privacy statement (to be shown on the site)
> Your file is converted **in your browser**. It is not uploaded, stored, or sent to any server by this site. Hosting (Vercel) sees the normal request for the web page itself, not your file.

Why this can be claimed honestly, and only if all hold:
- No code path sends file bytes anywhere. Enforced and testable via CSP `connect-src 'none'` (plus a Playwright check that no request is made during conversion).
- No third-party scripts, fonts, or analytics. If analytics are ever enabled, the notice must say so.
- No logging of file names or content (diagnostics contain codes and sizes only; see ARCHITECTURE §5).
- "No database" is **not** the argument; the argument is that the data never leaves the device.

## 2. What users should know about the XML itself
Packet Tracer files can contain device configurations, which may include usernames, enabled/line passwords (sometimes weakly obfuscated or plaintext), SNMP communities, IP plans, and author/metadata fields. The notice must tell users to **review the XML before pasting it into an AI service or sharing it**, and that the XML may be very large for an AI assistant's input limit (OQ-7). This is the main real-world privacy risk of the workflow.

## 3. Threat model
| Threat | Applies? | Control |
|---|---|---|
| Hostile uploaded file attacking a server | **No server** | n/a |
| Decompression bomb exhausting the visitor's own tab | Yes (self-DoS only) | Cap on declared size, streaming inflate with output cap, worker watchdog, worker terminated on timeout |
| Malformed input crashing the converter | Yes | All stages in try/catch; failures mapped to codes; converter is pure functions on bytes |
| Uploaded content executed | No | Bytes are only parsed as data; output is never rendered as HTML, never `eval`'d, never inserted via `innerHTML` |
| XSS via file name | Yes (displayed in UI) | Set with `textContent`; output filename sanitized to `[A-Za-z0-9._-]` |
| Download MIME confusion | Minor | `Blob` typed `application/xml`, `X-Content-Type-Options: nosniff` |
| Supply chain (npm) | Yes | Zero runtime dependencies planned; lockfile committed; dev deps only; `npm ci` in CI |
| Secrets leakage | No secrets exist | No env vars, nothing in repo to protect; `.gitignore` for `.env*` anyway |
| Path traversal / process args / temp files | **Not applicable** (no filesystem, no processes) | Listed because the brief asks; no controls needed |
| Rate limiting / abuse | Not applicable to compute (client-side). Static bandwidth abuse is handled by Vercel's platform | None added |

## 4. Resource limits (provisional; tune after benchmark spike S5)
| Limit | Value | Where |
|---|---|---|
| Max input file | 25 MB | `validate.ts` |
| Max declared/actual inflated XML | 150 MB | `validate.ts` |
| Worker watchdog | 60 s | `main.ts` |
| Input accepted | one file at a time | `main.ts` |
Real Packet Tracer files are expected to be KB–few MB. [ASSUME] Upstream handled a 17 MB pkt in 2.3 s natively. [RUN]

## 5. Headers (set in `vercel.json`, verify in preview)
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` with unused features disabled.
- If the CSP blocks the Vite worker or blob downloads, adjust narrowly (e.g. `worker-src 'self' blob:`), never by adding `connect-src` or `unsafe-eval`.

## 6. Legal and licensing (not legal advice)
- **Upstream BSD-2-Clause** requires keeping its copyright notice, conditions and disclaimer in redistributed source and in documentation/materials accompanying binary redistribution. Because a compiled JS bundle is served to browsers, ship the upstream text in `NOTICE.md` and link it from the page footer. The TypeScript port is a derivative of upstream's algorithm and constants and should carry the notice in its source headers.
- **The key and IV constants** are Cisco's, reverse engineered by upstream. Cisco's Packet Tracer license/EULA terms on file formats and reverse engineering have **not been reviewed** (OQ-3). A public decryptor for a vendor's proprietary format carries some takedown/terms risk; keep the framing as personal-files interoperability, include a "not affiliated with Cisco" notice, and be ready to unpublish.
- **Academic integrity:** instructor-made `.pka` activity files can embed answer keys. [3P] The MVP rejects `.pka` (D-005), and the site should state it is for the user's own work and their institution's rules.
- **Fixtures:** sample networks shipped with Packet Tracer are Cisco's property; do not commit them (TESTING_PLAN §Fixtures).

## 7. Minimum protections summary
Client-side only, CSP lockdown, size/time/inflate caps, safe DOM APIs, zero runtime deps, honest privacy text, license notice. Nothing more is justified for a public educational tool with no server.
