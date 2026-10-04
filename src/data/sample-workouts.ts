import { computeFatigue, expectedRpe, type RawRep, templateReport } from '@/lib/fatigue';
import { ruleInsights } from '@/lib/insights';
import { type CheckIn, PAIN_LOCATIONS, type Workout } from '@/lib/squat-types';

// Sample squat sets for the pre-filled roster, so the coach/AT dashboard shows a realistic
// spread of fatigue levels, flags and workout counts before anyone uploads.
// Each set's RFI comes from the app's own fatigue maths (lib/fatigue.ts), and its report and
// red/green flag from the same rules used for real check-ins (lib/insights.ts), so every
// number on the dashboard is consistent with the rest of the app.
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
      workout.report = templateReport(result, checkIn, athleteName);
      workout.insights = ruleInsights(result, checkIn, athleteName);
    }
    workouts.push(workout);
    daysAgo += 2 + Math.floor(rand() * 4);
  }
  return workouts;
}
