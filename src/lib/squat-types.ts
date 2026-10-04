// ── API contract (README §9 "Result JSON") ──────────────────────────────────
// This is exactly what the FastAPI server returns for one analyzed video.
// Depth is (hip_y_bottom - hip_y_standing) / L, where L is standing leg length in pixels,
// and ascent_speed is in leg-lengths per second, so neither depends on camera distance.

export type RepResult = {
  i: number;
  start_t: number;
  bottom_t: number;
  end_t: number;
  tempo_s: number;
  descent_s: number;
  ascent_s: number;
  depth: number;
  ascent_speed: number;
  /** Peak upward hip speed during the ascent, in leg-lengths per second. */
  peak_ascent_speed: number;
  /** Minimum hip-knee-ankle angle during the rep, in degrees. */
  min_knee_angle: number;
  /** Hip height relative to the knee at the bottom, normalized by leg length. */
  hip_below_knee: number;
  /** Rep Fatigue Index, 0-100. */
  rfi: number;
  /** False when this rep was retained but excluded from fatigue scoring. */
  scored?: boolean;
  /** Conservative, measurement-derived cues shown during this rep. */
  form_warnings?: string[];
};

export type Baseline = {
  n_reps: number;
  tempo_s: number;
  depth: number;
  ascent_speed: number;
};

export type AnalysisResult = {
  movement: 'squat';
  model: string;
  fps: number;
  reps: RepResult[];
  baseline: Baseline;
  /** First rep where RFI stays above the threshold for 2 reps in a row; null if never. */
  breakdown_rep: number | null;
  overall_rfi: number;
  annotated_video_url?: string | null;
  quality?: {
    score: number;
    usable: boolean;
    warnings: string[];
  };
};

// ── Self-report (README §3 "Self-report mismatch", §9 Check-In / Report) ────

export const PAIN_LOCATIONS = ['knee', 'hip', 'back', 'ankle', 'other'] as const;
export type PainLocation = (typeof PAIN_LOCATIONS)[number];

export type CheckIn = {
  /** "On a scale of 1-10, how exhausted do you feel after the workout?" (used as RPE). */
  rpe: number;
  pain: boolean;
  pain_locations: PainLocation[];
  /** The athlete's own words on how the workout went (typed or spoken). */
  notes: string;
  date: string;
};

export type MismatchStatus = 'under-reporting' | 'over-reporting' | 'consistent';

export type Report = {
  status: MismatchStatus;
  expected_rpe: number;
  reported_rpe: number;
  messages: { athlete: string; coach: string; trainer: string };
  /** Present whenever pain was reported, regardless of RFI. */
  escalation: string | null;
  /** 'api' = written by the server (LLM); 'template' = the app's built-in fallback. */
  source: 'api' | 'template';
};

// ── AI analyzer (POST /insights, with a rule-based fallback in the app) ─────

export type Insights = {
  /**
   * Does the athlete's self-report (their words + 1-10 exhaustion rating) line up with the
   * measured fatigue? 'green' = yes; 'red' = no, e.g. "not tired" while the data shows they were.
   */
  flag: 'red' | 'green';
  /** One sentence comparing what the athlete reported with what the data shows. */
  flag_reason: string | null;
  /** Tone of the athlete's own description of the workout. */
  sentiment: 'positive' | 'neutral' | 'negative';
  headline: string;
  /** 2-4 specific observations about where the athlete pushed too hard. */
  insights: string[];
  /** Shown to the athlete. */
  athlete_note: string;
  /** Shown to coaches and athletic trainers. */
  coach_note: string;
  /** 'ai' = written by Gemini on the server; 'rules' = the app's built-in fallback. */
  source: 'ai' | 'rules';
};

// ── App-side record of one analyzed set ─────────────────────────────────────

export type Workout = {
  id: string;
  title: string;
  /** ISO date the set was recorded. */
  date: string;
  /** Local video on the phone, if this device uploaded it. */
  videoUri?: string;
  result: AnalysisResult;
  checkIn?: CheckIn;
  report?: Report;
  insights?: Insights;
};
