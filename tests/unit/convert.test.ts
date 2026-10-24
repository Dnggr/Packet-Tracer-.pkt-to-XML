import { describe, expect, test } from 'vitest';
import { convert } from '../../src/converter/convert';
import { ConversionError, type ErrorCode, type Stage } from '../../src/converter/errors';
import { ctr, omac } from '../../src/converter/twofish-eax';
import { MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } from '../../src/converter/validate';

const KEY = new Uint8Array(16).fill(0x89);
const NONCE = new Uint8Array(16).fill(0x10);
const EMPTY = new Uint8Array(0);

const mod256 = (v: number): number => ((v % 256) + 256) % 256;

function bytes(n: number, seed = 1): Uint8Array {
  const a = new Uint8Array(n);
  let s = seed + n;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    a[i] = s >>> 24;
  }
  return a;
}

function xmlOf(n: number, seed = 1): Uint8Array {
  const a = bytes(n, seed);
  if (n > 0) a[0] = 0x3c;
  return a;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function deflate(d: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([d as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function qCompress(xml: Uint8Array, declared = xml.length): Promise<Uint8Array> {
  const z = await deflate(xml);
  const out = new Uint8Array(4 + z.length);
  new DataView(out.buffer).setUint32(0, declared);
  out.set(z, 4);
  return out;
}

function eaxEncrypt(pt: Uint8Array): Uint8Array {
  const n = omac(KEY, 0, NONCE);
  const h = omac(KEY, 1, EMPTY);
  const ct = ctr(KEY, n, pt);
  const c = omac(KEY, 2, ct);
  const out = new Uint8Array(pt.length + 16);
  out.set(ct);
  for (let i = 0; i < 16; i++) out[pt.length + i] = n[i] ^ h[i] ^ c[i];
  return out;
}

const obfuscate3 = (a: Uint8Array): Uint8Array => a.map((v, i) => v ^ mod256(a.length - i));

function obfuscate1(b: Uint8Array): Uint8Array {
  const L = b.length;
  return Uint8Array.from(b, (_, j) => b[L - 1 - j] ^ mod256(L - (L - 1 - j) * L));
}

const wrap = (payload: Uint8Array): Uint8Array => obfuscate1(eaxEncrypt(obfuscate3(payload)));
const toPkt = async (xml: Uint8Array, declared?: number): Promise<Uint8Array> =>
  wrap(await qCompress(xml, declared));

async function expectCode(run: Promise<unknown>, code: ErrorCode, stage: Stage): Promise<void> {
  const err = await run.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(ConversionError);
  expect(err).toMatchObject({ code, stage });
}

describe('round trips through the test-only encryptor', () => {
  test.each([1, 15, 16, 17, 1000, 46340, 46341, 46342, 50000, 1_000_000])('size %i', async (n) => {
    const xml = xmlOf(n);
    const { xml: out } = await convert(await toPkt(xml));
    expect(same(out, xml)).toBe(true);
  });

  test('46341 bytes, the int32 boundary', async () => {
    const xml = xmlOf(46341, 7);
    expect(same((await convert(await toPkt(xml))).xml, xml)).toBe(true);
  });

  test('a UTF-8 BOM before "<" is accepted and preserved', async () => {
    const xml = Uint8Array.of(0xef, 0xbb, 0xbf, ...xmlOf(50, 3));
    expect(same((await convert(await toPkt(xml))).xml, xml)).toBe(true);
  });

  test('the input bytes are not modified', async () => {
    const pkt = await toPkt(xmlOf(2000));
    const copy = pkt.slice();
    await convert(pkt);
    expect(same(pkt, copy)).toBe(true);
  });
});

describe('input errors (T04, T05, T06, T10, T16)', () => {
  test('T04 empty file', async () => {
    await expectCode(convert(EMPTY), 'E_EMPTY_FILE', 'input');
  });

  test.each([1, 8, 15])('T05 %i bytes', async (n) => {
    await expectCode(convert(bytes(n)), 'E_NOT_PKT', 'input');
  });

  test.each([16, 17, 31, 100, 1000, 5000])('T06 random bytes, length %i', async (n) => {
    await expectCode(convert(bytes(n, 9)), 'E_AUTH_FAILED', 'decrypt');
  });

  test('T10 non-pkt content with a .pkt name (PNG signature and filler)', async () => {
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...bytes(2000, 4));
    await expectCode(convert(png), 'E_AUTH_FAILED', 'decrypt');
  });

  test('T16 exactly the input limit is accepted, limit + 1 is E_TOO_LARGE', async () => {
    await expectCode(convert(bytes(MAX_INPUT_BYTES, 5)), 'E_AUTH_FAILED', 'decrypt');
    await expectCode(convert(new Uint8Array(MAX_INPUT_BYTES + 1)), 'E_TOO_LARGE', 'input');
  });
});

describe('authentication failures (T07, T08)', () => {
  test('T07 one flipped bit in the start, middle and tag', async () => {
    const pkt = await toPkt(xmlOf(500));
    for (const pos of [0, 1, pkt.length >> 1, pkt.length - 17, pkt.length - 16, pkt.length - 1]) {
      const bad = pkt.slice();
      bad[pos] ^= 1;
      await expectCode(convert(bad), 'E_AUTH_FAILED', 'decrypt');
    }
  });

  test('T08 truncated and extended files', async () => {
    const pkt = await toPkt(xmlOf(500));
    await expectCode(convert(pkt.subarray(0, pkt.length - 1)), 'E_AUTH_FAILED', 'decrypt');
    await expectCode(convert(pkt.subarray(1)), 'E_AUTH_FAILED', 'decrypt');
    await expectCode(convert(Uint8Array.of(...pkt, 0)), 'E_AUTH_FAILED', 'decrypt');
    await expectCode(convert(Uint8Array.of(0, ...pkt)), 'E_AUTH_FAILED', 'decrypt');
  });
});

describe('crafted containers with a valid tag (T12 to T15)', () => {
  test('T12 header claims 4 GB', async () => {
    await expectCode(convert(await toPkt(xmlOf(100), 0xffffffff)), 'E_OUTPUT_TOO_LARGE', 'inflate');
  });

  test('T12 header one byte above the output cap', async () => {
    await expectCode(
      convert(await toPkt(xmlOf(100), MAX_OUTPUT_BYTES + 1)),
      'E_OUTPUT_TOO_LARGE',
      'inflate',
    );
  });

  test('T13 header smaller or larger than the inflated length', async () => {
    await expectCode(convert(await toPkt(xmlOf(1000), 999)), 'E_INFLATE_FAILED', 'inflate');
    await expectCode(convert(await toPkt(xmlOf(1000), 1001)), 'E_INFLATE_FAILED', 'inflate');
    await expectCode(convert(await toPkt(xmlOf(1000), 0)), 'E_INFLATE_FAILED', 'inflate');
  });

  test('T14 corrupt zlib stream', async () => {
    const qc = await qCompress(xmlOf(5000));
    qc.fill(0xaa, 8, 60);
    await expectCode(convert(wrap(qc)), 'E_INFLATE_FAILED', 'inflate');
  });

  test('T14 truncated zlib stream and missing size header', async () => {
    const qc = await qCompress(xmlOf(5000));
    await expectCode(convert(wrap(qc.subarray(0, qc.length >> 1))), 'E_INFLATE_FAILED', 'inflate');
    await expectCode(convert(wrap(bytes(3))), 'E_INFLATE_FAILED', 'inflate');
  });

  test('T15 decrypts to empty', async () => {
    await expectCode(convert(await toPkt(EMPTY)), 'E_EMPTY_OUTPUT', 'output');
  });

  test('T15 decrypts to non-XML', async () => {
    const text = new TextEncoder().encode('hello world');
    await expectCode(convert(await toPkt(text)), 'E_OUTPUT_NOT_XML', 'output');
    await expectCode(convert(await toPkt(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41))), 'E_OUTPUT_NOT_XML', 'output');
  });
});

describe('output limit option', () => {
  test('T16 output exactly at the cap is accepted, one byte over is E_OUTPUT_TOO_LARGE', async () => {
    const pkt = await toPkt(xmlOf(5000));
    expect((await convert(pkt, { maxOutputBytes: 5000 })).xml.length).toBe(5000);
    await expectCode(convert(pkt, { maxOutputBytes: 4999 }), 'E_OUTPUT_TOO_LARGE', 'inflate');
  });
});

describe('timings and stage attribution', () => {
  const STAGES: Stage[] = ['input', 'deobfuscate1', 'decrypt', 'deobfuscate2', 'inflate', 'output'];

  test('records every stage in order with byte counts', async () => {
    const xml = xmlOf(3000);
    const pkt = await toPkt(xml);
    const { timings } = await convert(pkt);
    expect(timings.map((t) => t.stage)).toEqual(STAGES);
    expect(timings[0].inBytes).toBe(pkt.length);
    expect(timings[1]).toMatchObject({ inBytes: pkt.length, outBytes: pkt.length });
    expect(timings[2].outBytes).toBe(pkt.length - 16);
    expect(timings[3].inBytes).toBe(pkt.length - 16);
    expect(timings[4].outBytes).toBe(3000);
    expect(timings[5]).toMatchObject({ inBytes: 3000, outBytes: 3000 });
    for (const t of timings) expect(t.ms).toBeGreaterThanOrEqual(0);
  });

  test('uses the injected clock and reports each stage through onStage', async () => {
    let clock = 0;
    const seen: string[] = [];
    const { timings } = await convert(await toPkt(xmlOf(200)), {
      now: () => (clock += 5),
      onStage: (t) => seen.push(`${t.stage}:${t.ms}`),
    });
    expect(seen).toEqual(STAGES.map((s) => `${s}:5`));
    expect(timings.every((t) => t.ms === 5)).toBe(true);
  });

  test('a failing stage is not recorded and earlier stages were already reported', async () => {
    const seen: Stage[] = [];
    await expectCode(
      convert(bytes(100), { onStage: (t) => seen.push(t.stage) }),
      'E_AUTH_FAILED',
      'decrypt',
    );
    expect(seen).toEqual(['input', 'deobfuscate1']);
  });

  test('an unexpected exception is wrapped as E_UNEXPECTED at the stage that threw', async () => {
    await expectCode(convert(null as unknown as Uint8Array), 'E_UNEXPECTED', 'input');
  });
});
