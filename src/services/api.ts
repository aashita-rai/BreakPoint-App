import { ratingIssues } from '@/lib/insights';
import type { AnalysisResult, CheckIn, Insights, Report } from '@/lib/squat-types';
import { Platform } from 'react-native';

// Thin client for the FastAPI server in code/api/ (README §9).
// Start the app with EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
//
export const ENDPOINTS = {
  health: '/health',
  analyze: '/analyze',
  /** POST starts a background analysis; GET /analyze/jobs/{id} reports its progress. */
  analyzeJobs: '/analyze/jobs',
  report: '/report',
  // Added by server/breakpoint_extras.py:
  transcribe: '/transcribe',
  insights: '/insights',
} as const;
const UPLOAD_FIELD = 'file';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const hasApi = API_URL.length > 0;

export class ApiError extends Error {}

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

/** Server-side work while a video is analyzed, in the order it happens (code/api/main.py STAGES). */
export type ServerStage = 'pose' | 'fatigue' | 'render';

type AnalyzeOptions = {
  onUploadProgress?: (fraction: number) => void;
  /** fraction 0-1 of the server's work (pose model, fatigue maths, annotated video). */
  onServerProgress?: (fraction: number, stage: ServerStage) => void;
  signal?: AbortSignal;
};

const JOB_POLL_MS = 400;

/**
 * Uploads the video, then follows the server's background job so the app can show real
 * progress while the pose model runs. Falls back to the blocking POST /analyze on servers
 * without job routes, with an estimated progress so the number still moves.
 */
export async function uploadAndAnalyze(uri: string, opts: AnalyzeOptions = {}): Promise<AnalysisResult> {
  if (!hasApi) throw new ApiError('No server configured.');
  const { onUploadProgress, onServerProgress, signal } = opts;
  const started = await postVideo(ENDPOINTS.analyzeJobs, uri, { onUploadProgress, signal });
  if (started.status === 404 || started.status === 405) return analyzeBlocking(uri, opts);
  if (started.status < 200 || started.status >= 300) throw serverError(started.status, started.body);
  const jobId = started.body.job_id;
  if (typeof jobId !== 'string') throw new ApiError('The server did not return a job id.');

  onServerProgress?.(0, 'pose');
  for (;;) {
    await sleep(JOB_POLL_MS, signal);
    let res: Response;
    try {
      res = await fetch(`${API_URL}${ENDPOINTS.analyzeJobs}/${jobId}`, { signal });
    } catch {
      if (signal?.aborted) throw new ApiError('aborted');
      continue; // brief network hiccup: keep polling
    }
    const job = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) throw serverError(res.status, job);
    if (job.status === 'error') throw serverError(isNum(job.code) ? job.code : 500, { detail: job.error });
    if (job.status === 'done') {
      onServerProgress?.(1, 'render');
      return normalizeResult(job.result as Json);
    }
    const stage = job.stage === 'fatigue' || job.stage === 'render' ? job.stage : 'pose';
    onServerProgress?.(isNum(job.progress) ? job.progress : 0, stage);
  }
}

/** Older servers: one request that returns when everything is done. Progress is estimated. */
async function analyzeBlocking(uri: string, { onUploadProgress, onServerProgress, signal }: AnalyzeOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const startEstimate = () => {
    if (timer) return;
    const t0 = Date.now();
    // Eases towards 95% (about 63% after 20 s) so the number keeps moving without hitting 100.
    timer = setInterval(() => onServerProgress?.(0.95 * (1 - Math.exp(-(Date.now() - t0) / 20000)), 'pose'), 250);
  };
  try {
    const res = await postVideo(ENDPOINTS.analyze, uri, {
      signal,
      onUploadProgress: (f) => {
        onUploadProgress?.(f);
        if (f >= 1) startEstimate();
      },
    });
    if (res.status < 200 || res.status >= 300) throw serverError(res.status, res.body);
    onServerProgress?.(1, 'render');
    return normalizeResult(res.body);
  } finally {
    clearInterval(timer);
  }
}

