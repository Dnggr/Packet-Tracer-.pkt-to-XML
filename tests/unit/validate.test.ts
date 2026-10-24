import { describe, expect, test } from 'vitest';
import {
  ConversionError,
  type ErrorCode,
  type Stage,
  USER_MESSAGES,
  toConversionError,
  toErrorInfo,
} from '../../src/converter/errors';
import {
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  MIN_INPUT_BYTES,
  validateInput,
  validateOutput,
} from '../../src/converter/validate';

function expectError(run: () => unknown, code: ErrorCode, stage: Stage): ConversionError {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(ConversionError);
    expect(e).toMatchObject({ code, stage });
    return e as ConversionError;
  }
  throw new Error(`expected ${code}`);
}

const ALL_CODES: ErrorCode[] = [
  'E_NO_FILE',
  'E_BAD_EXTENSION',
  'E_EMPTY_FILE',
  'E_TOO_LARGE',
  'E_NOT_PKT',
  'E_UNSUPPORTED_FORMAT',
  'E_AUTH_FAILED',
  'E_INFLATE_FAILED',
  'E_OUTPUT_TOO_LARGE',
  'E_EMPTY_OUTPUT',
  'E_OUTPUT_NOT_XML',
  'E_TIMEOUT',
  'E_WORKER_FAILED',
  'E_OUT_OF_MEMORY',
  'E_DOWNLOAD_FAILED',
  'E_UNEXPECTED',
];

describe('limits', () => {
  test('values match SECURITY_AND_PRIVACY section 4', () => {
    expect(MAX_INPUT_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_OUTPUT_BYTES).toBe(150 * 1024 * 1024);
    expect(MIN_INPUT_BYTES).toBe(16);
  });
});

describe('validateInput', () => {
  test('empty input', () => {
    expectError(() => validateInput(new Uint8Array(0)), 'E_EMPTY_FILE', 'input');
  });

  test.each([1, 2, 8, 15])('%i bytes is too small', (n) => {
    expectError(() => validateInput(new Uint8Array(n)), 'E_NOT_PKT', 'input');
  });

  test.each([16, 17, 1000, MAX_INPUT_BYTES])('%i bytes is accepted', (n) => {
    expect(() => validateInput(new Uint8Array(n))).not.toThrow();
  });

  test('limit + 1 is too large and the message names the limit', () => {
    const e = expectError(() => validateInput(new Uint8Array(MAX_INPUT_BYTES + 1)), 'E_TOO_LARGE', 'input');
    expect(e.userMessage).toBe('File is larger than the 25 MB limit.');
  });
});

describe('validateOutput', () => {
  const xml = (...b: number[]) => Uint8Array.of(...b);
  const BOM = [0xef, 0xbb, 0xbf];

  test('empty output', () => {
    expectError(() => validateOutput(new Uint8Array(0)), 'E_EMPTY_OUTPUT', 'output');
  });

  test.each([[[0x41]], [[0x20, 0x3c]], [[0x00]], [[0xff, 0xfe, 0x3c]]])('%j is not XML', (b) => {
    expectError(() => validateOutput(xml(...b)), 'E_OUTPUT_NOT_XML', 'output');
  });

  test('a BOM alone or followed by a non-"<" byte is not XML', () => {
    expectError(() => validateOutput(xml(...BOM)), 'E_OUTPUT_NOT_XML', 'output');
    expectError(() => validateOutput(xml(...BOM, 0x41)), 'E_OUTPUT_NOT_XML', 'output');
  });

  test('"<" with or without a leading BOM is accepted', () => {
    expect(() => validateOutput(xml(0x3c))).not.toThrow();
    expect(() => validateOutput(xml(...BOM, 0x3c))).not.toThrow();
    expect(() => validateOutput(xml(0x3c, 0x3f, 0x78, 0x6d, 0x6c))).not.toThrow();
  });
});

describe('errors', () => {
  test('the code list matches ARCHITECTURE section 4 exactly', () => {
    expect(Object.keys(USER_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
  });

  test.each(ALL_CODES)('%s has a non-empty user message', (code) => {
    expect(USER_MESSAGES[code].trim().length).toBeGreaterThan(0);
  });

  test('ConversionError carries code, stage, detail and the default message', () => {
    const e = new ConversionError('E_AUTH_FAILED', 'decrypt', '16 bytes');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ConversionError');
    expect([e.code, e.stage, e.detail, e.userMessage]).toEqual([
      'E_AUTH_FAILED',
      'decrypt',
      '16 bytes',
      USER_MESSAGES.E_AUTH_FAILED,
    ]);
    expect(new ConversionError('E_EMPTY_FILE', 'input').detail).toBeUndefined();
    expect(new ConversionError('E_TOO_LARGE', 'input', undefined, 'custom').userMessage).toBe('custom');
  });

  test('toConversionError passes ConversionError through unchanged', () => {
    const e = new ConversionError('E_INFLATE_FAILED', 'inflate');
    expect(toConversionError(e, 'worker')).toBe(e);
  });

  test('toConversionError wraps unknown errors as E_UNEXPECTED at the given stage', () => {
    const wrapped = toConversionError(new TypeError('boom'), 'decrypt');
    expect([wrapped.code, wrapped.stage, wrapped.detail, wrapped.userMessage]).toEqual([
      'E_UNEXPECTED',
      'decrypt',
      'TypeError: boom',
      USER_MESSAGES.E_UNEXPECTED,
    ]);
    expect(toConversionError('text', 'ui')).toMatchObject({ code: 'E_UNEXPECTED', stage: 'ui', detail: 'string' });
    expect(toConversionError(undefined, 'input').detail).toBe('undefined');
  });

  test('toConversionError maps allocation failures to E_OUT_OF_MEMORY', () => {
    const wrapped = toConversionError(new RangeError('Array buffer allocation failed'), 'inflate');
    expect([wrapped.code, wrapped.stage, wrapped.detail]).toEqual([
      'E_OUT_OF_MEMORY',
      'worker',
      'inflate: Array buffer allocation failed',
    ]);
  });

  test('toErrorInfo gives a plain object that survives structured clone', () => {
    const info = toErrorInfo(new ConversionError('E_TOO_LARGE', 'input', '9 bytes', 'custom'));
    expect(info).toEqual({ code: 'E_TOO_LARGE', stage: 'input', userMessage: 'custom', detail: '9 bytes' });
    expect(Object.getPrototypeOf(info)).toBe(Object.prototype);
    expect(structuredClone(info)).toEqual(info);
  });
});
