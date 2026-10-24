# Implementation Checklist (base files, no UI)

Each task is small enough to finish in **one Claude prompt**. Tick the box when the file is in the repo and passes.

**How to use:** start a new chat, attach `pkt.xml` (the plan docs), paste the *Shared context* below, then paste the task prompt. When a prompt ends with `[paste ...]`, paste the current version of those files.

**Out of scope here:** `index.html`, `src/main.ts`, `src/style.css`, Playwright e2e tests (T09, T17-T19, T21-T23, T25).

## Shared context (paste first in every chat)

```
I am building pkt2xml-web: a browser-only TypeScript tool converting Cisco Packet Tracer .pkt to XML, per the attached plan docs (ARCHITECTURE, FILE_STRUCTURE, TECHNICAL_FEASIBILITY, TESTING_PLAN, SECURITY_AND_PRIVACY). Strict TypeScript, zero runtime dependencies, converter code = pure functions on Uint8Array, no DOM. Follow the module boundaries and error codes in ARCHITECTURE sections 2 and 4. Output only the requested file(s), complete and ready to save, with a one-line note on how to verify.
```

---

## 0. Project setup

- [x] **01. Project config** — `package.json`, `tsconfig.json`, `vite.config.ts`
  > Create package.json (scripts: dev, build, test, typecheck; dev deps only: vite, typescript, vitest), a strict tsconfig.json, and a vite.config.ts that emits the worker as a same-origin file. No runtime dependencies.

- [x] **02. Repo hygiene** — `LICENSE`, `.gitignore`
  > Create .gitignore (node_modules, dist, .env*, local fixtures, upstream build output) and an MIT LICENSE for this project with a placeholder author name.

- [x] **03. Upstream notice** — `NOTICE.md`
  > Write NOTICE.md with the BSD-2-Clause text for mircodz/pka2xml (Copyright (c) 2020, Mirco De Zorzi) as required by SECURITY_AND_PRIVACY section 6, plus a short not-affiliated-with-Cisco trademark disclaimer. Also give me the short header comment to paste at the top of each converter source file.

- [x] **04. Docs folder** — `docs/`
  > Give me the shell commands to create docs/ and move the plan documents into it, and fix any relative links that would break in README.md.

## 1. Converter foundations

- [x] **05. errors.ts** — `src/converter/errors.ts`
  > Write src/converter/errors.ts: the Stage union, all error codes from ARCHITECTURE section 4, a code-to-userMessage map using the exact short messages, and class ConversionError {code, stage, userMessage, detail?}. Imports nothing. Add a helper to wrap unknown errors into E_UNEXPECTED.

- [x] **06. validate.ts** — `src/converter/validate.ts`
  > Write src/converter/validate.ts: all numeric limits as named constants (25 MB input, 150 MB output, 16-byte minimum, etc. from SECURITY_AND_PRIVACY section 4), validateInput(bytes) and validateOutput(bytes) throwing ConversionError with the correct codes. validateOutput allows an optional UTF-8 BOM before the leading '<'.

- [x] **07. Deobfuscate stage 1** — `src/converter/stages.ts` (part 1)
  > In src/converter/stages.ts write deobfuscate1(a: Uint8Array): Uint8Array implementing b[i] = a[L-1-i] XOR low8(L - i*L). Compute the low byte with Math.imul or mod-256 arithmetic so it matches upstream C++ int overflow (see TECHNICAL_FEASIBILITY 4.3). Return a new array; do not mutate the input.

- [x] **08. Deobfuscate stage 3** — `src/converter/stages.ts` (part 2)
  > Add deobfuscate3(a: Uint8Array): Uint8Array to src/converter/stages.ts implementing b[i] = a[i] XOR low8(L - i), L = a.length. Keep it a pure function, same file style as deobfuscate1. `[paste stages.ts]`

