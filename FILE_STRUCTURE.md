# File Structure

Only files with a real responsibility are listed. No placeholder directories. Names are provisional until approved.

```
pkt2xml-web/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ vercel.json
├─ LICENSE
├─ NOTICE.md
├─ README.md
├─ docs/                      (the planning .md files, kept)
├─ .github/workflows/ci.yml
├─ scripts/build-upstream.sh
├─ src/
│  ├─ main.ts
│  ├─ style.css
│  ├─ worker.ts
│  ├─ diagnostics.ts
│  └─ converter/
│     ├─ convert.ts
│     ├─ stages.ts
│     ├─ twofish-eax.ts
│     ├─ validate.ts
│     └─ errors.ts
└─ tests/
   ├─ unit/
   │  ├─ twofish-eax.test.ts
   │  ├─ stages.test.ts
   │  ├─ validate.test.ts
   │  └─ convert.test.ts
   ├─ differential.test.ts
   ├─ e2e/convert.spec.ts
   └─ fixtures/
      ├─ README.md
      └─ user-authored/ (*.pkt + *.golden.xml, only files you own)
```

## Purpose of each file
| File | Why it exists |
|---|---|
| `index.html` | Single page shell: title, explanation, drop zone, buttons, status region, privacy notice, link to NOTICE |
| `package.json` | Scripts (`dev`, `build`, `test`, `test:e2e`, `typecheck`). **Runtime dependencies: none planned** (inflate library only if S3 shows `DecompressionStream` is insufficient). Dev: `vite`, `typescript`, `vitest`, `@playwright/test` |
| `tsconfig.json` | Strict TypeScript; catches the byte/number mistakes this project is prone to |
| `vite.config.ts` | Build config; ensures the worker is emitted as a same-origin file (needed for strict CSP) |
| `vercel.json` | Security headers incl. CSP `connect-src 'none'`. Nothing else needed [verify in preview] |
| `LICENSE` | This project's own license (OQ-2) |
| `NOTICE.md` | Upstream BSD-2-Clause copyright/conditions/disclaimer + Cisco trademark disclaimer; linked from the site footer |
| `README.md` | Install/run/deploy instructions |
| `docs/` | The plan documents so future AI assistants find the intent and rules |
| `.github/workflows/ci.yml` | Typecheck, unit tests, build pinned upstream, differential tests, build; blocks merge on failure |
| `scripts/build-upstream.sh` | Clones upstream at the pinned SHA and builds the oracle binary; used by CI and locally. Never ships to the site |
| `src/main.ts` | UI controller and state machine (see ARCHITECTURE §3). **Debug UI behavior here** |
| `src/style.css` | Responsive layout, dark/light via CSS variables; no framework |
| `src/worker.ts` | Worker message boundary and last-resort error wrapping |
| `src/diagnostics.ts` | Conversion ID, structured logs, diagnostics JSON |
| `src/converter/convert.ts` | **Main logic.** Pipeline order and stage attribution. **Start debugging any wrong output here** |
| `src/converter/stages.ts` | Deobfuscation + qUncompress, each a small pure function |
| `src/converter/twofish-eax.ts` | Twofish-128 + EAX decrypt (or thin wrapper if a vetted package is chosen) |
| `src/converter/validate.ts` | All limits and sanity checks in one place so limits are never scattered |
| `src/converter/errors.ts` | Error codes, stages, messages; the single source for ARCHITECTURE §4 |
| `tests/unit/*` | Per-module tests: KAT vectors, stage edge cases (incl. 46,341-byte boundary), limits, error codes |
| `tests/differential.test.ts` | Port vs pinned upstream binary on synthetic inputs and on fixtures; skipped with a clear message if the binary is absent locally, **required** in CI |
| `tests/e2e/convert.spec.ts` | Playwright: upload → convert → download integrity → error paths → no-network assertion |
| `tests/fixtures/README.md` | Provenance and license of every fixture; rules for adding one |
| `tests/fixtures/user-authored/` | Small labs you create yourself, plus golden XML from the upstream binary |

## Where to begin debugging
1. Wrong/odd XML or `E_AUTH_FAILED` on a file that works in upstream → `converter/convert.ts`, then `twofish-eax.ts` tests, then `stages.ts` boundary tests.
2. Limits or odd rejections → `converter/validate.ts`.
3. UI stuck/double-fire → `main.ts` state machine.
4. Works locally, fails on Vercel → `vercel.json` headers (CSP blocking the worker) then DEPLOYMENT.md troubleshooting.
