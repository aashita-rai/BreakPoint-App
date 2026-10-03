import { FATIGUE, STATUS_CUTOFFS } from '@/lib/config';
import type {
  AnalysisResult,
  Baseline,
  CheckIn,
  MismatchStatus,
  Report,
  RepResult,
} from '@/lib/squat-types';

// TypeScript port of the README §3 maths (code/analysis/fatigue.py on the server).
// Used for simulated data and the offline demo. Real uploads use the server's numbers.

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

// ── Self-report mismatch + template messages (README §3, §9) ────────────────

export function expectedRpe(overallRfi: number) {
  return Math.round(clip(overallRfi / 10, 1, 10) * 10) / 10;
}

export function mismatchStatus(reported: number, expected: number): MismatchStatus {
  if (Math.abs(reported - expected) < FATIGUE.mismatchGap) return 'consistent';
  return reported < expected ? 'under-reporting' : 'over-reporting';
}

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * Offline fallback for the server's message generator. Guardrails: never diagnose,
 * never say the athlete is fine, always point to a human when pain is reported, and
 * recommend emergency care for severe symptoms.
 */
export function templateReport(result: AnalysisResult, checkIn: CheckIn, athleteName: string): Report {
  const expected = expectedRpe(result.overall_rfi);
  const status = mismatchStatus(checkIn.rpe, expected);
  const first = athleteName.split(' ')[0] || 'The athlete';
  const breakdown = result.breakdown_rep ? `form broke down at rep ${result.breakdown_rep}` : 'no breakdown rep was detected';
  const where = list(checkIn.pain_locations);
  const painLine = checkIn.pain ? ` Pain reported${where ? ` (${where})` : ''}.` : ' No pain reported.';

  const athlete = {
    'under-reporting': `Your movement showed more fatigue (RFI ${result.overall_rfi}) than the effort you reported (${checkIn.rpe}/10). Being honest about tiredness helps your coaches keep you healthy and on the field. Consider telling your coach or athletic trainer how you feel.`,
    'over-reporting': `You rated this set ${checkIn.rpe}/10, which is harder than your movement data suggested. Fatigue can also come from sleep, stress, illness or other training, so it's worth mentioning to your coach or athletic trainer.`,
    consistent: `Your reported effort (${checkIn.rpe}/10) lines up with what your movement showed (RFI ${result.overall_rfi}). Keep checking in after each set so changes are easy to spot.`,
  }[status];

  const flag = {
    'under-reporting': 'Possible under-reporting: measured fatigue is higher than reported effort.',
    'over-reporting': 'Possible over-reporting: reported effort is higher than measured fatigue.',
    consistent: 'Reported effort is consistent with measured fatigue.',
  }[status];

  const coach = `${first}: overall RFI ${result.overall_rfi}, ${breakdown}. Reported effort ${checkIn.rpe}/10 (expected about ${expected}). ${flag}${painLine} This is a screening flag for a conversation, not a diagnosis.`;
  const trainer = `${athleteName} — squat set, ${result.reps.length} reps. Overall RFI ${result.overall_rfi}; ${breakdown}. Self-reported RPE ${checkIn.rpe}/10 vs expected ${expected}. ${flag}${painLine}${checkIn.notes ? ` Athlete note: "${checkIn.notes}".` : ''} Recommend follow-up as clinically appropriate.`;

  const escalation = checkIn.pain
    ? `Pain was reported${where ? ` in the ${where}` : ''}. Please talk to your athletic trainer or a doctor before your next session. If pain is severe or sudden, or comes with swelling, numbness, or you can't put weight on it, get urgent medical care.`
    : null;

  return {
    status,
    expected_rpe: expected,
    reported_rpe: checkIn.rpe,
    messages: { athlete, coach, trainer },
    escalation,
    source: 'template',
  };
}
