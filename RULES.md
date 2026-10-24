# Rules for AI-assisted work on this repo

1. Deliver output as a zip. Paths are relative to the repo root, so it can be extracted over the codebase. Include only new or changed files.
2. Code must be efficient: no redundant passes or copies, no allocation sized from untrusted input, stream instead of buffering when possible, zero runtime dependencies.
3. No comments in code. Names, types and tests carry the meaning; reasoning belongs in docs/. The only allowed comment is the one-line license header at the top of each file in `src/converter/`:
   `// Derived from pka2xml (c) 2020 Mirco De Zorzi, BSD-2-Clause. See NOTICE.md.`
4. Strict TypeScript. Converter code is pure functions on `Uint8Array`, with no DOM access.
5. Verify before delivering: typecheck and run tests. Do not claim a check passed without running it.
6. When a checklist task is finished and verified, tick its box in `CHECKLIST.md` and include the updated file in the zip.
