// Derived from pka2xml (c) 2020 Mirco De Zorzi, BSD-2-Clause. See NOTICE.md.
import { ConversionError } from './errors';

type Encrypt = (s: Int32Array) => void;

const TAG_BYTES = 16;

const Q_T = [
  [
    [8, 1, 7, 13, 6, 15, 3, 2, 0, 11, 5, 9, 14, 12, 10, 4],
    [14, 12, 11, 8, 1, 2, 3, 5, 15, 4, 10, 6, 7, 0, 9, 13],
    [11, 10, 5, 14, 6, 13, 9, 0, 12, 8, 15, 3, 2, 4, 7, 1],
    [13, 7, 15, 4, 1, 2, 6, 14, 9, 11, 3, 0, 8, 5, 12, 10],
  ],
  [
    [2, 8, 11, 13, 15, 7, 6, 14, 3, 1, 9, 4, 0, 10, 12, 5],
    [1, 14, 2, 11, 4, 12, 3, 7, 6, 13, 10, 5, 15, 9, 0, 8],
    [4, 12, 7, 5, 1, 6, 9, 10, 0, 14, 13, 8, 2, 11, 3, 15],
    [11, 9, 5, 1, 12, 3, 13, 14, 6, 4, 7, 15, 2, 0, 8, 10],
  ],
];

const MDS = [
  [0x01, 0xef, 0x5b, 0x5b],
  [0x5b, 0xef, 0xef, 0x01],
  [0xef, 0x5b, 0x01, 0xef],
  [0xef, 0x01, 0xef, 0x5b],
];

const RS = [
  [0x01, 0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e],
  [0xa4, 0x56, 0x82, 0xf3, 0x1e, 0xc6, 0x68, 0xe5],
  [0x02, 0xa1, 0xfc, 0xc1, 0x47, 0xae, 0x3d, 0x19],
  [0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e, 0x03],
];

function gmul(a: number, b: number, poly: number): number {
  let r = 0;
  for (; b; b >>= 1) {
    if (b & 1) r ^= a;
    a <<= 1;
    if (a & 0x100) a ^= poly;
  }
  return r;
}

const ror4 = (x: number): number => ((x >> 1) | (x << 3)) & 15;

function buildQ(t: number[][]): Uint8Array {
  const q = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    const a0 = x >> 4;
    const b0 = x & 15;
    const a2 = t[0][a0 ^ b0];
    const b2 = t[1][a0 ^ ror4(b0) ^ ((a0 << 3) & 15)];
    const a3 = a2 ^ b2;
    const b3 = a2 ^ ror4(b2) ^ ((a2 << 3) & 15);
    q[x] = (t[3][b3] << 4) | t[2][a3];
  }
  return q;
}

const Q0 = buildQ(Q_T[0]);
const Q1 = buildQ(Q_T[1]);
const CHAIN = [
  [Q0, Q0, Q1],
  [Q1, Q0, Q0],
  [Q0, Q1, Q1],
  [Q1, Q1, Q0],
];

const MDS_TABLE = MDS[0].map((_, j) => {
  const t = new Int32Array(256);
  for (let z = 0; z < 256; z++) {
    let w = 0;
    for (let i = 0; i < 4; i++) w |= gmul(z, MDS[i][j], 0x169) << (8 * i);
    t[z] = w;
  }
  return t;
});

const rol = (x: number, n: number): number => (x << n) | (x >>> (32 - n));
const ror = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
const bswap = (x: number): number =>
  (x << 24) | ((x & 0xff00) << 8) | ((x >>> 8) & 0xff00) | (x >>> 24);
const load = (d: Uint8Array, o: number): number =>
  d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24);

function hByte(j: number, x: number, l0: number, l1: number): number {
  const [first, second, outer] = CHAIN[j];
  return MDS_TABLE[j][outer[second[first[x] ^ ((l1 >>> (8 * j)) & 255)] ^ ((l0 >>> (8 * j)) & 255)]];
}

function h(x: number, l0: number, l1: number): number {
  return (
    hByte(0, x & 255, l0, l1) ^
    hByte(1, (x >>> 8) & 255, l0, l1) ^
    hByte(2, (x >>> 16) & 255, l0, l1) ^
    hByte(3, x >>> 24, l0, l1)
  );
}

