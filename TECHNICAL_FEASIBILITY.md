# Technical Feasibility

Evidence labels used throughout: **[SRC]** read in upstream source · **[RUN]** executed in the planning sandbox · **[VDOC]** from Vercel's official docs (seen as search excerpts, not read page-by-page) · **[3P]** third-party claim, unverified · **[ASSUME]** reasonable assumption · **[UNKNOWN]** needs a test.

## 1. How this was investigated
- `github.com` web pages are blocked for automated fetching, so the repository was **cloned with git** (commit `22fee2681779a6dd764d6562b0a134ceb339e770`, dated 2021-03-31) and read directly: `main.cpp`, `include/pka2xml.hpp`, `Makefile`, `Dockerfile`, `LICENSE`, `readme.md`, `lambda/`, `docs/`.
- The issue list was seen only through search excerpts. The author's blog post on the reverse engineering was **not** read.
- The uploaded `pkt.xml` is the planning prompt itself (plain text), not a Packet Tracer file. **No real `.pkt` file was available, so nothing below has been verified against a real Packet Tracer file.**

## 2. What upstream is (verified)
| Question | Finding |
|---|---|
| What it does | CLI converting `.pka`/`.pkt` ↔ XML. [SRC] |
| Language / runtime | C++ with CryptoPP, zlib, RE2. [SRC] `Makefile`, `Dockerfile` |
| Structure | `main.cpp` (124 lines, CLI only) + `include/pka2xml.hpp` (header-only logic). Conversion functions are reusable, but there is no library packaging. [SRC] |
| Tests / CI | None in the repo. [SRC] |
| Builds today | Yes: `g++` 13 on Ubuntu 24.04 with `libcrypto++-dev libre2-dev zlib1g-dev`. [RUN] |
| Works | Synthetic XML → `-e` → `-d` round trip is byte-identical at 40 KB, 50 KB, 3 MB, 30 MB (30 MB XML = 17 MB pkt decrypts in ~2.3 s native). [RUN] |
| Real-file support | **[UNKNOWN].** The README only mentions "patches for versions other than 7.3.1" (that concerns its Linux launcher patch, not decryption). A 2024 open issue is titled "Still working?" ([#4](https://github.com/mircodz/pka2xml/issues/4)); issue [#2](https://github.com/mircodz/pka2xml/issues/2) reports re-encrypted files rejected by PT 6.2/7.2/8 ("Not compatible"), which concerns `-e`, not `-d`. [3P excerpts] |
| Maintenance | Last commit 2021-03-31, 41 commits, 3 open issues, no tests. Treat as **unmaintained reference**. [SRC] |
| License | BSD-2-Clause, "Copyright (c) 2020, Mirco De Zorzi". Redistribution (including modified/derived work) must keep the copyright notice, conditions and disclaimer. [SRC] `LICENSE` |
| Error behavior | Poor. Invalid, random, or empty input makes it abort with an uncaught CryptoPP exception (exit 134) and leaves a 0-byte output file; `main.cpp` only catches `int`. Missing file exits 1. [RUN] The source itself says `TODO graceful error checking`. [SRC] |
| Input trust | `uncompress()` allocates a buffer of whatever size the first 4 plaintext bytes claim, with no cap. Unsafe to run on hostile input without external limits. [SRC] |
| Existing web deployment | Upstream's own `docs/main.js` POSTs the user's file (base64) to an **author-run AWS Lambda endpoint** and `lambda/` holds a C++ custom-runtime build. [SRC] That is a third-party server receiving user files; this project will not use it, and its availability is unknown. |

### 2.1 The algorithm (from `include/pka2xml.hpp`) [SRC]
`decrypt_pka` applies four stages to the whole file (L = byte length):
1. **Deobfuscate:** `b[i] = a[L-1-i] XOR low8(L - i*L)` (reverse bytes, positional XOR).
2. **Decrypt:** Twofish-128 in **EAX** mode, key = `0x89`×16, nonce/IV = `0x10`×16, no associated data; the last 16 bytes are the authentication tag (Crypto++ default). Wrong or corrupted input fails authentication.
3. **Deobfuscate:** `b[i] = a[i] XOR low8(L' - i)` where L' is the decrypted length.
4. **Decompress:** Qt `qUncompress` format = 4-byte big-endian "uncompressed size" + zlib stream.

Output is the raw bytes, written unchanged. Upstream's `is_old_pt` detects pre-Packet-Tracer-5 files (XOR + qUncompress only, no Twofish).
A third-party pure-Python port describes the same four stages. [3P] It is a useful cross-check only.

## 3. Options compared
| | **A. Browser-only (Web Worker)** | **B. Vercel Function runs upstream binary** | **C. Separate container service** | **D. Python/Node function with port** |
|---|---|---|---|---|
| Runs | User's browser | Vercel serverless | Fly/Render/Railway/VPS etc. | Vercel serverless |
| Files leave device | **No** | Yes | Yes | Yes |
| Request-size ceiling | None (local) | 4.5 MB body limit [VDOC] | Configurable | 4.5 MB [VDOC] |
| Timeouts | Own watchdog | Plan-dependent; verify [UNKNOWN] | Configurable | Plan-dependent |
| Native deps | None | Must ship a prebuilt static binary; running it on Vercel's Linux is **[UNKNOWN]**; binary provenance in repo | Docker, fine | None |
| Upstream used as-is | No (re-implemented, verified against it) | **Yes** | **Yes** | No |
| Extra infra / cost | **None** | None | Second host, uptime, abuse handling, cost | None |
| Debug surface | Smallest | Binary + wrapper + upload | Two systems | Function + upload |
| Hardening needed | Own size/zip-bomb caps | Wrapper must catch aborts, cap sizes, sandbox temp files | All of B + service auth/rate limits | Caps + upload handling |

### Why not B/D first
- The 4.5 MB body limit [VDOC] caps uploads; base64 transport would make it smaller still. Conversion output also has a 4.5 MB response ceiling [VDOC], and a decrypted XML can be several times the size of the `.pkt` (3 MB XML ↔ 1.7 MB pkt in the synthetic test [RUN]).
- Uploading learners' files to a server is a privacy cost with no functional benefit, since the algorithm is small enough to run locally.
- B needs a committed native binary or a Vercel build environment with CryptoPP/RE2 [UNKNOWN]; neither fits "smallest reliable architecture".

### Why A is feasible
- The whole pipeline is ~4 simple stages; only **Twofish-EAX** is not available in browsers (WebCrypto has no Twofish) and must be supplied as code.
- zlib inflate is available via `DecompressionStream("deflate")` (zlib-wrapped) [ASSUME, verify in spike S3]; upstream's own web page used `pako` in-browser, so a tiny inflate library is a known fallback. [SRC]
- A Web Worker keeps the page responsive and allows a hard timeout by terminating the worker.
- Static hosting on Vercel has none of the function constraints above.

## 4. Recommendation
**Option A, with verification against the original tool as a hard gate.** Fallbacks in order: **C** (containerized upstream, if A cannot be made byte-identical), then B (only if S4 proves the binary runs on Vercel and file sizes stay small).

This is a deliberate departure from "use the original code as-is" and is recorded as decision **D-002 (awaiting your approval)**. It does not silently replace the engine: upstream remains the reference oracle, pinned by commit, built in CI, and every release must match its output byte-for-byte.

### 4.1 Why re-implement instead of compiling upstream to WebAssembly
Possible (Emscripten + CryptoPP + zlib), but it adds a toolchain and a large binary blob to a project whose priorities are compactness and debuggability. Kept as an alternative in DECISIONS (D-002 alternatives) if the TypeScript Twofish-EAX proves unreliable.

### 4.2 Twofish-EAX source in TypeScript [UNKNOWN]
Either (a) a small audited npm package, or (b) ~250 lines written in-repo (Twofish block cipher + OMAC/CMAC + CTR + EAX), validated with published known-answer vectors and the differential suite. No candidate package has been evaluated for license, maintenance or correctness; **do not add one without that check.** Security strength is irrelevant here (the key is a public constant); **bit-exact correctness** is what matters.

### 4.3 Specific porting hazards found in upstream [SRC]
- `length - i * length` is signed `int` arithmetic that overflows when `i*length` exceeds 2³¹ (inputs ≥ 46,341 bytes). Only the low byte is used and two's-complement wrap preserves it, which is why the 50 KB–30 MB round trips pass [RUN]. The port must compute the low byte without relying on JS number precision (e.g. `Math.imul` or mod-256 arithmetic). Tests must straddle this boundary.
- `output.size() - i` mixes `size_t` and `int`; again only the low byte matters.
- The 4-byte size prefix is trusted by upstream. The port must cap it and verify it equals the actual inflated length (upstream does not check).
- Output must stay **raw bytes** (no UTF-8 re-encoding) to remain identical to upstream.

## 5. Vercel compatibility (for the recommended option)
- Static output from a Vite build; no Functions are used, so function limits (4.5 MB body, bundle size, memory, duration) **do not apply**. [VDOC for the limits; ASSUME that a static Vite deployment needs no function config, verify in the first preview deploy.]
- Vercel Hobby is for personal, non-commercial use; whether a free public educational tool qualifies must be checked against current Vercel terms (OQ-4).
- For reference, official limits seen: 4.5 MB request/response body; 250 MB bundle (500 MB Python); Hobby memory 2 GB. [VDOC] Function max-duration figures varied between excerpts (older 10 s vs configurable/extended values), so they are **not relied on**.

## 6. Risks
| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Current Packet Tracer (8.x/9.x) uses a different or additional layer than upstream's 2021 code | Unknown | **Blocking** | Gate G0: decrypt real fixtures with the pinned upstream binary first. If upstream fails, stop and report. [3P] sources claim the same pipeline works for 7.x–9.0. |
| R2 | TS port differs from upstream on edge cases | Medium | High | Differential tests, boundary sizes, KAT vectors |
| R3 | Large files slow or exhaust browser memory | Low–Medium | Medium | Benchmark spike; limits; worker timeout |
| R4 | Legal: hosting a decryptor for Cisco's proprietary format; Cisco's terms and trademark | Unknown | Medium | OQ-3; disclaimer; personal-files framing; ability to take the site down quickly |
| R5 | No legitimate fixtures to test with | Medium | High | User-authored labs (D-007) |
| R6 | XML too large for AI assistants' context | Likely | Usability | Document; consider later feature (OQ-7) |
| R7 | Upstream abandoned, format changes again | Medium | Medium | Pinned reference; fixtures per PT version; error code `E_AUTH_FAILED` message tells users the version may be unsupported |

## 7. Sources
- Upstream repo: https://github.com/mircodz/pka2xml (commit `22fee26…`)
- Vercel limits: https://vercel.com/docs/functions/limitations and https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- Third-party cross-checks (unverified): PyPI `securedypkt` (pipeline description), `rakasyau/pka-solver` (Python port of pka2xml; notes pre-v5 files use XOR+zlib only), `tovuse/packet-tracer-pkt` and `ptlab` (claim 8.2 and 9.0.0.0810 compatibility).
