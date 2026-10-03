import { computeFatigue, type RawRep } from '@/lib/fatigue';
import type { AnalysisResult } from '@/lib/squat-types';

// Generates realistic-looking squat sets for the simulated team view and the
// placeholder demo bundle. Nothing here comes from a real video.

/** Small seeded random generator so sample data is the same on every launch. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Steady reps, then slower, shallower and slower-rising ones once fatigue sets in. */
export function simulateResult(durationSec: number, seed: number): AnalysisResult {
  const rand = rng(seed);
  const baseTempo = 2.0 + rand() * 0.4;
  const baseDepth = 0.58 + rand() * 0.1;
  const fatigueAt = 0.45 + rand() * 0.25;
  const raw: RawRep[] = [];
  let t = 1.5 + rand();

  while (true) {
    const tired = Math.max(0, t / durationSec - fatigueAt) / (1 - fatigueAt);
    const tempo = baseTempo * (1 + tired * 0.6) + (rand() - 0.5) * 0.15;
    if (t + tempo > durationSec) break;
    const ascent = tempo * (0.55 + tired * 0.05);
    const depth = baseDepth * (1 - tired * 0.28) + (rand() - 0.5) * 0.02;
    raw.push({
      i: raw.length + 1,
      start_t: round(t),
      bottom_t: round(t + tempo - ascent),
      end_t: round(t + tempo),
      depth: round(depth),
      ascent_speed: round((depth / ascent) * (1.1 - tired * 0.1) + (rand() - 0.5) * 0.02),
    });
    t += tempo + 0.3 + tired * 0.6 + rand() * 0.2;
  }

  return { movement: 'squat', model: 'simulated', fps: 30, ...computeFatigue(raw), synthetic: true };
}