function rsWord(key: Uint8Array, offset: number): number {
  let w = 0;
  for (let r = 0; r < 4; r++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b ^= gmul(key[offset + j], RS[r][j], 0x14d);
    w |= b << (8 * r);
  }
  return w;
}

function makeEncrypt(key: Uint8Array): Encrypt {
  if (key.length !== 16) throw new RangeError('Twofish key must be 16 bytes');
  const m0 = load(key, 0);
  const m1 = load(key, 4);
  const m2 = load(key, 8);
  const m3 = load(key, 12);

  const k = new Int32Array(40);
  for (let i = 0; i < 20; i++) {
    const a = h(2 * i * 0x01010101, m0, m2);
    const b = rol(h((2 * i + 1) * 0x01010101, m1, m3), 8);
    k[2 * i] = a + b;
    k[2 * i + 1] = rol(a + 2 * b, 9);
  }

  const l0 = rsWord(key, 8);
  const l1 = rsWord(key, 0);
  const sb = new Int32Array(1024);
  for (let j = 0; j < 4; j++) for (let x = 0; x < 256; x++) sb[j * 256 + x] = hByte(j, x, l0, l1);
  const g = (x: number): number =>
    sb[x & 255] ^ sb[256 + ((x >>> 8) & 255)] ^ sb[512 + ((x >>> 16) & 255)] ^ sb[768 + (x >>> 24)];

  return (s) => {
    let r0 = s[0] ^ k[0];
    let r1 = s[1] ^ k[1];
    let r2 = s[2] ^ k[2];
    let r3 = s[3] ^ k[3];
    for (let r = 0; r < 8; r++) {
      let t0 = g(r0);
      let t1 = g(rol(r1, 8));
      r2 = ror(r2 ^ (t0 + t1 + k[4 * r + 8]), 1);
      r3 = rol(r3, 1) ^ (t0 + 2 * t1 + k[4 * r + 9]);
      t0 = g(r2);
      t1 = g(rol(r3, 8));
      r0 = ror(r0 ^ (t0 + t1 + k[4 * r + 10]), 1);
      r1 = rol(r1, 1) ^ (t0 + 2 * t1 + k[4 * r + 11]);
    }
    s[0] = r2 ^ k[4];
    s[1] = r3 ^ k[5];
    s[2] = r0 ^ k[6];
    s[3] = r1 ^ k[7];
  };
}

export function createTwofish(key: Uint8Array): {
  encryptBlock(block16: Uint8Array): Uint8Array;
} {
  const enc = makeEncrypt(key);
  return {
    encryptBlock(block16) {
      if (block16.length !== 16) throw new RangeError('Twofish block must be 16 bytes');
      const s = new Int32Array(4);
      for (let i = 0; i < 4; i++) s[i] = load(block16, 4 * i);
      enc(s);
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = s[i >> 2] >>> (8 * (i & 3));
      return out;
    },
  };
}

function cmacSubkeys(enc: Encrypt): [Int32Array, Int32Array] {
  const l = new Int32Array(4);
  enc(l);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = l[i >> 2] >>> (8 * (i & 3));
  const double = (b: Uint8Array): void => {
    const carry = b[0] >> 7;
    for (let i = 0; i < 15; i++) b[i] = (b[i] << 1) | (b[i + 1] >> 7);
    b[15] = (b[15] << 1) ^ (carry * 0x87);
  };
  double(bytes);
  const k1 = new Int32Array(4);
  for (let i = 0; i < 4; i++) k1[i] = load(bytes, 4 * i);
  double(bytes);
  const k2 = new Int32Array(4);
  for (let i = 0; i < 4; i++) k2[i] = load(bytes, 4 * i);
  return [k1, k2];
}

