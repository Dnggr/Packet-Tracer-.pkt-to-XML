export const APP_VERSION = '0.1.0';
export const UPSTREAM_COMMIT = '22fee2681779a6dd764d6562b0a134ceb339e770';

interface StageLog {
  stage: string;
  ms: number;
  inBytes: number;
  outBytes: number;
}

interface FailureLog {
  code: string;
  stage: string;
  detail?: string;
}

interface ConversionRecord {
  id: string;
  inputBytes: number;
  outputBytes?: number;
  stages: StageLog[];
  failure?: FailureLog;
}

let current: ConversionRecord | undefined;

const round1 = (n: number): number => Math.round(n * 10) / 10;

const line = (entry: object): string => `pkt2xml ${JSON.stringify(entry)}`;

export function beginConversion(inputBytes: number): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  current = { id, inputBytes, stages: [] };
  return id;
}

export function logStage(t: StageLog): void {
  if (!current) return;
  const stage = { stage: t.stage, ms: round1(t.ms), inBytes: t.inBytes, outBytes: t.outBytes };
  current.stages.push(stage);
  console.info(line({ id: current.id, ...stage }));
}

export function logSuccess(outputBytes: number): void {
  if (!current) return;
  current.outputBytes = outputBytes;
  console.info(line({ id: current.id, ok: true, inputBytes: current.inputBytes, outputBytes }));
}

export function logFailure(f: FailureLog): void {
  if (!current) return;
  current.failure = { code: f.code, stage: f.stage, detail: f.detail };
  console.error(line({ id: current.id, ok: false, code: f.code, stage: f.stage, detail: f.detail }));
}

export function buildDiagnosticsJson(): string {
  return JSON.stringify(
    {
      appVersion: APP_VERSION,
      upstreamCommit: UPSTREAM_COMMIT,
      conversionId: current?.id,
      code: current?.failure?.code,
      stage: current?.failure?.stage,
      detail: current?.failure?.detail,
      inputBytes: current?.inputBytes,
      outputBytes: current?.outputBytes,
      stages: current?.stages,
      userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    },
    null,
    2,
  );
}
