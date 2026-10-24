import { describe, expect, test } from 'vitest';
import { ConversionError, type ErrorCode } from '../../src/converter/errors';
import { deobfuscate1, deobfuscate3, qUncompress } from '../../src/converter/stages';

const NO_CAP = 2 ** 31;

function bytes(n: number, seed = 1): Uint8Array {
  const a = new Uint8Array(n);
  let s = seed + n;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    a[i] = s >>> 24;
  }
  return a;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const low8Int32 = (v: bigint): number => Number(BigInt.asIntN(32, v) & 0xffn);

function reference1(a: Uint8Array): Uint8Array {
  const L = BigInt(a.length);
  return Uint8Array.from(a, (_, i) => a[a.length - 1 - i] ^ low8Int32(L - BigInt.asIntN(32, BigInt(i) * L)));
}

function reference3(a: Uint8Array): Uint8Array {
  const L = BigInt(a.length);
  return Uint8Array.from(a, (v, i) => v ^ low8Int32(L - BigInt(i)));
}

async function deflate(d: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([d as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function container(xml: Uint8Array, declared = xml.length): Promise<Uint8Array> {
  const z = await deflate(xml);
  const out = new Uint8Array(4 + z.length);
  new DataView(out.buffer).setUint32(0, declared);
  out.set(z, 4);
  return out;
}

async function expectInflate(run: Promise<unknown>, code: ErrorCode): Promise<void> {
  const err = await run.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(ConversionError);
  expect(err).toMatchObject({ code, stage: 'inflate' });
}

const LENGTHS = [0, 1, 2, 46340, 46341, 46342, 50000];

describe('deobfuscate1', () => {
  test.each(LENGTHS)('matches the int32 reference, length %i', (n) => {
    const a = bytes(n);
    expect(same(deobfuscate1(a), reference1(a))).toBe(true);
  });

  test('returns a new array and leaves the input untouched', () => {
    const a = bytes(300);
    const copy = a.slice();
    const out = deobfuscate1(a);
    expect(out).not.toBe(a);
    expect(out.length).toBe(a.length);
    expect(a).toEqual(copy);
  });

  test('works on an offset view', () => {
    const host = bytes(120);
    const view = host.subarray(7, 100);
    expect(same(deobfuscate1(view), reference1(view.slice()))).toBe(true);
  });
});

describe('deobfuscate3', () => {
  test.each(LENGTHS)('matches the int32 reference, length %i', (n) => {
    const a = bytes(n, 2);
    expect(same(deobfuscate3(a), reference3(a))).toBe(true);
  });

  test('is its own inverse and does not mutate the input', () => {
    const a = bytes(1000, 3);
    const copy = a.slice();
    const out = deobfuscate3(a);
    expect(out).not.toBe(a);
    expect(a).toEqual(copy);
    expect(deobfuscate3(out)).toEqual(a);
  });

  test('works on an offset view', () => {
    const host = bytes(120, 4);
    const view = host.subarray(5, 90);
    expect(same(deobfuscate3(view), reference3(view.slice()))).toBe(true);
  });
});

describe('qUncompress', () => {
  test('inflates a good container', async () => {
    const xml = bytes(5000, 5);
    expect(same(await qUncompress(await container(xml), NO_CAP), xml)).toBe(true);
  });

  test('inflates a large multi-chunk container', async () => {
    const xml = bytes(3_000_000, 6);
    expect(same(await qUncompress(await container(xml), NO_CAP), xml)).toBe(true);
  });

  test('inflates an empty payload to an empty array', async () => {
    expect((await qUncompress(await container(new Uint8Array(0)), NO_CAP)).length).toBe(0);
  });

  test('works on an offset view', async () => {
    const xml = bytes(300, 7);
    const c = await container(xml);
    const host = new Uint8Array(c.length + 9);
    host.set(c, 9);
    expect(same(await qUncompress(host.subarray(9), NO_CAP), xml)).toBe(true);
  });

  test('a header above the cap is rejected before inflating', async () => {
    const c = await container(bytes(100, 8), 0xffffffff);
    await expectInflate(qUncompress(c, NO_CAP), 'E_OUTPUT_TOO_LARGE');
    await expectInflate(qUncompress(await container(bytes(100, 8), 1001), 1000), 'E_OUTPUT_TOO_LARGE');
  });

  test('a header equal to the cap is not rejected for size', async () => {
    const xml = bytes(1000, 9);
    expect(same(await qUncompress(await container(xml), 1000), xml)).toBe(true);
  });

  test('actual output above the cap is rejected even if the header is within it', async () => {
    const bomb = new Uint8Array(20_000_000).fill(60);
    await expectInflate(qUncompress(await container(bomb), 1_000_000), 'E_OUTPUT_TOO_LARGE');
    await expectInflate(qUncompress(await container(bomb, 1_000_000), 1_000_000), 'E_OUTPUT_TOO_LARGE');
  });

  test('header smaller than the real size stops early with E_INFLATE_FAILED', async () => {
    const bomb = new Uint8Array(20_000_000).fill(60);
    await expectInflate(qUncompress(await container(bomb, 5000), NO_CAP), 'E_INFLATE_FAILED');
    await expectInflate(qUncompress(await container(bytes(5000, 10), 4999), NO_CAP), 'E_INFLATE_FAILED');
  });

  test('header larger than the real size is E_INFLATE_FAILED', async () => {
    await expectInflate(qUncompress(await container(bytes(5000, 11), 5001), NO_CAP), 'E_INFLATE_FAILED');
    await expectInflate(qUncompress(await container(new Uint8Array(0), 10), NO_CAP), 'E_INFLATE_FAILED');
  });

  test('corrupt zlib data is E_INFLATE_FAILED', async () => {
    const c = await container(bytes(5000, 12));
    c.fill(0xaa, 8, 60);
    await expectInflate(qUncompress(c, NO_CAP), 'E_INFLATE_FAILED');
    await expectInflate(qUncompress(Uint8Array.of(0, 0, 0x10, 0, 1, 2, 3, 4, 5, 6), NO_CAP), 'E_INFLATE_FAILED');
  });

  test('a truncated zlib stream is E_INFLATE_FAILED', async () => {
    const c = await container(bytes(5000, 13));
    await expectInflate(qUncompress(c.subarray(0, c.length >> 1), NO_CAP), 'E_INFLATE_FAILED');
  });

  test('a missing size header is E_INFLATE_FAILED', async () => {
    for (const n of [0, 1, 3]) await expectInflate(qUncompress(new Uint8Array(n), NO_CAP), 'E_INFLATE_FAILED');
  });
});