function omacRun(
  enc: Encrypt,
  sub: [Int32Array, Int32Array],
  tweak: number,
  d: Uint8Array,
  from: number,
  to: number,
): Int32Array {
  const s = new Int32Array(4);
  s[3] = tweak << 24;
  const len = to - from;
  if (len === 0) {
    for (let i = 0; i < 4; i++) s[i] ^= sub[0][i];
    enc(s);
    return s;
  }
  enc(s);
  const last = from + (((len - 1) >> 4) << 4);
  for (let p = from; p < last; p += 16) {
    s[0] ^= load(d, p);
    s[1] ^= load(d, p + 4);
    s[2] ^= load(d, p + 8);
    s[3] ^= load(d, p + 12);
    enc(s);
  }
  const rem = to - last;
  const blk = new Uint8Array(16);
  blk.set(d.subarray(last, to));
  if (rem < 16) blk[rem] = 0x80;
  const k = sub[rem === 16 ? 0 : 1];
  for (let i = 0; i < 4; i++) s[i] ^= load(blk, 4 * i) ^ k[i];
  enc(s);
  return s;
}

function ctrRun(enc: Encrypt, counter: Int32Array, d: Uint8Array, from: number, to: number): Uint8Array {
  const out = new Uint8Array(to - from);
  const s = new Int32Array(4);
  let w0 = counter[0];
  let w1 = counter[1];
  let w2 = counter[2];
  let c0 = bswap(w0);
  let c1 = bswap(w1);
  let c2 = bswap(w2);
  let c3 = bswap(counter[3]);
  for (let p = 0; p < out.length; p += 16) {
    s[0] = w0;
    s[1] = w1;
    s[2] = w2;
    s[3] = bswap(c3);
    enc(s);
    const n = Math.min(16, out.length - p);
    if (n === 16) {
      for (let j = 0, q = p; j < 4; j++, q += 4) {
        const ks = s[j];
        out[q] = d[from + q] ^ ks;
        out[q + 1] = d[from + q + 1] ^ (ks >>> 8);
        out[q + 2] = d[from + q + 2] ^ (ks >>> 16);
        out[q + 3] = d[from + q + 3] ^ (ks >>> 24);
      }
    } else {
      for (let j = 0; j < n; j++) out[p + j] = d[from + p + j] ^ (s[j >> 2] >>> (8 * (j & 3)));
    }
    c3 = (c3 + 1) | 0;
    if (c3 === 0) {
      c2 = (c2 + 1) | 0;
      w2 = bswap(c2);
      if (c2 === 0) {
        c1 = (c1 + 1) | 0;
        w1 = bswap(c1);
        if (c1 === 0) {
          c0 = (c0 + 1) | 0;
          w0 = bswap(c0);
        }
      }
    }
  }
  return out;
}

export function omac(key: Uint8Array, tweak: number, data: Uint8Array): Uint8Array {
  const enc = makeEncrypt(key);
  const s = omacRun(enc, cmacSubkeys(enc), tweak, data, 0, data.length);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = s[i >> 2] >>> (8 * (i & 3));
  return out;
}

export function ctr(key: Uint8Array, counter16: Uint8Array, data: Uint8Array): Uint8Array {
  if (counter16.length !== 16) throw new RangeError('Counter block must be 16 bytes');
  const c = new Int32Array(4);
  for (let i = 0; i < 4; i++) c[i] = load(counter16, 4 * i);
  return ctrRun(makeEncrypt(key), c, data, 0, data.length);
}

export function eaxDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertextWithTag: Uint8Array,
): Uint8Array {
  const n = ciphertextWithTag.length - TAG_BYTES;
  if (n < 0) throw new ConversionError('E_AUTH_FAILED', 'decrypt', 'shorter than tag');
  const enc = makeEncrypt(key);
  const sub = cmacSubkeys(enc);
  const tn = omacRun(enc, sub, 0, nonce, 0, nonce.length);
  const th = omacRun(enc, sub, 1, ciphertextWithTag, 0, 0);
  const tc = omacRun(enc, sub, 2, ciphertextWithTag, 0, n);
  let diff = 0;
  for (let i = 0; i < 4; i++) diff |= tn[i] ^ th[i] ^ tc[i] ^ load(ciphertextWithTag, n + 4 * i);
  if (diff !== 0) throw new ConversionError('E_AUTH_FAILED', 'decrypt');
  return ctrRun(enc, tn, ciphertextWithTag, 0, n);
}
