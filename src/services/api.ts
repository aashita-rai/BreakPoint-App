import type { AnalysisResult, CheckIn, Insights, MismatchStatus, SquatVariation } from '@/lib/squat-types';
import { Platform } from 'react-native';

// Thin client for the FastAPI server in code/api/main.py.
// Start the app with EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
export const ENDPOINTS = {
  health: '/health',
  /** POST starts a background analysis and returns { job_id }; GET /analyze/jobs/{id} polls it. */
  analysisJobs: '/analyze/jobs',
  // Added by server/breakpoint_extras.py:
  transcribe: '/transcribe',
  insights: '/insights',
  weeklyDashboard: '/dashboard/weekly',
} as const;
const UPLOAD_FIELD = 'file';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const hasApi = API_URL.length > 0;

export class ApiError extends Error {}

export type WeeklyDashboard = {
  days: number;
  sets: number;
  average_rfi: number | null;
  follow_ups: number;
  variations: Record<string, number>;
};

export async function requestWeeklyDashboard(): Promise<WeeklyDashboard> {
  if (!hasApi) throw new ApiError('No server configured.');
  const res = await fetch(`${API_URL}${ENDPOINTS.weeklyDashboard}`);
  if (!res.ok) throw new ApiError(`Server error ${res.status}.`);
  return (await res.json()) as WeeklyDashboard;
}

export async function checkHealth(): Promise<boolean> {
  if (!hasApi) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${API_URL}${ENDPOINTS.health}`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Server-side analysis stages reported by GET /analyze/jobs/{id}. */
export type ServerStage = 'queued' | 'pose' | 'analysis' | 'render' | 'done';

type JobStatus = {
  status: 'queued' | 'running' | 'done' | 'error';
  stage: ServerStage;
  /** 0-1 across the server's work (pose, analysis, annotated-video render). */
  progress: number;
  result: Json | null;
  error: string | null;
};

/**
 * Uploads the video, then polls the server's background job until the pose model, analysis and
 * annotated video are done. Polling keeps every request short, so progress is real and Cloudflare
 * quick tunnels (which cut responses after ~100 s) never time out on long videos.
 */
export async function uploadAndAnalyze(
  uri: string,
  {
    onUploadProgress,
    onServerProgress,
    signal,
    squatVariation,
  }: {
    onUploadProgress?: (fraction: number) => void;
    onServerProgress?: (fraction: number, stage: ServerStage) => void;
    signal?: AbortSignal;
    squatVariation?: SquatVariation;
  } = {}
): Promise<AnalysisResult> {
  const jobId = await startAnalysisJob(uri, { onUploadProgress, signal, squatVariation });
  let failures = 0;
  for (;;) {
    await sleep(800, signal);
    let job: JobStatus;
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.analysisJobs}/${jobId}`, { signal });
      if (!res.ok) throw new ApiError(await errorText(res));
      job = (await res.json()) as JobStatus;
      failures = 0;
    } catch (e) {
      if (signal?.aborted) throw new ApiError('aborted');
      // Ride out brief network blips (phone Wi-Fi, tunnel reconnects) before giving up.
      if (++failures >= 5) throw e instanceof ApiError ? e : new ApiError(`Lost contact with the server at ${API_URL}.`);
      continue;
    }
    if (job.status === 'error') throw new ApiError(job.error ?? 'The server could not analyze this video.');
    if (job.status === 'done' && job.result) return normalizeResult(job.result);
    onServerProgress?.(isNum(job.progress) ? job.progress : 0, job.stage);
  }
}

