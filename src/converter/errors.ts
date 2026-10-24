// Derived from pka2xml (c) 2020 Mirco De Zorzi, BSD-2-Clause. See NOTICE.md.
export type Stage =
  | 'input'
  | 'deobfuscate1'
  | 'decrypt'
  | 'deobfuscate2'
  | 'inflate'
  | 'output'
  | 'worker'
  | 'ui';

export const USER_MESSAGES = {
  E_NO_FILE: 'Choose a .pkt file first.',
  E_BAD_EXTENSION: 'Only .pkt files are supported.',
  E_EMPTY_FILE: 'The file is empty.',
  E_TOO_LARGE: 'File is larger than the N MB limit.',
  E_NOT_PKT: "This doesn't look like a Packet Tracer file.",
  E_UNSUPPORTED_FORMAT: "Very old Packet Tracer files aren't supported.",
  E_AUTH_FAILED:
    "Couldn't decrypt: file is corrupted, not a .pkt, or from an unsupported Packet Tracer version.",
  E_INFLATE_FAILED: 'Decryption worked but the content is damaged.',
  E_OUTPUT_TOO_LARGE: 'Converted XML would be too large for the browser.',
  E_EMPTY_OUTPUT: 'Conversion produced no data.',
  E_OUTPUT_NOT_XML: "Conversion produced something that isn't XML.",
  E_TIMEOUT: 'Conversion took too long and was stopped.',
  E_WORKER_FAILED: "Your browser couldn't start the converter.",
  E_OUT_OF_MEMORY: "The file is too big for this device's memory.",
  E_DOWNLOAD_FAILED: 'Download failed. Try the button again.',
  E_UNEXPECTED: 'Something went wrong. Copy diagnostics and report it.',
} as const;

export type ErrorCode = keyof typeof USER_MESSAGES;

export interface ErrorInfo {
  code: ErrorCode;
  stage: Stage;
  userMessage: string;
  detail?: string;
}

export class ConversionError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly stage: Stage,
    readonly detail?: string,
    readonly userMessage: string = USER_MESSAGES[code],
  ) {
    super(code);
    this.name = 'ConversionError';
  }
}

export function toConversionError(e: unknown, stage: Stage): ConversionError {
  if (e instanceof ConversionError) return e;
  if (e instanceof RangeError) {
    return new ConversionError('E_OUT_OF_MEMORY', 'worker', `${stage}: ${e.message}`);
  }
  return new ConversionError(
    'E_UNEXPECTED',
    stage,
    e instanceof Error ? `${e.name}: ${e.message}` : typeof e,
  );
}

export function toErrorInfo(e: ConversionError): ErrorInfo {
  return { code: e.code, stage: e.stage, userMessage: e.userMessage, detail: e.detail };
}
