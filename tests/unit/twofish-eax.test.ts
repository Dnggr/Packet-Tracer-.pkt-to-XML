import { describe, expect, test } from 'vitest';
import { ConversionError } from '../../src/converter/errors';
import { createTwofish, ctr, eaxDecrypt, omac } from '../../src/converter/twofish-eax';

const hex = (b: Uint8Array): string => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
const unhex = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/../g) ?? [], (v) => parseInt(v, 16));
const pattern = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255);
const fill = (v: number): Uint8Array => new Uint8Array(16).fill(v);
const ZERO = new Uint8Array(16);

const xor = (a: Uint8Array, b: Uint8Array): Uint8Array => a.map((v, i) => v ^ b[i]);

function double(b: Uint8Array): Uint8Array {
  const o = new Uint8Array(16);
  for (let i = 0; i < 15; i++) o[i] = ((b[i] << 1) | (b[i + 1] >> 7)) & 255;
  o[15] = ((b[15] << 1) & 255) ^ (b[0] & 0x80 ? 0x87 : 0);
  return o;
}

function refCipher(key: Uint8Array): (b: Uint8Array) => Uint8Array {
  const tf = createTwofish(key);
  return (b) => tf.encryptBlock(b);
}

function refCmac(E: (b: Uint8Array) => Uint8Array, msg: Uint8Array): Uint8Array {
  const k1 = double(E(ZERO));
  const k2 = double(k1);
  const n = Math.max(1, Math.ceil(msg.length / 16));
  let x: Uint8Array = ZERO;
  for (let i = 0; i < n - 1; i++) x = E(xor(x, msg.subarray(16 * i, 16 * i + 16)));
  const last = msg.subarray(16 * (n - 1));
  let blk: Uint8Array;
  if (msg.length > 0 && last.length === 16) blk = xor(last, k1);
  else {
    const pad = new Uint8Array(16);
    pad.set(last);
    pad[last.length] = 0x80;
    blk = xor(pad, k2);
  }
  return E(xor(x, blk));
}

function refOmac(E: (b: Uint8Array) => Uint8Array, t: number, m: Uint8Array): Uint8Array {
  const b = new Uint8Array(16 + m.length);
  b[15] = t;
  b.set(m, 16);
  return refCmac(E, b);
}

function refCtr(E: (b: Uint8Array) => Uint8Array, counter: Uint8Array, d: Uint8Array): Uint8Array {
  const out = new Uint8Array(d.length);
  const cur = counter.slice();
  for (let p = 0; p < d.length; p += 16) {
    const ks = E(cur);
    for (let j = 0; j < 16 && p + j < d.length; j++) out[p + j] = d[p + j] ^ ks[j];
    for (let i = 15; i >= 0; i--) {
      cur[i] = (cur[i] + 1) & 255;
      if (cur[i] !== 0) break;
    }
  }
  return out;
}

function refEaxEncrypt(key: Uint8Array, nonce: Uint8Array, pt: Uint8Array): Uint8Array {
  const E = refCipher(key);
  const n = refOmac(E, 0, nonce);
  const h = refOmac(E, 1, new Uint8Array(0));
  const ct = refCtr(E, n, pt);
  const c = refOmac(E, 2, ct);
  const out = new Uint8Array(pt.length + 16);
  out.set(ct);
  out.set(xor(xor(n, h), c), pt.length);
  return out;
}

function expectAuthFailure(fn: () => unknown): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConversionError);
    expect(e).toMatchObject({ code: 'E_AUTH_FAILED', stage: 'decrypt' });
    return;
  }
  throw new Error('expected E_AUTH_FAILED');
}

describe('Twofish-128 known answers', () => {
  const vectors: [string, string, string, string][] = [
    ['00'.repeat(16), '00'.repeat(16), '9f589f5cf6122c32b6bfec2f2ae8c35a', 'ecb_ival I=1 (zero key, zero plaintext)'],
    ['00'.repeat(16), '9f589f5cf6122c32b6bfec2f2ae8c35a', 'd491db16e7b1c39e86cb086b789f5419', 'ecb_ival I=2'],
    ['9f589f5cf6122c32b6bfec2f2ae8c35a', 'd491db16e7b1c39e86cb086b789f5419', '019f9809de1711858faac3a3ba20fbc3', 'ecb_ival I=3'],
    ['d491db16e7b1c39e86cb086b789f5419', '019f9809de1711858faac3a3ba20fbc3', '6363977de839486297e661c6c9d668eb', 'ecb_ival I=4'],
  ];
  test.each(vectors)('Twofish submission %#: key %s', (key, pt, ct) => {
    expect(hex(createTwofish(unhex(key)).encryptBlock(unhex(pt)))).toBe(ct);
  });

  test('rejects wrong key and block sizes', () => {
    expect(() => createTwofish(new Uint8Array(15))).toThrow(RangeError);
    expect(() => createTwofish(new Uint8Array(32))).toThrow(RangeError);
    expect(() => createTwofish(ZERO).encryptBlock(new Uint8Array(15))).toThrow(RangeError);
  });

  test('does not mutate the block', () => {
    const block = pattern(16);
    createTwofish(fill(1)).encryptBlock(block);
    expect(block).toEqual(pattern(16));
  });
});

