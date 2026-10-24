# pkt2xml-web

Convert a Cisco Packet Tracer `.pkt` file to XML in your browser, so you can read it, search it, or give it to an AI assistant to inspect your lab.

## Privacy

> Your file is converted **in your browser**. It is not uploaded, stored, or sent to any server by this site. Hosting (Vercel) sees the normal request for the web page itself, not your file.

This is enforced, not just promised: the site ships with the Content-Security-Policy `connect-src 'none'`, has no third-party scripts, fonts, or analytics, and its diagnostics contain codes and sizes only, never file names or contents.

The XML itself can contain device passwords, SNMP communities, and IP plans. Review it before pasting it into an AI service or sharing it.

## How to use

1. Open the site.
2. Drop a `.pkt` file onto the page, or click to choose one (up to 25 MB).
3. Click **Convert**, then **Download XML**.
4. Click **Convert another** to start again without reloading.

If something fails you get a short message and an error code. **Copy diagnostics** copies a JSON report (app version, conversion ID, error code, stage, sizes, browser string) that you can attach to a bug report.

Not supported: `.pka` activity files, `.pkz`/`.pksz`, very old (pre-v5) Packet Tracer files, and XML to `.pkt`.

## Develop

Requires Node 22.12 or newer.

| Command | What it does |
|---|---|
| `npm install` | Install dev dependencies (there are no runtime dependencies) |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck, build to `dist/`, and copy `NOTICE.md` to `dist/NOTICE.txt` |
| `npm test` | Run all Vitest tests |
| `npm run typecheck` | Run `tsc --noEmit` |

## Upstream oracle

The converter is a TypeScript port of the algorithm in [mircodz/pka2xml](https://github.com/mircodz/pka2xml), pinned at commit `22fee2681779a6dd764d6562b0a134ceb339e770`. The port is only trusted because it is tested against the original binary.

Build the oracle on Ubuntu (installs `g++`, `git`, `libcrypto++-dev`, `libre2-dev`, `zlib1g-dev` if missing):

```
bash scripts/build-upstream.sh
```

The binary lands at `.upstream/pka2xml`. It is a development and CI tool and is never shipped to the site.

Then:

```
npx vitest run tests/differential.test.ts
```

Without the binary the differential tests are skipped locally with a message. When the `CI` environment variable is set they fail instead.

### Testing with your own .pkt files

Follow [tests/fixtures/README.md](tests/fixtures/README.md): decrypt your file with the upstream binary to create `name.golden.xml`, list the fixture in the provenance table, then run `npx vitest run tests/golden.test.ts`. Only labs you made yourself are committed.

## Deploy to Vercel (from GitHub, no environment variables)

1. Push this repository to GitHub.
2. In Vercel choose **Add New, Project**, and import the repository.
3. Leave the build settings alone. `vercel.json` already sets `npm ci`, `npm run build`, the `dist` output directory, and the security headers. Do not add environment variables.
4. Click **Deploy**.
5. Check the deployment:
   - `curl -sI https://YOUR-SITE/` shows `content-security-policy` with `connect-src 'none'`, plus `x-content-type-options: nosniff`.
   - The browser console shows no CSP violations while converting.
   - Converting a fixture and hashing the download gives the same SHA-256 as its golden XML.
   - The footer **License notice** link opens `NOTICE.txt`.
6. In GitHub, add a branch protection rule that requires the `ci` check to pass before merging. The workflow cannot enforce this by itself.

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, builds the upstream oracle, runs the differential and golden tests with `CI=true`, and builds the site.

Vercel's free Hobby plan is for personal, non-commercial use. Check its current terms for your situation.

## Status

Gate G0 is still open: the port has been verified against the upstream binary on synthetic data only. Decrypt at least three of your own real `.pkt` files from different Packet Tracer versions (checklist task 24) before treating the site as supported.

## Legal

Not affiliated with or endorsed by Cisco. Packet Tracer is a trademark of Cisco Systems, Inc. The conversion algorithm is derived from pka2xml (BSD-2-Clause); see [NOTICE.md](NOTICE.md).

## Plan documents

| File | Owns |
|---|---|
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Goals, non-goals, MVP scope, acceptance criteria |
| [docs/TECHNICAL_FEASIBILITY.md](docs/TECHNICAL_FEASIBILITY.md) | What was verified, options compared, risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, error codes |
| [docs/FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md) | Files and why each exists |
| [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) | Threat model, limits, privacy, legal notes |
| [docs/TESTING_PLAN.md](docs/TESTING_PLAN.md) | Test cases, fixtures, differential testing |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | Implementation checklist |
