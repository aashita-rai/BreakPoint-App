import type { AnalysisResult, RepResult } from '@/lib/squat-types';
import { ApiError, hasApi, type ServerStage, uploadAndAnalyze } from '@/services/api';

import demoBundle from '../../assets/demo/result.json';

// Runs one analysis for the Processing screen: either the real server (upload -> pose
// model -> JSON) or the bundled real analysis result, which works with no network.

export const ANALYSIS_STAGES = [
  'Uploading video',
  'Running pose model',
  'Computing fatigue index',
  'Annotating video',
  'Reading reps',
] as const;

// Share of the progress bar for each part of a real upload. The server's part is
// reported live by its job route, frame by frame.
const UPLOAD_SHARE = [0, 0.15] as const;
const SERVER_SHARE = [0.15, 0.9] as const;
const READING_SHARE = [0.9, 1] as const;
const lerp = ([lo, hi]: readonly [number, number], f: number) => lo + (hi - lo) * Math.min(1, Math.max(0, f));

export type AnalyzeCallbacks = {
  /** fraction is 0–1; stage is one of ANALYSIS_STAGES. */
  onProgress?: (fraction: number, stage: (typeof ANALYSIS_STAGES)[number]) => void;
  /** Called for each rep as the result is read in, so the live panel fills up. */
  onRep?: (rep: RepResult) => void;
  signal?: AbortSignal;
};

/** The demo result bundled with the app (written by code/make_demo_bundle.py). */
export const DEMO_RESULT = demoBundle as AnalysisResult;
export const DEMO_VIDEO: number = require('../../assets/demo/annotated.mp4');

export class NoServerError extends Error {}

export async function analyzeSquatVideo(
  source: { kind: 'upload'; uri: string } | { kind: 'demo' },
  { onProgress, onRep, signal }: AnalyzeCallbacks = {}
): Promise<AnalysisResult> {
  const [upload, pose, fatigue, annotate, reading] = ANALYSIS_STAGES;
  const serverStage: Record<ServerStage, (typeof ANALYSIS_STAGES)[number]> = { pose, fatigue, render: annotate };
  // Never let the number go backwards (e.g. upload progress events arriving late).
  let shown = 0;
  const report = (fraction: number, stage: (typeof ANALYSIS_STAGES)[number]) => {
    shown = Math.max(shown, fraction);
    onProgress?.(shown, stage);
  };
  let result: AnalysisResult;

  if (source.kind === 'demo') {
    // Bundled result: step through the same stages so the screen behaves like a real run.
    for (let k = 0; k <= 10; k++) {
      report(lerp(UPLOAD_SHARE, k / 10), upload);
      await wait(40, signal);
    }
    for (let k = 0; k <= 40; k++) {
      const f = k / 40;
      report(lerp(SERVER_SHARE, f), f < 0.8 ? pose : f < 0.82 ? fatigue : annotate);
      await wait(40, signal);
    }
    result = DEMO_RESULT;
  } else {
    if (!hasApi) throw new NoServerError();
    report(0, upload);
    result = await uploadAndAnalyze(source.uri, {
      signal,
      onUploadProgress: (f) => report(lerp(UPLOAD_SHARE, f), upload),
      onServerProgress: (f, stage) => report(lerp(SERVER_SHARE, f), serverStage[stage]),
    });
  }

  // The server returns the reps all at once; read them in one by one so the live panel
  // shows them arriving.
  const n = Math.max(1, result.reps.length);
  const step = Math.min(120, 2500 / n);
  for (let k = 0; k < result.reps.length; k++) {
    report(lerp(READING_SHARE, (k + 1) / n), reading);
    onRep?.(result.reps[k]);
    await wait(step, signal);
  }
  report(1, reading);
  await wait(300, signal);
  return result;
}

export const isAbort = (e: unknown) => e instanceof ApiError && e.message === 'aborted';

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ApiError('aborted'));
    });
  });
}
