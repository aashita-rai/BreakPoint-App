import { FATIGUE, HIDDEN_OVERWORK, STATUS_CUTOFFS } from '@/lib/config';
import { expectedRpe } from '@/lib/fatigue';
import type { AnalysisResult, CheckIn, Insights } from '@/lib/squat-types';

// Rule-based version of the AI analyzer (server: POST /insights, Gemini).
// Used offline and whenever the server call fails.
// Flag: green when the athlete's words, their 1-10 exhaustion rating and the measured
// fatigue line up; red when they don't. The rating-vs-data check is the same rule on both
// sides, so a red flag never depends on the network.

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (v: number) => Math.round(v * 100);

/** Plain numbers describing where the set fell apart, compared with the athlete's baseline. */
export function setFacts(result: AnalysisResult) {
  const { baseline, reps, breakdown_rep } = result;
  const after = breakdown_rep ? reps.filter((r) => r.i >= breakdown_rep) : [];
  const peak = reps.reduce((best, r) => (r.rfi > best.rfi ? r : best), reps[0]);
  return {
    totalReps: reps.length,
    breakdownRep: breakdown_rep,
    breakdownTime: breakdown_rep ? (reps.find((r) => r.i === breakdown_rep)?.start_t ?? null) : null,
    repsAfterBreakdown: after.length,
    tempoRisePct: after.length ? pct(mean(after.map((r) => r.tempo_s)) / baseline.tempo_s - 1) : 0,
    depthDropPct: after.length ? pct(1 - mean(after.map((r) => r.depth)) / baseline.depth) : 0,
    speedDropPct: after.length ? pct(1 - mean(after.map((r) => r.ascent_speed)) / baseline.ascent_speed) : 0,
    peakRfi: peak?.rfi ?? 0,
    peakRep: peak?.i ?? null,
    overallRfi: result.overall_rfi,
  };
}

/** The red-flag rule (mirrored in the server's /insights route). */
export function isHiddenOverwork(result: AnalysisResult, checkIn: CheckIn) {
  if (result.overall_rfi <= HIDDEN_OVERWORK.minRfi) return false;
  const gap = expectedRpe(result.overall_rfi) - checkIn.rpe;
  return checkIn.rpe <= HIDDEN_OVERWORK.maxExhaustion || gap >= FATIGUE.mismatchGap;
}

const POSITIVE = ['well', 'good', 'great', 'easy', 'fine', 'strong', 'solid', 'awesome', 'felt good', 'nice'];
const NEGATIVE = ['tired', 'hard', 'rough', 'exhausted', 'bad', 'struggl', 'sore', 'heavy', 'pain', 'hurt', 'dead', 'gassed'];
// "not tired" reads as positive and "not great" as negative, so negated phrases are scored first.
const NEGATED = /\b(?:not|never|wasn'?t|isn'?t|didn'?t feel|don'?t feel)\s+(?:too\s+|that\s+|very\s+|so\s+)?(\w+)/g;

