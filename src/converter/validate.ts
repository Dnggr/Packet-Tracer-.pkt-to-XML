// Derived from pka2xml (c) 2020 Mirco De Zorzi, BSD-2-Clause. See NOTICE.md.
import { ConversionError, USER_MESSAGES } from './errors';

const MB = 1024 * 1024;

export const MAX_INPUT_MB = 25;
export const MAX_INPUT_BYTES = MAX_INPUT_MB * MB;
export const MAX_OUTPUT_BYTES = 150 * MB;
export const MIN_INPUT_BYTES = 16;
export const WORKER_TIMEOUT_MS = 60_000;

export function validateInput(bytes: Uint8Array): void {
  const n = bytes.length;
  if (n === 0) throw new ConversionError('E_EMPTY_FILE', 'input');
  if (n > MAX_INPUT_BYTES) {
    throw new ConversionError(
      'E_TOO_LARGE',
      'input',
      `${n} bytes`,
      USER_MESSAGES.E_TOO_LARGE.replace('N', String(MAX_INPUT_MB)),
    );
  }
  if (n < MIN_INPUT_BYTES) throw new ConversionError('E_NOT_PKT', 'input', `${n} bytes`);
}

export function validateOutput(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new ConversionError('E_EMPTY_OUTPUT', 'output');
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  if (bytes[start] !== 0x3c) throw new ConversionError('E_OUTPUT_NOT_XML', 'output');
}
