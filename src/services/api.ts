import type { AnalysisResult, CheckIn, Insights, MismatchStatus, SquatVariation } from '@/lib/squat-types';

// Thin client for the FastAPI server in code/api/main.py.
// Start the app with EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
export const ENDPOINTS = {
  health: '/health',
  /** Chunked video upload: POST starts it, PUT /{id}?offset= sends a piece, POST /{id}/finish starts the job. */
  uploads: '/analyze/uploads',
  /** GET /analyze/jobs/{id} polls a running analysis. */
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

/** Upload piece size: small enough that even a slow phone connection sends one well within Cloudflare's ~100 s limit. */
const CHUNK_BYTES = 2 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 60_000;
const CHUNK_RETRIES = 3;

/**
 * Sends the video in CHUNK_BYTES pieces (one short request each), then starts the analysis job.
 * One long upload request fails through a Cloudflare quick tunnel once it passes ~100 s (HTTP 524),
 * which a phone video on campus Wi-Fi easily does. Each piece is retried on failure.
 */
async function startAnalysisJob(
  uri: string,
  { onUploadProgress, signal, squatVariation }: { onUploadProgress?: (fraction: number) => void; signal?: AbortSignal; squatVariation?: SquatVariation }
): Promise<string> {
  if (!hasApi) throw new ApiError('No server configured.');
  let video: Blob;
  try {
    video = await (await fetch(uri)).blob();
  } catch {
    throw new ApiError('Could not read the selected video.');
  }
  const name = uri.split('/').pop() || 'squats.mp4';
  const filename = /\.(mp4|mov|m4v|webm)$/i.test(name) ? name : video.type.includes('quicktime') ? 'clip.mov' : 'clip.mp4';

  const start = await request(`${ENDPOINTS.uploads}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, size: video.size }),
  }, signal);
  if (start.status === 404 || start.status === 405) {
    throw new ApiError('This server has no /analyze/uploads route. Restart FastAPI so it picks up the latest code.');
  }
  if (!start.ok) throw new ApiError(await errorText(start));
  const { upload_id: uploadId } = (await start.json()) as { upload_id: string };

  for (let offset = 0; offset < video.size; offset += CHUNK_BYTES) {
    const piece = video.slice(offset, Math.min(video.size, offset + CHUNK_BYTES));
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await request(`${ENDPOINTS.uploads}/${uploadId}?offset=${offset}&length=${piece.size}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: piece,
        }, signal);
        if (!res.ok) throw new ApiError(await errorText(res));
        break;
      } catch (e) {
        if (signal?.aborted) throw new ApiError('aborted');
        if (attempt >= CHUNK_RETRIES) throw e instanceof ApiError ? e : new ApiError(`Upload failed: lost contact with the server at ${API_URL}.`);
        await sleep(1000 * attempt, signal);
      }
    }
    onUploadProgress?.(Math.min(1, (offset + CHUNK_BYTES) / video.size));
  }

  const form = new FormData();
  form.append('squat_variation', squatVariation ?? 'standard');
  const done = await request(`${ENDPOINTS.uploads}/${uploadId}/finish`, { method: 'POST', body: form }, signal);
  if (!done.ok) throw new ApiError(await errorText(done));
  const { job_id: jobId } = (await done.json()) as { job_id: string };
  onUploadProgress?.(1);
  return jobId;
}

/** fetch with a per-request timeout that also follows the caller's cancel signal. */
async function request(path: string, init: RequestInit, signal?: AbortSignal, timeoutMs = CHUNK_TIMEOUT_MS) {
  if (signal?.aborted) throw new ApiError('aborted');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    if (signal?.aborted) throw new ApiError('aborted');
    throw new ApiError(`Could not reach the server at ${API_URL}.`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
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
  return statusMessage(res.status, await res.text().catch(() => ''));
}

/** Cloudflare tunnel errors get a plain explanation instead of a bare status code. */
function statusMessage(status: number, body: string) {
  if (status === 524) return 'Server error 524: the server took over 100 seconds to answer through the Cloudflare tunnel. Try again; if it keeps happening, check the server terminal.';
  if (status === 530 || status === 1033) return `Server error ${status}: the Cloudflare tunnel is down. Restart cloudflared and Expo with the new URL.`;
  if (status === 413) return 'Server error 413: the video is too large to send through the tunnel (about 100 MB max). Record a shorter clip.';
  return `Server error ${status}${detailOf(body)}`;
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
  // Green/red = does the self-report line up with the data? Red for the server's hidden-overwork
  // flag, or when its deterministic check finds under- or over-reporting.
  const red = body.flag === 'red' || body.status !== 'consistent';
  const reason = typeof body.flag_reason === 'string' && body.flag_reason ? body.flag_reason : null;
  return {
    flag: red ? 'red' : 'green',
    flag_reason: reason ?? (red ? (body.mismatch_summary as string) : null),
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
