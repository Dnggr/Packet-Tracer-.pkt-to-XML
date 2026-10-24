import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convert } from '../src/converter/convert';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const DIR = join(FIXTURES_DIR, 'user-authored');
const PKT_SUFFIX = '.pkt';
const GOLDEN_SUFFIX = '.golden.xml';
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f !== '.gitkeep') : [];
const names = (suffix: string): string[] =>
  files
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .sort();

const pktNames = names(PKT_SUFFIX);
const goldenNames = names(GOLDEN_SUFFIX);
const provenance = readFileSync(join(FIXTURES_DIR, 'README.md'), 'utf8');

function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

if (pktNames.length === 0) {
  console.warn(
    'SKIPPED golden tests: no fixtures in tests/fixtures/user-authored. Gate G0 is still open; see tests/fixtures/README.md.',
  );
}

describe('fixture hygiene', () => {
  it('only .pkt and .golden.xml files are present', () => {
    const unexpected = files.filter((f) => !f.endsWith(PKT_SUFFIX) && !f.endsWith(GOLDEN_SUFFIX));
    expect(unexpected).toEqual([]);
  });

  it('every .pkt has a .golden.xml and every .golden.xml has a .pkt', () => {
    expect(goldenNames).toEqual(pktNames);
  });

  it('every fixture name is lowercase kebab-case', () => {
    expect(pktNames.filter((n) => !NAME_PATTERN.test(n))).toEqual([]);
  });

  it('every fixture is listed in the provenance table', () => {
    expect(pktNames.filter((n) => !provenance.includes(`\`${n}\``))).toEqual([]);
  });
});

describe.skipIf(pktNames.length === 0)('golden: port output is byte-identical to upstream', () => {
  it.each(pktNames)('%s', async (name) => {
    const pkt = new Uint8Array(readFileSync(join(DIR, `${name}${PKT_SUFFIX}`)));
    const golden = new Uint8Array(readFileSync(join(DIR, `${name}${GOLDEN_SUFFIX}`)));
    const { xml } = await convert(pkt);
    expect(firstDifference(xml, golden)).toBe(-1);
  });
});
