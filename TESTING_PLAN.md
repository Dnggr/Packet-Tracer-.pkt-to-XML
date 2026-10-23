# Testing Plan

Nothing here has been executed except where marked **[RUN]** (done in planning against upstream). No test has been written yet and no result may be claimed until it is run.

## 1. Strategy: upstream is the oracle
The port is correct only if it behaves like the pinned upstream binary (`22fee26…`, built by `scripts/build-upstream.sh`). Three layers:
1. **Known-answer tests (KAT)** for Twofish and EAX using published vectors (Twofish submission vectors, EAX paper vectors). Proves the primitives.
2. **Differential tests** — generate inputs by running upstream `-e` on arbitrary XML, then require `port.decrypt(pkt) == original XML` **and** `== upstream -d(pkt)`. Needs no Packet Tracer files, so it covers the crypto/stage logic early. Synthetic round trip already works in upstream at 40 KB–30 MB. [RUN]
3. **Real-file golden tests** — real `.pkt` fixtures; golden XML produced by upstream `-d`; port output must be byte-identical. This is the only layer that proves compatibility with actual Packet Tracer versions (gate G0).

## 2. Fixtures
| Source | Use | Commit to repo? |
|---|---|---|
| Labs you create yourself in Packet Tracer (small: 1 router + 1 switch + 2 PCs; plus one with VLANs/ACL/DHCP; ideally one per installed PT major version) | Real-file golden tests | **Yes** (you own them; strip anything private) |
| Files shared by classmates/instructors | Local only, with written permission | No |
| Sample networks shipped inside a Packet Tracer install | Local-only stress/compat run via env var path | **No** (Cisco copyright) |
| Synthetic XML → upstream `-e` | Differential tests | Generated in CI, not committed |
| Random bytes, truncated, bit-flipped real files, 0-byte, wrong extension | Negative tests | Generated in tests |
`tests/fixtures/README.md` records: origin, PT version, date, license, contains-private-data (yes/no). Never invent a `.pkt` and call it real.

## 3. Test cases
| ID | Case | Expected |
|---|---|---|
| T01 | Valid real `.pkt` ×≥3 | XML byte-identical to upstream golden |
| T02 | Synthetic sizes: 0, 1, 15, 16, 17, 1 KB, 46,340, 46,341, 46,342, 50,000 B, 1 MB, 25 MB | Round trip equals source; boundary sizes pass (int-overflow hazard) |
| T03 | Output structure | Starts with `<`; full parse by a real XML parser in test code only; root element recorded (expect Packet Tracer root; **[UNKNOWN]** until fixtures) |
| T04 | Empty file | `E_EMPTY_FILE` |
| T05 | < 16 bytes | `E_NOT_PKT` |
| T06 | Random bytes (various lengths) | `E_AUTH_FAILED` |
| T07 | Valid file, 1 bit flipped (each region: start, middle, tag) | `E_AUTH_FAILED` |
| T08 | Valid file truncated / extended | `E_AUTH_FAILED` |
| T09 | Wrong extension, valid content | UI `E_BAD_EXTENSION` (content never read) |
| T10 | `.pkt` extension, non-pkt content (e.g. a PNG) | `E_AUTH_FAILED` |
| T11 | Pre-v5 style signature | `E_UNSUPPORTED_FORMAT` (only if fixture/vector available; else documented gap) |
| T12 | Crafted container: valid tag, inflate header claims 4 GB | `E_OUTPUT_TOO_LARGE`, no allocation spike |
| T13 | Crafted: header size ≠ inflated length | `E_INFLATE_FAILED` |
| T14 | Crafted: corrupt zlib stream | `E_INFLATE_FAILED` |
| T15 | Crafted: decrypts to empty / non-XML | `E_EMPTY_OUTPUT` / `E_OUTPUT_NOT_XML` |
| T16 | File over input limit (limit+1, limit) | `E_TOO_LARGE` / accepted |
| T17 | Forced slow conversion (test hook) | `E_TIMEOUT`, worker terminated, UI recovers |
| T18 | Worker constructor failure (stubbed) | `E_WORKER_FAILED` |
| T19 | Double-click Convert; drop a second file mid-conversion | One conversion; second ignored |
| T20 | Download integrity | Downloaded bytes SHA-256 == converter output SHA-256 == golden |
| T21 | Filename sanitization (`../x`, unicode, long, spaces, no extension) | Safe `.xml` name |
| T22 | Convert another without reload; no stale URL/state | Clean `idle` state |
| T23 | No network during conversion | Playwright records zero requests after page load |
| T24 | Error codes coverage | Every code in ARCHITECTURE §4 is raised by ≥1 test |
| T25 | Mobile viewport layout | Controls usable at 360 px width |
| T26 | Upstream regression oracle | Differential suite fails loudly if upstream binary missing in CI |

## 4. Tooling
Vitest (unit + differential, Node), Playwright (browser; Chromium, Firefox, WebKit; one mobile emulation), CI on every push. Real-device checks on Safari/iOS and Android Chrome are manual before release.

## 5. Smoke test (preview and production)
1. Page loads over HTTPS with expected security headers (inspect response headers).
2. Convert fixture A → download → SHA-256 equals golden.
3. Upload a corrupt file → correct error message and code.
4. Console shows no CSP violations; network tab shows no file-bearing requests.
5. Footer NOTICE link works.

## 6. MVP acceptance
Defined in [PROJECT_PLAN.md](PROJECT_PLAN.md) §Acceptance criteria; this file supplies the tests (T01–T26) that demonstrate them.

## 7. Regression policy
Any production bug first becomes a failing test (fixture or synthetic) before it is fixed. Any upstream behavior difference found is either fixed in the port or recorded in DECISIONS with a reason.
