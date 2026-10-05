// ── API contract (README §9 "Result JSON") ──────────────────────────────────
// This is exactly what the FastAPI server returns for one analyzed video.
// Depth is (hip_y_bottom - hip_y_standing) / L, where L is standing leg length in pixels,
// and ascent_speed is in leg-lengths per second, so neither depends on camera distance.

export const SQUAT_VARIATIONS = ['standard', 'pause', 'tempo', 'narrow', 'sumo'] as const;
export type SquatVariation = (typeof SQUAT_VARIATIONS)[number];

export type RepResult = {
  i: number;
  start_t: number;
  bottom_t: number;
  end_t: number;
  /** Moving time: descent + ascent with the hip actually moving. Pauses/holds are excluded. */
  tempo_s: number;
  descent_s: number;
  ascent_s: number;
  /** Wall-clock rep length, including pauses (newer servers only). */
  total_s?: number;
  /** Total time held still during the rep (newer servers only). */
  pause_s?: number;
  /** Each pause ≥ 0.3 s: where it happened and how long. 'top' = resting while standing. */
  pauses?: { at: 'top' | 'bottom' | 'descent' | 'ascent'; s: number; t: number }[];
  /** Pause time scored as fatigue: stalls and bottom pauses beyond the first reps (never standing rests). */
  fatigue_pause_s?: number;
  depth: number;
  ascent_speed: number;
  /** Peak upward hip speed during the ascent, in leg-lengths per second. */
  peak_ascent_speed: number;
  /** Minimum hip-knee-ankle angle during the rep, in degrees. Only show it when knee_angle_ok. */
  min_knee_angle: number;
  /** True only for a side-view video where the angle is geometrically consistent with the depth. */
  knee_angle_ok?: boolean;
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
  squat_variation?: SquatVariation;
  model: string;
  fps: number;
  reps: RepResult[];
  baseline: Baseline;
  /** First rep where RFI stays above the threshold for 2 reps in a row; null if never. */
  breakdown_rep: number | null;
  overall_rfi: number;
  annotated_video_url?: string | null;
  /** Camera-angle check: knee angles are hidden unless side_view. */
  view?: { side_view: boolean; shoulder_torso_ratio: number | null; reason: string | null };
  analysis_id?: string;
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
  pain_other?: string;
  /** The athlete's own words on how the workout went (typed or spoken). */
  notes: string;
  date: string;
};

export type MismatchStatus = 'under-reporting' | 'over-reporting' | 'consistent';

export type Report = {
  status: MismatchStatus;
  expected_rpe: number;
  reported_rpe: number;
  /** Gemini's explanation of the self-report check. Null when Gemini was unavailable. */
  summary: string | null;
  /** Gemini-written athlete / coach / trainer messages. Null when Gemini was unavailable. */
  messages: { athlete: string; coach: string; trainer: string } | null;
  /** Present whenever pain was reported, regardless of RFI. */
  escalation: string | null;
  /** 'gemini' = written by Gemini on the server; 'safety-only' = Gemini failed, only the deterministic flag and pain routing. */
  source: 'gemini' | 'safety-only' | 'sample';
  /** Why Gemini could not write the report (shown to the user), when source is 'safety-only'. */
  unavailable_reason?: string;
};

// ── AI analyzer (POST /insights, Gemini-generated prose) ────────────────────

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
  /** Shown to athletic trainers. */
  trainer_note: string;
  /** Deterministic self-report check computed on the server (not by Gemini). */
  status: MismatchStatus;
  expected_rpe: number;
  reported_rpe: number;
  /** Gemini's one- or two-sentence explanation of the self-report check. */
  mismatch_summary: string;
  /** Gemini-written pain escalation (server-guarded to always name a trainer or doctor); null if no pain. */
  escalation: string | null;
  /** 'ai' = generated by Gemini on the server; 'sample' = the pre-filled roster's sample sets (data/sample-workouts.ts). */
  source: 'ai' | 'sample';
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
