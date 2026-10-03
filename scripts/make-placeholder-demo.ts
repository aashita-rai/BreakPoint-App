// Writes assets/demo/result.json as a SYNTHETIC placeholder (synthetic: true), so the
// "Use demo video" button works before the real pipeline has run. RUNBOOK step 7
// (code/make_demo_bundle.py) replaces this file with the real result for squats.mp4.
//
//   npx tsx scripts/make-placeholder-demo.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { simulateResult } from '../src/services/simulate';

const out = join(__dirname, '..', 'assets', 'demo', 'result.json');
mkdirSync(dirname(out), { recursive: true });
// ~2 minutes, like squats.mp4.
const result = { ...simulateResult(120, 2026), model: 'synthetic-placeholder', annotated_video_url: null };
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`Wrote ${out}: ${result.reps.length} reps, breakdown ${result.breakdown_rep}, overall RFI ${result.overall_rfi}`);
