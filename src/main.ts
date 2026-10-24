import { type ErrorCode, type ErrorInfo, type Stage, USER_MESSAGES } from './converter/errors';
import { MAX_INPUT_BYTES, MAX_INPUT_MB, WORKER_TIMEOUT_MS } from './converter/validate';
import { beginConversion, buildDiagnosticsJson, logFailure, logStage, logSuccess } from './diagnostics';
import type { WorkerResponse } from './worker';

type State = 'idle' | 'selected' | 'converting' | 'done' | 'error';

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

const els = {
  dropzone: byId<HTMLLabelElement>('dropzone'),
  fileInput: byId<HTMLInputElement>('file'),
  fileInfo: byId<HTMLElement>('file-info'),
  fileName: byId<HTMLElement>('file-name'),
  fileSize: byId<HTMLElement>('file-size'),
  convert: byId<HTMLButtonElement>('convert'),
  download: byId<HTMLAnchorElement>('download'),
  reset: byId<HTMLButtonElement>('reset'),
  status: byId<HTMLElement>('status'),
  errorBox: byId<HTMLElement>('error-box'),
  errorDetail: byId<HTMLElement>('error-detail'),
  diagCopy: byId<HTMLButtonElement>('diag-copy'),
  diagText: byId<HTMLTextAreaElement>('diag-text'),
};

const RESET_LABELS: Record<State, string> = {
  idle: '',
  selected: 'Clear',
  converting: 'Cancel',
  done: 'Convert another',
  error: 'Try another file',
};

let state: State = 'idle';
let file: File | null = null;
let worker: Worker | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let objectUrl: string | null = null;
let outputBytes = 0;
let lastError: ErrorInfo | null = null;
let run = 0;

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const outputName = (original: string): string => {
  const base = original
    .replace(/\.pkt$/i, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 100);
  return `${base || 'converted'}.xml`;
};

const errorInfo = (code: ErrorCode, stage: Stage, detail?: string): ErrorInfo => ({
  code,
  stage,
  detail,
  userMessage:
    code === 'E_TOO_LARGE' ? USER_MESSAGES.E_TOO_LARGE.replace('N', String(MAX_INPUT_MB)) : USER_MESSAGES[code],
});

const describe = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : typeof e);

function statusText(): string {
  switch (state) {
    case 'selected':
      return 'Ready to convert.';
    case 'converting':
      return 'Converting…';
    case 'done':
      return `Done. The XML is ${formatBytes(outputBytes)}.`;
    case 'error':
      return lastError?.userMessage ?? '';
    default:
      return '';
  }
}

function render(): void {
  const hasFile = file !== null && (state === 'selected' || state === 'converting' || state === 'done');
  els.dropzone.hidden = state !== 'idle' && state !== 'selected';
  els.fileInfo.hidden = !hasFile;
  els.convert.hidden = state !== 'selected' && state !== 'converting';
  els.convert.disabled = state === 'converting';
  els.download.hidden = state !== 'done';
  els.reset.hidden = state === 'idle';
  els.reset.textContent = RESET_LABELS[state];
  els.errorBox.hidden = state !== 'error';
  els.status.textContent = statusText();
  if (hasFile && file) {
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatBytes(file.size);
  }
  if (state === 'error' && lastError) {
    els.errorDetail.textContent = `Error code: ${lastError.code} (stage: ${lastError.stage})`;
  }
}

function setState(next: State): void {
  state = next;
  render();
}

function release(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  worker?.terminate();
  worker = null;
}

function revokeUrl(): void {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  els.download.removeAttribute('href');
  els.download.removeAttribute('download');
}

function fail(info: ErrorInfo): void {
  lastError = info;
  els.diagText.hidden = true;
  logFailure(info);
  setState('error');
}

function reset(): void {
  run++;
  release();
  revokeUrl();
  file = null;
  lastError = null;
  outputBytes = 0;
  els.fileInput.value = '';
  els.diagText.hidden = true;
  setState('idle');
}

