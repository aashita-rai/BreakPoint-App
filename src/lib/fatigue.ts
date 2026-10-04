import { FATIGUE, STATUS_CUTOFFS } from '@/lib/config';
import type {
  AnalysisResult,
  Baseline,
  CheckIn,
  Insights,
  MismatchStatus,
  Report,
  RepResult,
} from '@/lib/squat-types';

// TypeScript port of the README §3 maths (code/analysis/fatigue.py on the server).
// Used for offline fallback calculations. Real uploads use the server's numbers.

export type RawRep = Omit<RepResult, 'rfi' | 'tempo_s' | 'descent_s' | 'ascent_s'>;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Deviation in the tired direction as a fraction of baseline, clipped to [0, cap], rescaled to [0, 1]. */
const tiredScore = (deviation: number) => clip(deviation, 0, FATIGUE.cap) / FATIGUE.cap;

export function computeFatigue(raw: RawRep[]): Pick<AnalysisResult, 'reps' | 'baseline' | 'breakdown_rep' | 'overall_rfi'> {
  const timed = raw.map((r) => ({
    ...r,
    tempo_s: round(r.end_t - r.start_t),
    descent_s: round(r.bottom_t - r.start_t),
    ascent_s: round(r.end_t - r.bottom_t),
  }));
  const first = timed.slice(0, FATIGUE.baselineReps);
  const baseline: Baseline = {
    n_reps: first.length,
    tempo_s: round(median(first.map((r) => r.tempo_s))),
    depth: round(median(first.map((r) => r.depth))),
    ascent_speed: round(median(first.map((r) => r.ascent_speed))),
  };

  const { weights } = FATIGUE;
  const wSum = weights.tempo + weights.depth + weights.speed;
  const rawRfi = timed.map((r) => {
    const tempo = tiredScore((r.tempo_s - baseline.tempo_s) / baseline.tempo_s); // longer = tired
    const depth = tiredScore((baseline.depth - r.depth) / baseline.depth); // shallower = tired
    const speed = tiredScore((baseline.ascent_speed - r.ascent_speed) / baseline.ascent_speed); // slower = tired
    return (100 * (weights.tempo * tempo + weights.depth * depth + weights.speed * speed)) / wSum;
  });

  // Centred rolling median over smoothReps.
  const half = Math.floor(FATIGUE.smoothReps / 2);
  const smoothed = rawRfi.map((_, i) => median(rawRfi.slice(Math.max(0, i - half), i + half + 1)));

  let breakdown: number | null = null;
  for (let i = 0; i + FATIGUE.breakdownRun <= smoothed.length; i++) {
    if (smoothed.slice(i, i + FATIGUE.breakdownRun).every((v) => v > FATIGUE.breakdownThreshold)) {
      breakdown = timed[i].i;
      break;
    }
  }

  // The README doesn't define overall_rfi; here it is the mean of the last 3 smoothed reps.
  const tail = smoothed.slice(-3);
  const overall = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : 0;

  return {
    reps: timed.map((r, i) => ({ ...r, rfi: Math.round(smoothed[i]) })),
    baseline,
    breakdown_rep: breakdown,
    overall_rfi: Math.round(overall),
  };
}

export type Status = 'green' | 'amber' | 'red';

export function rfiStatus(rfi: number): Status {
  if (rfi >= STATUS_CUTOFFS.red) return 'red';
  if (rfi >= STATUS_CUTOFFS.amber) return 'amber';
  return 'green';
}

export const STATUS_LABEL: Record<Status, string> = { green: 'Healthy', amber: 'Caution', red: 'Fatigued' };

// ── Self-report mismatch and Gemini report assembly ─────────────────────────

export function expectedRpe(overallRfi: number) {
  return Math.round(clip(overallRfi / 10, 1, 10) * 10) / 10;
}

export function mismatchStatus(reported: number, expected: number): MismatchStatus {
  if (Math.abs(reported - expected) < FATIGUE.mismatchGap) return 'consistent';
  return reported < expected ? 'under-reporting' : 'over-reporting';
}

/** Every sentence in the report comes from Gemini (POST /insights); the numbers come from the server's rule. */
export function reportFromGemini(insights: Insights): Report {
  return {
    status: insights.status,
    expected_rpe: insights.expected_rpe,
    reported_rpe: insights.reported_rpe,
    summary: insights.mismatch_summary,
    messages: { athlete: insights.athlete_note, coach: insights.coach_note, trainer: insights.trainer_note },
    escalation: insights.escalation,
    source: 'gemini',
  };
}

/**
 * Used only when Gemini can't be reached. Keeps the deterministic mismatch flag and, if pain was
 * reported, a referral to a person: a pain report must never disappear because an AI call failed.
 */
const PAIN_SAFETY_FALLBACK =
  'Please talk to your athletic trainer or a doctor before training again. Get urgent care if the pain is severe or sudden, or comes with swelling, numbness, or not being able to bear weight.';

export function safetyOnlyReport(result: AnalysisResult, checkIn: CheckIn, reason: string): Report {
  const expected = expectedRpe(result.overall_rfi);
  return {
    status: mismatchStatus(checkIn.rpe, expected),
    expected_rpe: expected,
    reported_rpe: checkIn.rpe,
    summary: null,
    messages: null,
    escalation: checkIn.pain ? PAIN_SAFETY_FALLBACK : null,
    source: 'safety-only',
    unavailable_reason: reason,
  };
}

