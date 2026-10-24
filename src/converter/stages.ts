// Derived from pka2xml (c) 2020 Mirco De Zorzi, BSD-2-Clause. See NOTICE.md.
import { ConversionError } from './errors';

export function deobfuscate1(a: Uint8Array): Uint8Array {
  const n = a.length;
  const step = n & 0xff;
  const b = new Uint8Array(n);
  for (let i = 0, k = step; i < n; i++, k = (k - step) & 0xff) b[i] = a[n - 1 - i] ^ k;
  return b;
}

export function deobfuscate3(a: Uint8Array): Uint8Array {
  const n = a.length;
  const b = new Uint8Array(n);
  for (let i = 0, k = n & 0xff; i < n; i++, k = (k - 1) & 0xff) b[i] = a[i] ^ k;
  return b;
}

export async function qUncompress(data: Uint8Array, maxOutput: number): Promise<Uint8Array> {
  if (data.length < 4) throw new ConversionError('E_INFLATE_FAILED', 'inflate', 'missing size header');
  const size = new DataView(data.buffer, data.byteOffset, 4).getUint32(0);
  if (size > maxOutput) {
    throw new ConversionError('E_OUTPUT_TOO_LARGE', 'inflate', `declared ${size} bytes`);
  }

  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(data.subarray(4) as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxOutput) {
        throw new ConversionError('E_OUTPUT_TOO_LARGE', 'inflate', `over ${maxOutput} bytes`);
      }
      if (total > size) {
        throw new ConversionError('E_INFLATE_FAILED', 'inflate', `over declared ${size} bytes`);
      }
      chunks.push(value);
    }
  } catch (e) {
    reader.cancel().catch(() => {});
    if (e instanceof ConversionError) throw e;
    throw new ConversionError('E_INFLATE_FAILED', 'inflate', e instanceof Error ? e.name : 'stream error');
  }

  if (total !== size) {
    throw new ConversionError('E_INFLATE_FAILED', 'inflate', `inflated ${total}, declared ${size}`);
  }
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