export function sentimentOf(text: string): Insights['sentiment'] {
  let pos = 0;
  let neg = 0;
  const t = text.toLowerCase().replace(NEGATED, (_, word: string) => {
    if (NEGATIVE.some((w) => word.startsWith(w))) pos++;
    else if (POSITIVE.some((w) => word.startsWith(w))) neg++;
    return ' ';
  });
  pos += POSITIVE.filter((w) => t.includes(w)).length;
  neg += NEGATIVE.filter((w) => t.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/**
 * Ways the 1-10 exhaustion rating disagrees with the measured fatigue. Deterministic, so
 * the AI can add a red flag but never remove one of these (mirrored on the server).
 */
export function ratingIssues(result: AnalysisResult, checkIn: CheckIn): string[] {
  const expected = expectedRpe(result.overall_rfi);
  const rfi = result.overall_rfi;
  if (isHiddenOverwork(result, checkIn)) {
    return [`Rated exhaustion ${checkIn.rpe}/10, but the fatigue index reached ${rfi} (expected exhaustion about ${expected}/10).`];
  }
  if (checkIn.rpe - expected >= FATIGUE.mismatchGap) {
    return [`Rated exhaustion ${checkIn.rpe}/10, but the movement data shows little fatigue (RFI ${rfi}, expected about ${expected}/10).`];
  }
  return [];
}

/** Ways the athlete's own words disagree with their rating or the data (keyword fallback for the AI). */
export function wordIssues(result: AnalysisResult, checkIn: CheckIn): string[] {
  const notes = checkIn.notes.trim();
  if (!notes) return [];
  const sentiment = sentimentOf(notes);
  const rfi = result.overall_rfi;
  const issues: string[] = [];
  if (sentiment === 'positive' && rfi > HIDDEN_OVERWORK.minRfi) {
    issues.push(`Described the set as "${notes}", but the movement data shows clear fatigue (RFI ${rfi}).`);
  } else if (sentiment === 'negative' && rfi < STATUS_CUTOFFS.amber && checkIn.rpe - expectedRpe(rfi) >= 2) {
    issues.push(`Described the set as "${notes}", but tempo, depth and speed barely changed (RFI ${rfi}).`);
  }
  if (sentiment === 'positive' && checkIn.rpe >= 8) {
    issues.push(`Described the set as "${notes}" but rated exhaustion ${checkIn.rpe}/10.`);
  } else if (sentiment === 'negative' && checkIn.rpe <= 3) {
    issues.push(`Described the set as "${notes}" but rated exhaustion only ${checkIn.rpe}/10.`);
  }
  return issues;
}

/** One sentence for a green flag: why the self-report and the data agree. */
export function alignedReason(result: AnalysisResult, checkIn: CheckIn) {
  return `Rated exhaustion ${checkIn.rpe}/10 against an expected ${expectedRpe(result.overall_rfi)}/10 from the movement data (RFI ${result.overall_rfi})${
    checkIn.notes.trim() ? ', and their description matches' : ''
  }.`;
}

export function ruleInsights(result: AnalysisResult, checkIn: CheckIn, athleteName: string): Insights {
  const f = setFacts(result);
  const first = athleteName.split(' ')[0] || 'The athlete';
  const hidden = isHiddenOverwork(result, checkIn);
  const issues = [...ratingIssues(result, checkIn), ...wordIssues(result, checkIn)];
  const red = issues.length > 0;
  const sentiment = sentimentOf(checkIn.notes);

  const insights: string[] = [];
  if (f.breakdownRep) {
    insights.push(
      `Form broke down at rep ${f.breakdownRep} of ${f.totalReps}, and ${f.repsAfterBreakdown} more reps were done after that point.`
    );
    if (f.depthDropPct > 0) insights.push(`After the breakdown, squats were ${f.depthDropPct}% shallower than the first reps.`);
    if (f.speedDropPct > 0) insights.push(`Rising out of the squat slowed by ${f.speedDropPct}% compared with the start of the set.`);
    if (f.tempoRisePct > 0) insights.push(`Each rep took ${f.tempoRisePct}% longer by the end of the set.`);
  } else {
    insights.push(`Tempo, depth and speed stayed close to the first reps for all ${f.totalReps} reps.`);
  }
  if (sentiment === 'positive' && f.overallRfi > HIDDEN_OVERWORK.minRfi) {
    insights.push('The workout was described positively even though the movement data shows clear fatigue.');
  }

  return {
    flag: red ? 'red' : 'green',
    flag_reason: red ? issues.join(' ') : alignedReason(result, checkIn),
    sentiment,
    headline: hidden
      ? 'Possible hidden overwork'
      : red
        ? "Self-report doesn't match the data"
        : f.breakdownRep
        ? `Fatigue built up from rep ${f.breakdownRep}`
        : 'Steady set',
    insights: insights.slice(0, 4),
    athlete_note: hidden
      ? `You rated your exhaustion low, but your squats show you were working much harder than it felt, especially after rep ${f.breakdownRep ?? f.peakRep}. That's common when you're focused. Ease off when your depth starts to slip, and tell your coach or athletic trainer if you've been feeling run down.`
      : f.breakdownRep
        ? `Your form started to fade around rep ${f.breakdownRep}. Stopping the set when depth starts slipping keeps your reps high quality.`
        : 'Your reps stayed consistent from start to finish. Keep checking in so changes are easy to spot.',
    coach_note: hidden
      ? `${first} reported low exhaustion (${checkIn.rpe}/10) after a set with an RFI of ${f.overallRfi}. Consider a check-in conversation and keep an eye on load before increasing volume. This is a screening flag, not a diagnosis.`
      : red
        ? `${first}'s check-in doesn't line up with the movement data (RFI ${f.overallRfi}, exhaustion ${checkIn.rpe}/10). Worth a quick conversation. This is a screening flag, not a diagnosis.`
        : `${first}: RFI ${f.overallRfi}, exhaustion ${checkIn.rpe}/10. Check-in lines up with the movement data.`,
    source: 'rules',
  };
}
