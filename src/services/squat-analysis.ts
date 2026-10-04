import type { AnalysisResult, RepResult } from '@/lib/squat-types';
import { ApiError, hasApi, uploadAndAnalyze } from '@/services/api';

import demoBundle from '../../assets/demo/result.json';

// Runs one analysis for the Processing screen: either the real server (upload -> pose
// model -> JSON) or the bundled real analysis result, which works with no network.

export const ANALYSIS_STAGES = [
  'Uploading video',
  'Running pose model',
  'Reading reps',
  'Computing fatigue index',
] as const;

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
  const [upload, pose, reading, fatigue] = ANALYSIS_STAGES;
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
    let uploaded = false;
    result = await uploadAndAnalyze(source.uri, {
      signal,
      onUploadProgress: (f) => {
        onProgress?.(0.5 * f, upload);
        if (f >= 1 && !uploaded) {
          uploaded = true;
          onProgress?.(0.55, pose);
        }
      },
    });
  }

  // The server returns everything at once; read the reps in one by one so the
  // live panel shows them arriving.
  const step = Math.min(120, 2500 / Math.max(1, result.reps.length));
  for (let k = 0; k < result.reps.length; k++) {
    onProgress?.(0.6 + 0.3 * (k / result.reps.length), reading);
    onRep?.(result.reps[k]);
    await wait(step, signal);
  }
  onProgress?.(0.95, fatigue);
  await wait(400, signal);
  onProgress?.(1, fatigue);
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
