import type { AnalysisResult, RepResult, SquatVariation } from '@/lib/squat-types';
import { ApiError, hasApi, type ServerStage, uploadAndAnalyze } from '@/services/api';

import demoBundle from '../../assets/demo/result.json';

// Runs one analysis for the Processing screen: either the real server (upload -> pose
// model -> JSON) or the bundled real analysis result, which works with no network.

export const ANALYSIS_STAGES = [
  'Uploading video',
  'Running pose model',
  'Measuring reps and fatigue',
  'Rendering annotated video',
  'Loading results',
] as const;

type Stage = (typeof ANALYSIS_STAGES)[number];

/** Overall progress bands: upload 0-25%, server work 25-90% (real, polled), reading reps 90-100%. */
const UPLOAD_END = 0.25;
const SERVER_END = 0.9;

const SERVER_STAGE: Record<ServerStage, Stage> = {
  queued: 'Running pose model',
  pose: 'Running pose model',
  analysis: 'Measuring reps and fatigue',
  render: 'Rendering annotated video',
  done: 'Loading results',
};

export type AnalyzeCallbacks = {
  /** fraction is 0–1; stage is one of ANALYSIS_STAGES. */
  onProgress?: (fraction: number, stage: Stage) => void;
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
  { onProgress, onRep, signal, squatVariation = 'standard' }: AnalyzeCallbacks & { squatVariation?: SquatVariation } = {}
): Promise<AnalysisResult> {
  const [upload, pose, , , loading] = ANALYSIS_STAGES;
  let result: AnalysisResult;

  if (source.kind === 'demo') {
    onProgress?.(0.1, upload);
    await wait(500, signal);
    onProgress?.(0.4, pose);
    await wait(700, signal);
    result = DEMO_RESULT;
  } else {
    if (!hasApi) throw new NoServerError();
    onProgress?.(0, upload);
    // Some phones never fire upload-progress events, so creep slowly while uploading;
    // real events (and the server's own progress afterwards) take over as soon as they arrive.
    let uploadShown = 0;
    let uploading = true;
    const creep = setInterval(() => {
      if (!uploading) return;
      uploadShown = Math.min(UPLOAD_END * 0.8, uploadShown + 0.005);
      onProgress?.(uploadShown, upload);
    }, 400);
    try {
      result = await uploadAndAnalyze(source.uri, {
        signal,
        squatVariation,
        onUploadProgress: (f) => {
          uploadShown = Math.max(uploadShown, UPLOAD_END * f);
          onProgress?.(uploadShown, upload);
          if (f >= 1) uploading = false;
        },
        onServerProgress: (f, stage) => {
          uploading = false;
          onProgress?.(UPLOAD_END + (SERVER_END - UPLOAD_END) * f, SERVER_STAGE[stage]);
        },
      });
    } finally {
      clearInterval(creep);
    }
  }

  // The server returns everything at once; read the reps in one by one so the
  // live panel shows them arriving.
  const step = Math.min(120, 2500 / Math.max(1, result.reps.length));
  for (let k = 0; k < result.reps.length; k++) {
    onProgress?.(SERVER_END + (1 - SERVER_END) * 0.9 * (k / result.reps.length), loading);
    onRep?.(result.reps[k]);
    await wait(step, signal);
  }
  onProgress?.(1, loading);
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
