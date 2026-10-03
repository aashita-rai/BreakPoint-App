import { Platform } from 'react-native';
import type { AnalysisResult, CheckIn, Insights, Report } from '@/lib/squat-types';

// Thin client for the FastAPI server in code/api/ (README §9).
// Start the app with EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
//
// TODO: the README gives the JSON contract but not the route names. Check these three
// paths and the form field name against code/api/main.py.
export const ENDPOINTS = {
  health: '/health',
  analyze: '/analyze',
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

/**
 * Uploads the video and waits for the server to run the pose model and analysis.
 * Uses XMLHttpRequest because fetch can't report upload progress.
 */
export function uploadAndAnalyze(
  uri: string,
  { onUploadProgress, signal }: { onUploadProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    if (!hasApi) return reject(new ApiError('No server configured.'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${ENDPOINTS.analyze}`);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = '';
        try {
          const d = JSON.parse(xhr.responseText)?.detail;
          detail = typeof d === 'string' ? d : d ? JSON.stringify(d).slice(0, 200) : '';
        } catch {}
        return reject(new ApiError(detail ? `Server error ${xhr.status}: ${detail}` : `Server error ${xhr.status}.`));
      }
      try {
        resolve(normalizeResult(JSON.parse(xhr.responseText)));
      } catch (e) {
        reject(e instanceof ApiError ? e : new ApiError('The server sent a response the app could not read.'));
      }
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

/** AI analyzer: asks Claude (on the server) whether the athlete is overworking without realising it. */
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
    typeof body.coach_note === 'string';
  if (!ok) throw new ApiError('The insights response is missing fields.');
  const sentiment = body.sentiment === 'positive' || body.sentiment === 'negative' ? body.sentiment : 'neutral';
  return {
    flag: body.flag as Insights['flag'],
    flag_reason: typeof body.flag_reason === 'string' ? body.flag_reason : null,
    sentiment,
    headline: body.headline as string,
    insights: (body.insights as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 4),
    athlete_note: body.athlete_note as string,
    coach_note: body.coach_note as string,
    // The server falls back to its own rules if Claude is unavailable.
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
  const fields = ['i', 'start_t', 'bottom_t', 'end_t', 'tempo_s', 'descent_s', 'ascent_s', 'depth', 'ascent_speed', 'rfi'];
  for (const r of reps) {
    const missing = fields.filter((f) => !isNum(r[f]));
    if (missing.length) throw new ApiError(`A rep in the server response is missing: ${missing.join(', ')}.`);
  }
  const result = body as unknown as AnalysisResult;
  const url = result.annotated_video_url;
  return {
    ...result,
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
