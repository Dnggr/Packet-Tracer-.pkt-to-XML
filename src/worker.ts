import { convert, type StageTiming } from './converter/convert';
import { ConversionError, type ErrorInfo, toConversionError, toErrorInfo } from './converter/errors';

export type WorkerResponse =
  | { ok: true; xml: ArrayBuffer; timings: StageTiming[] }
  | { ok: false; error: ErrorInfo; timings: StageTiming[] };

interface WorkerScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

const exactBuffer = (u: Uint8Array): ArrayBuffer =>
  (u.byteOffset === 0 && u.byteLength === u.buffer.byteLength ? u.buffer : u.slice().buffer) as ArrayBuffer;

scope.onmessage = async (ev) => {
  const timings: StageTiming[] = [];
  try {
    if (!(ev.data instanceof ArrayBuffer)) {
      throw new ConversionError('E_UNEXPECTED', 'worker', 'message is not an ArrayBuffer');
    }
    const { xml } = await convert(new Uint8Array(ev.data), { onStage: (t) => timings.push(t) });
    const buffer = exactBuffer(xml);
    scope.postMessage({ ok: true, xml: buffer, timings }, [buffer]);
  } catch (e) {
    scope.postMessage({ ok: false, error: toErrorInfo(toConversionError(e, 'worker')), timings });
  }
};
