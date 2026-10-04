import { FATIGUE, HIDDEN_OVERWORK } from '@/lib/config';
import { expectedRpe } from '@/lib/fatigue';
import type { AnalysisResult, CheckIn, Insights } from '@/lib/squat-types';

// Rule-based version of the AI analyzer (server: POST /insights, Gemini).
// Used offline and whenever the server call fails.
// The red-flag decision itself is the same rule on both sides, so it never depends
// on the network.

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

const POSITIVE = ['well', 'good', 'great', 'easy', 'fine', 'strong', 'solid', 'awesome', 'not bad', 'felt good', 'nice'];
const NEGATIVE = ['tired', 'hard', 'rough', 'exhausted', 'bad', 'struggl', 'sore', 'heavy', 'pain', 'hurt', 'dead', 'gassed'];

export function sentimentOf(text: string): Insights['sentiment'] {
  const t = text.toLowerCase();
  const pos = POSITIVE.filter((w) => t.includes(w)).length;
  const neg = NEGATIVE.filter((w) => t.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export function ruleInsights(result: AnalysisResult, checkIn: CheckIn, athleteName: string): Insights {
  const f = setFacts(result);
  const first = athleteName.split(' ')[0] || 'The athlete';
  const red = isHiddenOverwork(result, checkIn);
  const sentiment = sentimentOf(checkIn.notes);
  const said = checkIn.notes.trim() ? ` and described it as "${checkIn.notes.trim()}"` : '';

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

  const flagReason = red
    ? `Rated exhaustion ${checkIn.rpe}/10${said}, but the fatigue index reached ${f.overallRfi} (expected exhaustion about ${expectedRpe(f.overallRfi)}/10).`
    : null;

  return {
    flag: red ? 'red' : 'none',
    flag_reason: flagReason,
    sentiment,
    headline: red
      ? 'Possible hidden overwork'
      : f.breakdownRep
        ? `Fatigue built up from rep ${f.breakdownRep}`
        : 'Steady set',
    insights: insights.slice(0, 4),
    athlete_note: red
      ? `You rated your exhaustion low, but your squats show you were working much harder than it felt, especially after rep ${f.breakdownRep ?? f.peakRep}. That's common when you're focused. Ease off when your depth starts to slip, and tell your coach or athletic trainer if you've been feeling run down.`
      : f.breakdownRep
        ? `Your form started to fade around rep ${f.breakdownRep}. Stopping the set when depth starts slipping keeps your reps high quality.`
        : 'Your reps stayed consistent from start to finish. Keep checking in so changes are easy to spot.',
    coach_note: red
      ? `${first} reported low exhaustion (${checkIn.rpe}/10) after a set with an RFI of ${f.overallRfi}. Consider a check-in conversation and keep an eye on load before increasing volume. This is a screening flag, not a diagnosis.`
      : `${first}: RFI ${f.overallRfi}, exhaustion ${checkIn.rpe}/10. No hidden-overwork flag.`,
    source: 'rules',
  };
}
