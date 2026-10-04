// Mirror of the fatigue settings in code/config.yaml (README §3).
// The server's numbers always win: the app only uses these for offline fallback calculations
// and to colour traffic lights and drive the offline message templates.
// Values are illustrative, tuned on one video, and not clinically validated.
// TODO: copy breakdownThreshold and the status cutoffs from code/config.yaml.

export const FATIGUE = {
  /** Baseline = median of the first N clean reps. */
  baselineReps: 3,
  /** Deviation in the "tired" direction is clipped to [0, cap] then rescaled to [0, 1]. */
  cap: 0.3,
  weights: { tempo: 0.35, depth: 0.3, speed: 0.35 },
  /** Rolling-median window for smoothing RFI. */
  smoothReps: 3,
  /** Breakdown rep = first rep where RFI stays above this for `breakdownRun` reps. */
  breakdownThreshold: 50,
  breakdownRun: 2,
  /** |reported_RPE - expected_RPE| at or above this raises a mismatch flag. */
  mismatchGap: 3,
} as const;

/**
 * AI analyzer red flag ("hidden overwork"): the set's overall RFI is above `minRfi` but the
 * athlete rated their exhaustion at or below `maxExhaustion`, or `FATIGUE.mismatchGap`
 * below what the data suggests. The server applies the same rule before asking Gemini.
 */
export const HIDDEN_OVERWORK = { minRfi: 50, maxExhaustion: 3 } as const;

/** Traffic-light cutoffs on RFI: below `amber` = Healthy, below `red` = Caution, else Fatigued. */
export const STATUS_CUTOFFS = { amber: 35, red: 60 } as const;