/** POSTs the video as multipart form data. Uses XMLHttpRequest because fetch can't report upload progress. */
function postVideo(
  path: string,
  uri: string,
  { onUploadProgress, signal }: Pick<AnalyzeOptions, 'onUploadProgress' | 'signal'>
): Promise<{ status: number; body: Json }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.responseType = 'text';
    // Some platforms leave lengthComputable false even when the total is known.
    xhr.upload.onprogress = (e) => {
      if (e.total > 0) onUploadProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => onUploadProgress?.(1);
    xhr.onload = () => {
      let body: Json = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        if (xhr.status >= 200 && xhr.status < 300) {
          return reject(new ApiError('The server sent a response the app could not read.'));
        }
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new ApiError(`Could not reach the server at ${API_URL}.`));
    signal?.addEventListener('abort', () => {
      xhr.abort();
      reject(new ApiError('aborted'));
    });

    const form = new FormData();
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

function serverError(status: number, body: Json) {
  const d = body.detail;
  const detail = typeof d === 'string' ? d : d ? JSON.stringify(d).slice(0, 200) : '';
  return new ApiError(detail ? `Server error ${status}: ${detail}` : `Server error ${status}.`);
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

/** Asks the server for the mismatch flag and the three messages (LLM with its own template fallback). */
export async function requestReport(result: AnalysisResult, checkIn: CheckIn, athleteName: string): Promise<Report> {
  if (!hasApi) throw new ApiError('No server configured.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_URL}${ENDPOINTS.report}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result,
        check_in: {
          reported_rpe: checkIn.rpe,
          pain: checkIn.pain,
          pain_locations: checkIn.pain_locations,
          notes: checkIn.notes,
        },
        athlete_name: athleteName,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(`Server error ${res.status}.`);
    return normalizeReport(await res.json(), checkIn);
  } finally {
    clearTimeout(timer);
  }
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

/**
 * AI analyzer: asks Gemini (on the server) whether the athlete's words and exhaustion rating
 * line up with the measured fatigue, and to explain the set.
 */
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
        },
        athlete_name: athleteName,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(`Server error ${res.status}.`);
    const insights = normalizeInsights(await res.json());
    // The rating-vs-data rule is a floor: the AI can add a red flag but never clear one.
    const issues = ratingIssues(result, checkIn);
    return issues.length && insights.flag !== 'red' ? { ...insights, flag: 'red', flag_reason: issues.join(' ') } : insights;
  } finally {
    clearTimeout(timer);
  }
}

// ── Response checking ───────────────────────────────────────────────────────

function normalizeInsights(body: Json): Insights {
  const ok =
    (body.flag === 'red' || body.flag === 'green' || body.flag === 'none') &&
    typeof body.headline === 'string' &&
    Array.isArray(body.insights) &&
    typeof body.athlete_note === 'string' &&
    typeof body.coach_note === 'string';
  if (!ok) throw new ApiError('The insights response is missing fields.');
  const sentiment = body.sentiment === 'positive' || body.sentiment === 'negative' ? body.sentiment : 'neutral';
  return {
    // Older servers answer 'none' when there was no flag.
    flag: body.flag === 'red' ? 'red' : 'green',
    flag_reason: typeof body.flag_reason === 'string' ? body.flag_reason : null,
    sentiment,
    headline: body.headline as string,
    insights: (body.insights as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 4),
    athlete_note: body.athlete_note as string,
    coach_note: body.coach_note as string,
    // The server falls back to its own rules if Gemini is unavailable.
    source: body.source === 'rules' ? 'rules' : 'ai',
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

function normalizeReport(body: Json, checkIn: CheckIn): Report {
  const messages = body.messages as Json | undefined;
  const status = (body.status ?? body.mismatch) as Report['status'] | undefined;
  if (!messages || typeof messages.athlete !== 'string' || typeof messages.coach !== 'string' || typeof messages.trainer !== 'string' || !status) {
    throw new ApiError('The report response is missing messages or status.');
  }
  return {
    status,
    expected_rpe: isNum(body.expected_rpe) ? body.expected_rpe : 0,
    reported_rpe: checkIn.rpe,
    messages: { athlete: messages.athlete, coach: messages.coach, trainer: messages.trainer },
    escalation: typeof body.escalation === 'string' ? body.escalation : null,
    source: 'api',
  };
}