describe('EAX-Twofish known answers (Crypto++ 8.9.0 EAX<Twofish>)', () => {
  const vectors: [string, string, number, string][] = [
    ['89'.repeat(16), '10'.repeat(16), 0, '88f98d6e5ae14558bfd229c85f2e82e3'],
    ['89'.repeat(16), '10'.repeat(16), 1, 'e8ad6a252bdc83333e55da779708193b09'],
    ['89'.repeat(16), '10'.repeat(16), 17, 'e8fce214da66975fb936601b34eb29ad0cc355ce72bcdb73ddcc1b0b518e3ee5e1'],
    ['89'.repeat(16), '10'.repeat(16), 33, 'e8fce214da66975fb936601b34eb29ad0c4e82c7bde05bf90745ef67cb2af6bf4714d3c54fa3c132b3f8845c97ffcab0b4'],
    ['000102030405060708090a0b0c0d0e0f', '101112131415161718191a1b1c1d1e1f', 20, 'a16397bf841ce9ad3b7dfb30b5ecdd896ea206eae77ef08d0564f376b58cbd71db29ab69'],
  ];
  test.each(vectors)('key %s, plaintext length %i', (key, nonce, len, ct) => {
    expect(hex(eaxDecrypt(unhex(key), unhex(nonce), unhex(ct)))).toBe(hex(pattern(len)));
  });
});

describe('OMAC and CTR against the test-local reference', () => {
  const key = pattern(16);
  const E = refCipher(key);
  const lengths = [0, 1, 15, 16, 17, 31, 32, 33, 100, 1000];

  test.each(lengths)('omac tweaks 0..2, length %i', (len) => {
    const m = pattern(len);
    for (const t of [0, 1, 2]) expect(hex(omac(key, t, m))).toBe(hex(refOmac(E, t, m)));
  });

  test('ctr, including carries across the counter', () => {
    const counters = [
      fill(0xff),
      Uint8Array.from([...new Array(8).fill(1), ...new Array(7).fill(0xff), 0xfe]),
      Uint8Array.from([...new Array(4).fill(7), ...new Array(12).fill(0xff)]),
      Uint8Array.from([...new Array(13).fill(0), 0xff, 0xff, 0xff]),
      pattern(16),
    ];
    for (const c of counters) {
      for (const len of [0, 1, 16, 33, 80]) {
        const d = pattern(len);
        expect(hex(ctr(key, c, d))).toBe(hex(refCtr(E, c, d)));
      }
    }
  });
});

describe('eaxDecrypt', () => {
  const key = fill(0x89);
  const nonce = fill(0x10);

  test.each([0, 1, 15, 16, 17, 100, 1000])('round trip, length %i', (len) => {
    const pt = pattern(len);
    expect(hex(eaxDecrypt(key, nonce, refEaxEncrypt(key, nonce, pt)))).toBe(hex(pt));
  });

  test.each([0, 1, 15, 16, 17, 100, 1000])('bit flips fail authentication, length %i', (len) => {
    const ct = refEaxEncrypt(key, nonce, pattern(len));
    const positions = [len, len + 8, len + 15];
    if (len > 0) positions.push(0, len - 1, len >> 1);
    for (const pos of positions) {
      const bad = ct.slice();
      bad[pos] ^= 1;
      expectAuthFailure(() => eaxDecrypt(key, nonce, bad));
    }
    for (const pos of [0, 7, 15]) {
      const badNonce = nonce.slice();
      badNonce[pos] ^= 0x80;
      expectAuthFailure(() => eaxDecrypt(key, badNonce, ct));
    }
    expectAuthFailure(() => eaxDecrypt(fill(0x8a), nonce, ct));
  });

  test('inputs shorter than the tag fail authentication', () => {
    for (const n of [0, 1, 15]) expectAuthFailure(() => eaxDecrypt(key, nonce, new Uint8Array(n)));
  });

  test('truncated and extended ciphertexts fail authentication', () => {
    const ct = refEaxEncrypt(key, nonce, pattern(100));
    expectAuthFailure(() => eaxDecrypt(key, nonce, ct.subarray(0, ct.length - 1)));
    expectAuthFailure(() => eaxDecrypt(key, nonce, Uint8Array.of(...ct, 0)));
  });

  test('does not mutate its inputs and works on offset views', () => {
    const pt = pattern(100);
    const ct = refEaxEncrypt(key, nonce, pt);
    const copy = ct.slice();
    const host = new Uint8Array(ct.length + 5);
    host.set(ct, 5);
    expect(hex(eaxDecrypt(key, nonce, host.subarray(5)))).toBe(hex(pt));
    eaxDecrypt(key, nonce, ct);
    expect(ct).toEqual(copy);
  });

  test('wrong key length is a programming error, not an auth failure', () => {
    expect(() => eaxDecrypt(new Uint8Array(8), nonce, new Uint8Array(32))).toThrow(RangeError);
  });
});