- [x] **09. qUncompress** — `src/converter/stages.ts` (part 3)
  > Add async qUncompress(data: Uint8Array, maxOutput: number) to stages.ts: read 4-byte big-endian size header, reject if above maxOutput (E_OUTPUT_TOO_LARGE), inflate the zlib stream with DecompressionStream('deflate') using a streaming reader that aborts once output exceeds the cap, and require inflated length to equal the header (E_INFLATE_FAILED). Never allocate the header size up front. `[paste stages.ts]`

## 2. Twofish-EAX (crypto core)

- [x] **10. Twofish-128 block cipher** — `src/converter/twofish-eax.ts` (part 1)
  > Implement the Twofish block cipher, 128-bit key, encrypt-only block function (EAX needs only encryption), in TypeScript in src/converter/twofish-eax.ts. Precompute key schedule, q-permutations, MDS and h-function. Export createTwofish(key: Uint8Array) => { encryptBlock(block16: Uint8Array): Uint8Array }. Keep it readable with comments mapping to the Twofish spec.

- [x] **11. Twofish known-answer test** — `tests/unit/twofish-eax.test.ts` (part 1)
  > Write Vitest tests for createTwofish using the official Twofish 128-bit known-answer vectors (the zero-key/zero-plaintext vector and the iterated ones you are certain of). State clearly which vectors you used and from where; do not invent values. `[paste twofish-eax.ts]`

- [x] **12. OMAC / CMAC** — `src/converter/twofish-eax.ts` (part 2)
  > Add OMAC1 (CMAC) over the Twofish block function to twofish-eax.ts: subkey derivation with GF(2^128) doubling, tweak-prefixed OMAC^t(data) as EAX defines it. Pure functions over Uint8Array. `[paste twofish-eax.ts]`

- [x] **13. CTR + EAX decrypt** — `src/converter/twofish-eax.ts` (part 3)
  > Add eaxDecrypt(key, nonce, ciphertextWithTag): Uint8Array: 16-byte tag at the end, compute N=OMAC^0(nonce), H=OMAC^1(empty), C=OMAC^2(ciphertext), compare tag in constant time BEFORE returning plaintext, then CTR-decrypt. On mismatch throw ConversionError E_AUTH_FAILED stage decrypt. The module must not contain the Packet Tracer key. `[paste twofish-eax.ts + errors.ts]`

- [x] **14. EAX known-answer test** — `tests/unit/twofish-eax.test.ts` (part 2)
  > Add Vitest tests for eaxDecrypt. Because the EAX paper vectors use AES, build an encrypt helper in the test file using the same primitives and test round trips at lengths 0, 1, 15, 16, 17, 100 and 1000, plus bit flips in ciphertext, tag and nonce all giving E_AUTH_FAILED. Note any limitation honestly. `[paste twofish-eax.ts]`

## 3. Pipeline

- [x] **15. convert.ts** — `src/converter/convert.ts`
  > Write src/converter/convert.ts: async convert(bytes, opts?) running validateInput, deobfuscate1, eaxDecrypt (key 0x89 x16, nonce 0x10 x16, no associated data, passed in as constants here), deobfuscate3, qUncompress, validateOutput. Record per-stage timing and in/out byte counts, attribute any thrown error to its stage, and return {xml: Uint8Array, timings}. Output stays raw bytes. `[paste errors, validate, stages, twofish-eax]`

- [x] **16. worker.ts** — `src/worker.ts`
  > Write src/worker.ts: receive an ArrayBuffer message, run convert, post back the XML bytes (transferred) or a serialized ConversionError. Wrap everything so no raw exception escapes (E_UNEXPECTED, and E_OUT_OF_MEMORY on allocation failures). No DOM access.

- [x] **17. diagnostics.ts** — `src/diagnostics.ts`
  > Write src/diagnostics.ts: random short conversion ID, structured console logging per stage and on failure, and buildDiagnosticsJson() with app version, upstream commit 22fee2681779a6dd764d6562b0a134ceb339e770, ID, code, stage, sizes, user agent. It must never log file names or contents.

## 4. Tests (non-UI)