function select(candidate: File): void {
  if (state !== 'idle' && state !== 'selected') return;
  if (!/\.pkt$/i.test(candidate.name)) {
    file = null;
    beginConversion(candidate.size);
    fail(errorInfo('E_BAD_EXTENSION', 'ui'));
    return;
  }
  if (candidate.size > MAX_INPUT_BYTES) {
    file = null;
    beginConversion(candidate.size);
    fail(errorInfo('E_TOO_LARGE', 'ui', `${candidate.size} bytes`));
    return;
  }
  file = candidate;
  setState('selected');
}

function succeed(response: Extract<WorkerResponse, { ok: true }>, source: File): void {
  response.timings.forEach((t) => logStage(t));
  try {
    objectUrl = URL.createObjectURL(new Blob([response.xml], { type: 'application/xml' }));
  } catch (e) {
    fail(errorInfo('E_DOWNLOAD_FAILED', 'ui', describe(e)));
    return;
  }
  els.download.href = objectUrl;
  els.download.download = outputName(source.name);
  outputBytes = response.xml.byteLength;
  logSuccess(outputBytes);
  setState('done');
}

async function startConversion(): Promise<void> {
  if (state !== 'selected' || !file) return;
  const source = file;
  const id = ++run;
  setState('converting');
  beginConversion(source.size);

  let input: ArrayBuffer;
  try {
    input = await source.arrayBuffer();
  } catch (e) {
    if (id === run) fail(errorInfo('E_UNEXPECTED', 'ui', describe(e)));
    return;
  }
  if (id !== run) return;

  let w: Worker;
  try {
    w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    fail(errorInfo('E_WORKER_FAILED', 'worker', describe(e)));
    return;
  }
  worker = w;

  timer = setTimeout(() => {
    if (id !== run) return;
    release();
    fail(errorInfo('E_TIMEOUT', 'worker'));
  }, WORKER_TIMEOUT_MS);

  w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    if (id !== run) return;
    release();
    const response = ev.data;
    if (response.ok) {
      succeed(response, source);
      return;
    }
    response.timings.forEach((t) => logStage(t));
    fail(response.error);
  };
  w.onerror = (ev) => {
    if (id !== run) return;
    ev.preventDefault();
    release();
    fail(errorInfo('E_WORKER_FAILED', 'worker', ev.message));
  };
  w.onmessageerror = () => {
    if (id !== run) return;
    release();
    fail(errorInfo('E_WORKER_FAILED', 'worker', 'messageerror'));
  };
  w.postMessage(input, [input]);
}

async function copyDiagnostics(): Promise<void> {
  const json = buildDiagnosticsJson();
  try {
    await navigator.clipboard.writeText(json);
    els.diagCopy.textContent = 'Copied';
    setTimeout(() => {
      els.diagCopy.textContent = 'Copy diagnostics';
    }, 2000);
  } catch {
    els.diagText.value = json;
    els.diagText.hidden = false;
    els.diagText.select();
  }
}

els.fileInput.addEventListener('change', () => {
  const chosen = els.fileInput.files?.[0];
  els.fileInput.value = '';
  if (chosen) select(chosen);
});

els.convert.addEventListener('click', () => {
  void startConversion();
});
els.reset.addEventListener('click', reset);
els.diagCopy.addEventListener('click', () => {
  void copyDiagnostics();
});

const acceptsDrop = (): boolean => state === 'idle' || state === 'selected';

els.dropzone.addEventListener('dragenter', (ev) => {
  ev.preventDefault();
  if (acceptsDrop()) els.dropzone.classList.add('dragging');
});
els.dropzone.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  if (acceptsDrop()) els.dropzone.classList.add('dragging');
});
els.dropzone.addEventListener('dragleave', () => {
  els.dropzone.classList.remove('dragging');
});
els.dropzone.addEventListener('drop', (ev) => {
  ev.preventDefault();
  els.dropzone.classList.remove('dragging');
  const dropped = ev.dataTransfer?.files[0];
  if (dropped && acceptsDrop()) select(dropped);
});

window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', (ev) => ev.preventDefault());

render();