function startAnalysisJob(
  uri: string,
  { onUploadProgress, signal, squatVariation }: { onUploadProgress?: (fraction: number) => void; signal?: AbortSignal; squatVariation?: SquatVariation }
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!hasApi) return reject(new ApiError('No server configured.'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${ENDPOINTS.analysisJobs}`);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onUploadProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 404 || xhr.status === 405) {
        return reject(new ApiError('This server has no /analyze/jobs route. Restart FastAPI so it picks up the latest code.'));
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(new ApiError(`Server error ${xhr.status}${detailOf(xhr.responseText)}`));
      }
      try {
        const id = JSON.parse(xhr.responseText)?.job_id;
        if (typeof id !== 'string') throw new Error();
        onUploadProgress?.(1);
        resolve(id);
      } catch {
        reject(new ApiError('The server sent a response the app could not read.'));
      }
    };
    xhr.onerror = () => reject(new ApiError(`Could not reach the server at ${API_URL}.`));
    signal?.addEventListener('abort', () => {
      xhr.abort();
      reject(new ApiError('aborted'));
    });

    const form = new FormData();
    form.append('squat_variation', squatVariation ?? 'standard');
    const name = uri.split('/').pop() || 'squats.mp4';
    if (Platform.OS === 'web') {
      // Browsers need a real Blob; the { uri, name, type } object only works on iOS/Android.
      fetch(uri)
        .then((r) => r.blob())
        .then((blob) => {
          const fname = /\.(mp4|mov|m4v|webm)$/i.test(name) ? name : (blob.type.includes('quicktime') ? 'clip.mov' : 'clip.mp4');
          form.append(UPLOAD_FIELD, blob, fname);
          xhr.send(form);
        })
        .catch(() => reject(new ApiError('Could not read the selected video.')));
    } else {
      // React Native's FormData accepts { uri, name, type } for files.
      const type = /\.mov$/i.test(name) ? 'video/quicktime' : 'video/mp4';
      form.append(UPLOAD_FIELD, { uri, name, type } as unknown as Blob);
      xhr.send(form);
    }
  });
}

function detailOf(text: string) {
  try {
    const d = JSON.parse(text)?.detail;
    const msg = typeof d === 'string' ? d : d ? JSON.stringify(d).slice(0, 200) : '';
    return msg ? `: ${msg}` : '.';
  } catch {
    return '.';
  }
}

async function errorText(res: Response) {
  return `Server error ${res.status}${detailOf(await res.text().catch(() => ''))}`;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ApiError('aborted'));
    });
  });
}

/** Sends a voice recording to the server (Whisper) and returns the text. */
export async function transcribeAudio(uri: string): Promise<string> {
  if (!hasApi) throw new ApiError('No server configured.');
  const form = new FormData();
  const name = uri.split('/').pop() || 'voice.m4a';
  form.append(UPLOAD_FIELD, { uri, name, type: 'audio/m4a' } as unknown as Blob);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${API_URL}${ENDPOINTS.transcribe}`, { method: 'POST', body: form, signal: controller.signal });
    if (!res.ok) throw new ApiError(`Transcription failed (server error ${res.status}).`);
    const body = (await res.json()) as { text?: unknown };
    if (typeof body.text !== 'string') throw new ApiError('The transcription response had no text.');
    return body.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** AI analyzer: asks Gemini (on the server) to explain measured fatigue and the check-in. */
export async function requestInsights(result: AnalysisResult, checkIn: CheckIn, athleteName: string): Promise<Insights> {
  if (!hasApi) throw new ApiError('No server configured.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${API_URL}${ENDPOINTS.insights}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result,
        check_in: {
          exhaustion: checkIn.rpe,
          opinion: checkIn.notes,
          pain: checkIn.pain,
          pain_locations: checkIn.pain_locations,
          pain_other: checkIn.pain_other,
        },
        athlete_name: athleteName,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(await errorText(res));
    return normalizeInsights(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

// ── Response checking ───────────────────────────────────────────────────────

function normalizeInsights(body: Json): Insights {
  const ok =
    (body.flag === 'red' || body.flag === 'none') &&
    typeof body.headline === 'string' &&
    Array.isArray(body.insights) &&
    typeof body.athlete_note === 'string' &&
    typeof body.coach_note === 'string' &&
    typeof body.mismatch_summary === 'string' &&
    isNum(body.expected_rpe) &&
    isNum(body.reported_rpe) &&
    (body.status === 'consistent' || body.status === 'under-reporting' || body.status === 'over-reporting');
  if (!ok) throw new ApiError('The Gemini response is missing fields. Restart FastAPI so it picks up the latest code.');
  const sentiment = body.sentiment === 'positive' || body.sentiment === 'negative' ? body.sentiment : 'neutral';
  return {
    flag: body.flag as Insights['flag'],
    flag_reason: typeof body.flag_reason === 'string' ? body.flag_reason : null,
    sentiment,
    headline: body.headline as string,
    insights: (body.insights as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 4),
    athlete_note: body.athlete_note as string,
    coach_note: body.coach_note as string,
    trainer_note: typeof body.trainer_note === 'string' ? body.trainer_note : body.coach_note as string,
    status: body.status as MismatchStatus,
    expected_rpe: body.expected_rpe as number,
    reported_rpe: body.reported_rpe as number,
    mismatch_summary: body.mismatch_summary as string,
    escalation: typeof body.escalation === 'string' && body.escalation ? body.escalation : null,
    source: 'ai',
  };
}

type Json = Record<string, unknown>;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function normalizeResult(body: Json): AnalysisResult {
  const reps = Array.isArray(body.reps) ? (body.reps as Json[]) : null;
  if (!reps || !body.baseline || !isNum(body.overall_rfi)) {
    throw new ApiError('The server response is missing reps, baseline or overall_rfi.');
  }
  const fields = [
    'i',
    'start_t',
    'bottom_t',
    'end_t',
    'tempo_s',
    'descent_s',
    'ascent_s',
    'depth',
    'ascent_speed',
    'peak_ascent_speed',
    'min_knee_angle',
    'hip_below_knee',
  ];
  const normalizedReps = reps.map((r) => {
    const missing = fields.filter((f) => !isNum(r[f]));
    if (missing.length) throw new ApiError(`A rep in the server response is missing: ${missing.join(', ')}.`);
    return isNum(r.rfi) ? r : { ...r, rfi: 0, scored: false };
  });
  const result = body as unknown as AnalysisResult;
  const url = result.annotated_video_url;
  return {
    ...result,
    reps: normalizedReps as unknown as AnalysisResult['reps'],
    breakdown_rep: isNum(result.breakdown_rep) ? result.breakdown_rep : null,
    // Relative URLs are served by the same API.
    annotated_video_url: url ? (/^https?:\/\//.test(url) ? url : `${API_URL}/${url.replace(/^\/+/, '')}`) : null,
  };
}