- [ ] **18. validate + errors tests** — `tests/unit/validate.test.ts`
  > Write Vitest tests for validate.ts: empty, 1 to 15 bytes, limit and limit+1, output empty, output without '<', BOM then '<'. Assert exact error codes and stages. Also a test that every code in errors.ts has a non-empty user message. `[paste errors.ts, validate.ts]`

- [ ] **19. stages tests** — `tests/unit/stages.test.ts`
  > Write Vitest tests for stages.ts: deobfuscate1/3 against an independent slow reference implementation using BigInt or explicit int32 wrap, at lengths 0, 1, 2, 46340, 46341, 46342, 50000; plus qUncompress cases for good input, header too large, size mismatch, corrupt zlib. `[paste stages.ts]`

- [ ] **20. convert tests (error codes)** — `tests/unit/convert.test.ts`
  > Write Vitest tests for convert.ts using a test-only encrypt pipeline (reverse of the four stages) to build valid containers. Cover TESTING_PLAN T04 to T08, T10, T12 to T15 and T16 (limit boundaries), each asserting the exact code. Include a round-trip at 46341 bytes. `[paste convert.ts, stages.ts, twofish-eax.ts]`

## 5. Upstream oracle

- [ ] **21. build-upstream.sh** — `scripts/build-upstream.sh`
  > Write scripts/build-upstream.sh: clone github.com/mircodz/pka2xml, check out commit 22fee2681779a6dd764d6562b0a134ceb339e770, install deps on Ubuntu (libcrypto++-dev libre2-dev zlib1g-dev), build with g++, and place the binary at .upstream/pka2xml. Fail on any error; print the pinned SHA at the end.

- [ ] **22. Differential test** — `tests/differential.test.ts`
  > Write tests/differential.test.ts: for random XML of sizes 0 to 25 MB (including 46340, 46341, 46342), run upstream -e to make a .pkt, then assert port output equals the original XML and equals upstream -d output. Skip with a clear message if the binary is missing locally, but FAIL when process.env.CI is set. `[paste convert.ts]`

- [ ] **23. Fixtures README + golden test** — `tests/fixtures/README.md`
  > Write tests/fixtures/README.md defining the provenance table (origin, Packet Tracer version, date, license, contains-private-data), the rule that only self-authored labs get committed, and the naming scheme name.pkt + name.golden.xml. Also write a tiny Vitest golden test that loops over tests/fixtures/user-authored and compares port output to the golden XML byte for byte.

- [ ] **24. Real-file gate G0 (manual, not a prompt)** — your machine
  > Using the upstream binary from task 21, decrypt 3 of your own .pkt files from different Packet Tracer versions. Record which versions work. If upstream fails, STOP and report; the whole plan depends on this. Only ask Claude to help interpret error output.

## 6. Config and docs

- [ ] **25. vercel.json** — `vercel.json`
  > Write vercel.json with security headers: the CSP from SECURITY_AND_PRIVACY section 5 (connect-src 'none', worker-src 'self'), X-Content-Type-Options nosniff, Referrer-Policy no-referrer, and a restrictive Permissions-Policy. Static output from dist, no functions.

- [ ] **26. CI workflow** — `.github/workflows/ci.yml`
  > Write .github/workflows/ci.yml: checkout, Node LTS, npm ci, typecheck, unit tests, run scripts/build-upstream.sh with caching, differential tests with CI=true, then build. Block merge on any failure.

- [ ] **27. README** — `README.md`
  > Rewrite README.md for the implemented state: what it does, privacy statement, scripts (dev, build, test, typecheck), how to build the upstream oracle, deploy steps to Vercel from GitHub with no env vars, and a link to NOTICE.md. Remove the PLANNING ONLY banner.

---

**Notes**
- Task 24 should be done before trusting anything after task 15.
- `DEPLOYMENT.md`, `DECISIONS.md` and `IMPLEMENTATION_ROADMAP.md` are referenced in the plan docs but were not in the uploaded `pkt.xml`, so tasks 25-27 follow the other docs.
