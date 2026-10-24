import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convert } from '../src/converter/convert';
import { ConversionError } from '../src/converter/errors';
import { MAX_INPUT_BYTES } from '../src/converter/validate';

const UPSTREAM = join(__dirname, '..', '.upstream', 'pka2xml');
const MISSING_MESSAGE =
  'Upstream oracle binary not found at .upstream/pka2xml. Run scripts/build-upstream.sh to enable differential tests.';
const ALPHABET = Buffer.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 <>/="');
const MB = 1024 * 1024;
const TIMEOUT_MS = 300_000;

const present = existsSync(UPSTREAM);
const ci = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSizes(count: number, min: number, max: number): number[] {
  const next = prng(0x706b74);
  const span = Math.log(max / min);
  return Array.from({ length: count }, () => Math.round(min * Math.exp(next() * span)));
}

function randomXml(size: number): Buffer {
  const out = Buffer.allocUnsafe(size);
  if (size === 0) return out;
  const next = prng(size);
  out[0] = 0x3c;
  for (let i = 1; i < size; i++) out[i] = ALPHABET[Math.floor(next() * ALPHABET.length)]!;
  return out;
}

function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

const FIXED_SIZES = [1, 2, 15, 16, 17, 1024, 46_340, 46_341, 46_342, 50_000, MB, MAX_INPUT_BYTES];
const SIZES = [...new Set([...FIXED_SIZES, ...randomSizes(6, 18, 4 * MB)])].sort((a, b) => a - b);

if (!present && ci) {
  describe('differential (CI)', () => {
    it('upstream binary is present', () => {
      throw new Error(`${MISSING_MESSAGE} CI requires it.`);
    });
  });
}

if (!present && !ci) {
  console.warn(`SKIPPED differential tests: ${MISSING_MESSAGE}`);
}

describe.skipIf(!present)('differential: port vs pinned upstream', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pkt2xml-diff-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function upstreamEncrypt(xml: Buffer, name: string): Buffer {
    const xmlPath = join(dir, `${name}.xml`);
    const pktPath = join(dir, `${name}.pkt`);
    writeFileSync(xmlPath, xml);
    execFileSync(UPSTREAM, ['-e', xmlPath, pktPath], { stdio: 'pipe' });
    return readFileSync(pktPath);
  }

  function upstreamDecrypt(pkt: Buffer, name: string): Buffer {
    const pktPath = join(dir, `${name}.dec.pkt`);
    const outPath = join(dir, `${name}.dec.xml`);
    writeFileSync(pktPath, pkt);
    execFileSync(UPSTREAM, ['-d', pktPath, outPath], { stdio: 'pipe' });
    return readFileSync(outPath);
  }

  it.each(SIZES)(
    'size %i: port output equals original XML and upstream -d output',
    async (size) => {
      const xml = randomXml(size);
      const pkt = upstreamEncrypt(xml, `s${size}`);
      expect(pkt.length).toBeLessThanOrEqual(MAX_INPUT_BYTES);

      const fromUpstream = upstreamDecrypt(pkt, `s${size}`);
      expect(firstDifference(fromUpstream, xml)).toBe(-1);

      const { xml: fromPort } = await convert(new Uint8Array(pkt));
      expect(firstDifference(fromPort, xml)).toBe(-1);
      expect(firstDifference(fromPort, fromUpstream)).toBe(-1);
    },
    TIMEOUT_MS,
  );

  it(
    'size 0: upstream round-trips empty XML, port rejects it with E_EMPTY_OUTPUT',
    async () => {
      const xml = randomXml(0);
      const pkt = upstreamEncrypt(xml, 's0');
      expect(upstreamDecrypt(pkt, 's0').length).toBe(0);

      const error = await convert(new Uint8Array(pkt)).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ConversionError);
      expect((error as ConversionError).code).toBe('E_EMPTY_OUTPUT');
      expect((error as ConversionError).stage).toBe('output');
    },
    TIMEOUT_MS,
  );
});
