# Test fixtures

Real `.pkt` files used by `tests/golden.test.ts` (TESTING_PLAN layer 3, cases T01 and gate G0).

## Rules

1. Only labs you authored yourself in Packet Tracer are committed. Files from classmates, instructors, courses, or the sample networks shipped with a Packet Tracer install are never committed; keep them outside the repository or in a path ignored by `.gitignore`.
2. Never invent, hand-build, or synthesize a `.pkt` and list it here as real. Synthetic inputs belong in `tests/differential.test.ts`, which generates them with the pinned upstream binary.
3. Strip anything private before saving the lab: real names, school or employer names, passwords, real IP plans, notes, and activity-wizard answers. Set `contains-private-data` to `no` only after checking.
4. Every fixture has an entry in the provenance table below. The golden test fails if a fixture is missing from the table.
5. Prefer small labs, one fixture per installed Packet Tracer major version, plus one with VLANs, ACLs and DHCP.

## Layout and naming

Fixtures live in `tests/fixtures/user-authored/`. Each fixture is a pair sharing one lowercase kebab-case name:

```
name.pkt
name.golden.xml
```

Put the Packet Tracer version in the name, for example `pt8-2-2-router-switch-basic.pkt`. A `.pkt` without a matching `.golden.xml`, or the reverse, fails the golden test.

## Producing the golden XML

Build the pinned upstream binary and decrypt with it. The port is never used to make its own golden file.

```
scripts/build-upstream.sh
.upstream/pka2xml -d tests/fixtures/user-authored/name.pkt tests/fixtures/user-authored/name.golden.xml
```

Open the golden XML once and confirm it is readable XML before committing. If upstream fails on a real file, stop and report it; gate G0 (checklist task 24) depends on this.

## Provenance table

Wrap each fixture name in backticks, without the extension, exactly as it appears in the file names.

| Fixture | Origin | Packet Tracer version | Date | License | Contains private data |
|---|---|---|---|---|---|
| _none committed yet_ | | | | | |

## Running

```
npx vitest run tests/golden.test.ts
```

With no fixtures the golden cases are skipped with a console message. They are skipped, not passed: gate G0 is open until at least three real fixtures from different Packet Tracer versions are listed above.
