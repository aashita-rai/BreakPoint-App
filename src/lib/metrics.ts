// Display helpers. All fatigue maths lives in fatigue.ts (or on the server).

export function formatClock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Depth is a fraction of standing leg length (L). */
export const formatDepth = (d: number) => d.toFixed(2);
export const DEPTH_UNIT = '× leg length';

/** Ascent speed is in leg-lengths per second. */
export const formatSpeed = (v: number) => v.toFixed(2);
export const SPEED_UNIT = 'L/s';

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
