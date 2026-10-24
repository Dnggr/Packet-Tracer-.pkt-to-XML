// Derived from pka2xml (c) 2020 Mirco De Zorzi, BSD-2-Clause. See NOTICE.md.
import { type Stage, toConversionError } from './errors';
import { deobfuscate1, deobfuscate3, qUncompress } from './stages';
import { eaxDecrypt } from './twofish-eax';
import { MAX_OUTPUT_BYTES, validateInput, validateOutput } from './validate';

const PT_KEY = new Uint8Array(16).fill(0x89);
const PT_NONCE = new Uint8Array(16).fill(0x10);

export interface StageTiming {
  stage: Stage;
  ms: number;
  inBytes: number;
  outBytes: number;
}

export interface ConvertOptions {
  maxOutputBytes?: number;
  now?: () => number;
  onStage?: (timing: StageTiming) => void;
}

export interface ConvertResult {
  xml: Uint8Array;
  timings: StageTiming[];
}

export async function convert(bytes: Uint8Array, opts: ConvertOptions = {}): Promise<ConvertResult> {
  const now = opts.now ?? (() => performance.now());
  const maxOutput = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const timings: StageTiming[] = [];

  const step = async (
    stage: Stage,
    input: Uint8Array,
    fn: (b: Uint8Array) => Uint8Array | Promise<Uint8Array>,
  ): Promise<Uint8Array> => {
    const start = now();
    let out: Uint8Array;
    try {
      out = await fn(input);
    } catch (e) {
      throw toConversionError(e, stage);
    }
    const timing = { stage, ms: now() - start, inBytes: input.length, outBytes: out.length };
    timings.push(timing);
    opts.onStage?.(timing);
    return out;
  };

  let b = await step('input', bytes, (x) => {
    validateInput(x);
    return x;
  });
  b = await step('deobfuscate1', b, deobfuscate1);
  b = await step('decrypt', b, (x) => eaxDecrypt(PT_KEY, PT_NONCE, x));
  b = await step('deobfuscate2', b, deobfuscate3);
  b = await step('inflate', b, (x) => qUncompress(x, maxOutput));
  b = await step('output', b, (x) => {
    validateOutput(x);
    return x;
  });
  return { xml: b, timings };
}
