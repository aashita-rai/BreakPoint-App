import { FATIGUE, HIDDEN_OVERWORK } from '@/lib/config';
import { computeFatigue, expectedRpe, mismatchStatus, type RawRep } from '@/lib/fatigue';
import { type AnalysisResult, type CheckIn, type Insights, PAIN_LOCATIONS, type Report, type Workout } from '@/lib/squat-types';

// Sample squat sets for the pre-filled roster, so the coach/AT dashboard shows a realistic
// spread of fatigue levels, flags and workout counts before anyone uploads.
// Each set's RFI comes from the app's own fatigue maths (lib/fatigue.ts), and its red/green flag
// from the same deterministic self-report check the server applies to real check-ins, so every
// number on the dashboard is consistent with the rest of the app. The wording is short sample
// text, labelled as sample data in the app, never presented as Gemini output.
// Seeded by athlete id, so each athlete gets the same history on every launch.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Small deterministic PRNG (mulberry32). Returns numbers in [0, 1). */
function seededRandom(seed: string) {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (Math.imul(31, a) + seed.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const NOTES = {
  positive: ['Felt strong the whole set', 'Pretty easy today', 'Legs felt good', 'Solid set, nothing to report'],
  neutral: ['Normal set', 'About what I expected', 'Okay, a bit stiff at the start'],
  negative: ['Legs got heavy near the end', 'That was hard', 'Pretty tired after practice', 'Struggled on the last few reps'],
};

/**
 * One set of squats. `severity` (0-1) is how much the athlete fades after `onset` (a fraction
 * of the set): reps get slower and shallower, so the rise slows too.
 */
function sampleReps(rand: () => number, severity: number): RawRep[] {
  const n = 10 + Math.floor(rand() * 7);
  const onset = Math.floor(n * (0.35 + rand() * 0.4));
  const baseTempo = 1.7 + rand() * 0.6;
  const baseDepth = 0.5 + rand() * 0.12;
  const reps: RawRep[] = [];
  let t = 1 + rand();
  for (let i = 1; i <= n; i++) {
    const fade = i > onset ? severity * ((i - onset) / (n - onset)) : 0;
    const noise = () => 1 + (rand() - 0.5) * 0.06;
    const tempo = baseTempo * (1 + 0.4 * fade) * noise();
    const depth = baseDepth * (1 - 0.35 * fade) * noise();
    const descent = tempo * 0.45;
    const ascent = tempo - descent;
    const speed = depth / ascent;
    reps.push({
      i,
      start_t: round(t),
      bottom_t: round(t + descent),
      end_t: round(t + tempo),
      depth: round(depth, 3),
      ascent_speed: round(speed, 3),
      peak_ascent_speed: round(speed * 1.6, 3),
      min_knee_angle: round(150 - depth * 120, 1),
      hip_below_knee: round(depth - 0.45, 3),
      scored: true,
    });
    t += tempo;
  }
  return reps;
}

/** A check-in that mostly matches the data, sometimes under- or over-reports, and occasionally reports pain. */
function sampleCheckIn(rand: () => number, overallRfi: number, date: string): CheckIn {
  const expected = expectedRpe(overallRfi);
  const roll = rand();
  let rpe: number;
  let tone: keyof typeof NOTES;
  if (roll < 0.22) {
    // Under-reporting: says it was easy whatever the data shows.
    rpe = clamp(Math.round(expected - 4 - rand() * 2), 1, 10);
    tone = 'positive';
  } else if (roll < 0.32) {
    rpe = clamp(Math.round(expected + 3 + rand() * 2), 1, 10);
    tone = 'negative';
  } else {
    rpe = clamp(Math.round(expected + (rand() - 0.5) * 2), 1, 10);
    tone = rpe >= 7 ? 'negative' : rpe <= 3 ? 'positive' : 'neutral';
  }
  const pain = rand() < 0.1;
  const options = NOTES[tone];
  return {
    rpe,
    pain,
    pain_locations: pain ? [PAIN_LOCATIONS[Math.floor(rand() * 4)]] : [],
    notes: rand() < 0.8 ? options[Math.floor(rand() * options.length)] : '',
    date,
  };
}

const PAIN_REFERRAL =
  'Please talk to your athletic trainer or a doctor before training again. Get urgent care if the pain is severe or sudden, or comes with swelling, numbness, or not being able to bear weight.';

/** Report and red/green flag for a sample check-in, from the same rules as real check-ins. */
function sampleFeedback(result: AnalysisResult, checkIn: CheckIn, athleteName: string): { report: Report; insights: Insights } {
  const first = athleteName.split(' ')[0];
  const rfi = result.overall_rfi;
  const expected = expectedRpe(rfi);
  const status = mismatchStatus(checkIn.rpe, expected);
  const hidden = rfi > HIDDEN_OVERWORK.minRfi && (checkIn.rpe <= HIDDEN_OVERWORK.maxExhaustion || expected - checkIn.rpe >= FATIGUE.mismatchGap);
  const red = hidden || status !== 'consistent';
  const breakdown = result.breakdown_rep ? `form faded from rep ${result.breakdown_rep}` : 'no breakdown rep';
  const summary = {
    consistent: `Rated exhaustion ${checkIn.rpe}/10, close to the ${expected}/10 the movement data suggests (RFI ${rfi}).`,
    'under-reporting': `Rated exhaustion ${checkIn.rpe}/10, but the movement data suggests about ${expected}/10 (RFI ${rfi}).`,
    'over-reporting': `Rated exhaustion ${checkIn.rpe}/10, but the movement data shows less fatigue (RFI ${rfi}, about ${expected}/10).`,
  }[status];
  const escalation = checkIn.pain ? PAIN_REFERRAL : null;
  const messages = {
    athlete: red
      ? `Your check-in and your movement data tell different stories (${breakdown}). It's worth telling your coach or athletic trainer how you feel.`
      : `Your check-in lines up with your movement data (${breakdown}). Keep checking in after each set.`,
    coach: `${first}: RFI ${rfi}, ${breakdown}, exhaustion ${checkIn.rpe}/10. ${red ? 'Worth a quick conversation.' : 'Check-in lines up with the data.'} A screening aid, not a diagnosis.`,
    trainer: `${athleteName}: ${result.reps.length} reps, RFI ${rfi}, ${breakdown}. Reported ${checkIn.rpe}/10 vs expected ${expected}/10.${checkIn.pain ? ` Pain reported (${checkIn.pain_locations.join(', ')}).` : ''}`,
  };
  return {
    report: { status, expected_rpe: expected, reported_rpe: checkIn.rpe, summary, messages, escalation, source: 'sample' },
    insights: {
      flag: red ? 'red' : 'green',
      flag_reason: summary,
      sentiment: 'neutral',
      headline: hidden ? 'Possible hidden overwork' : red ? "Self-report doesn't match the data" : result.breakdown_rep ? `Fatigue built up from rep ${result.breakdown_rep}` : 'Steady set',
      insights: [result.breakdown_rep ? `Tempo, depth or speed drifted from rep ${result.breakdown_rep} of ${result.reps.length}.` : `Tempo, depth and speed stayed close to the first reps for all ${result.reps.length} reps.`],
      athlete_note: messages.athlete,
      coach_note: messages.coach,
      trainer_note: messages.trainer,
      status,
      expected_rpe: expected,
      reported_rpe: checkIn.rpe,
      mismatch_summary: summary,
      escalation,
      source: 'sample',
    },
  };
}

/** Newest first, like Athlete.workouts. Between 1 and 8 sets, a few days apart. */
export function sampleWorkouts(athleteId: string, athleteName: string, now = Date.now()): Workout[] {
  const rand = seededRandom(athleteId);
  // Some athletes tend to train fresh, others tend to grind into fatigue.
  const tendency = rand();
  const count = 1 + Math.floor(rand() * 8);
  const workouts: Workout[] = [];
  let daysAgo = Math.floor(rand() * 3);
  for (let k = 0; k < count; k++) {
    const date = new Date(now - daysAgo * DAY_MS - Math.floor(rand() * 8) * 60 * 60 * 1000).toISOString();
    const severity = clamp(tendency * 0.7 + (rand() - 0.5) * 0.4, 0, 1);
    const fatigue = computeFatigue(sampleReps(rand, severity));
    const result = {
      movement: 'squat' as const,
      model: 'yolo11n-pose',
      fps: 30,
      ...fatigue,
      annotated_video_url: null,
      quality: { score: round(0.85 + rand() * 0.14), usable: true, warnings: [] },
    };
    const workout: Workout = { id: `${athleteId}-sample-${k + 1}`, title: 'Bodyweight Squat Set', date, result };
    // The newest set is sometimes still waiting for the athlete's check-in.
    if (k > 0 || rand() > 0.12) {
      const checkIn = sampleCheckIn(rand, result.overall_rfi, date);
      workout.checkIn = checkIn;
      Object.assign(workout, sampleFeedback(result, checkIn, athleteName));
    }
    workouts.push(workout);
    daysAgo += 2 + Math.floor(rand() * 4);
  }
  return workouts;
}
