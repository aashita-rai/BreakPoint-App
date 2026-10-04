import { create } from 'zustand';

import type { Workout } from '@/lib/squat-types';

// App state is shared by the athlete, coach and trainer views. It is session-only;
// uploaded workouts are not persisted after the app restarts.

// ── Departments ─────────────────────────────────────────────────────────────

export type Department = { id: string; sport: string; gender: "Men's" | "Women's"; rosterSize: number };

export const DEPARTMENTS: Department[] = [
  { id: 'm-football', sport: 'Football', gender: "Men's", rosterSize: 30 },
  { id: 'm-baseball', sport: 'Baseball', gender: "Men's", rosterSize: 20 },
  { id: 'm-basketball', sport: 'Basketball', gender: "Men's", rosterSize: 14 },
  { id: 'w-basketball', sport: 'Basketball', gender: "Women's", rosterSize: 14 },
  { id: 'w-gymnastics', sport: 'Gymnastics', gender: "Women's", rosterSize: 16 },
  { id: 'w-lacrosse', sport: 'Lacrosse', gender: "Women's", rosterSize: 20 },
  { id: 'w-soccer', sport: 'Soccer', gender: "Women's", rosterSize: 20 },
  { id: 'w-softball', sport: 'Softball', gender: "Women's", rosterSize: 18 },
  { id: 'm-swimming', sport: 'Swimming & Diving', gender: "Men's", rosterSize: 20 },
  { id: 'w-swimming', sport: 'Swimming & Diving', gender: "Women's", rosterSize: 20 },
  { id: 'm-tennis', sport: 'Tennis', gender: "Men's", rosterSize: 10 },
  { id: 'w-tennis', sport: 'Tennis', gender: "Women's", rosterSize: 10 },
  { id: 'm-track', sport: 'Track & Field', gender: "Men's", rosterSize: 20 },
  { id: 'w-track', sport: 'Track & Field', gender: "Women's", rosterSize: 20 },
  { id: 'w-volleyball', sport: 'Volleyball', gender: "Women's", rosterSize: 16 },
];

export const departmentLabel = (id: string) => {
  const d = DEPARTMENTS.find((x) => x.id === id);
  return d ? `${d.gender} ${d.sport}` : '';
};

export type Athlete = {
  id: string;
  name: string;
  departmentId: string;
  /** Position or role supplied at sign-in. */
  detail: string;
  /** Newest first. Workout #1 is workouts[0]. */
  workouts: Workout[];
};

export type Feedback = {
  id: string;
  athleteId: string;
  /** null = general feedback not tied to one workout. */
  workoutId: string | null;
  coach: string;
  date: string;
  message: string;
  source: 'typed' | 'voice';
};

// ── Store ──────────────────────────────────────────────────────────────────

type Data = { athletes: Athlete[]; feedback: Feedback[] };

type Store = Data & {
  addWorkout: (athleteId: string, w: Workout) => void;
  updateWorkout: (workoutId: string, patch: Partial<Workout>) => void;
  addFeedback: (f: Omit<Feedback, 'id' | 'date'>) => void;
  ensureAthlete: (a: Athlete) => void;
};

export const useStore = create<Store>()((set) => ({
  athletes: [],
  feedback: [],
  addWorkout: (athleteId, w) =>
    set((s) => ({
      athletes: s.athletes.map((a) => (a.id === athleteId ? { ...a, workouts: [w, ...a.workouts] } : a)),
    })),
  updateWorkout: (workoutId, patch) =>
    set((s) => ({
      athletes: s.athletes.map((a) =>
        a.workouts.some((w) => w.id === workoutId)
          ? { ...a, workouts: a.workouts.map((w) => (w.id === workoutId ? { ...w, ...patch } : w)) }
          : a
      ),
    })),
  addFeedback: (f) =>
    set((s) => ({ feedback: [{ ...f, id: `f${Date.now()}`, date: new Date().toISOString() }, ...s.feedback] })),
  ensureAthlete: (a) =>
    set((s) => (s.athletes.some((x) => x.id === a.id) ? s : { athletes: [...s.athletes, a] })),
}));

export const addWorkout = (athleteId: string, w: Workout) => useStore.getState().addWorkout(athleteId, w);
export const updateWorkout = (id: string, patch: Partial<Workout>) => useStore.getState().updateWorkout(id, patch);
export const addFeedback = (f: Omit<Feedback, 'id' | 'date'>) => useStore.getState().addFeedback(f);

// ── Selectors ──────────────────────────────────────────────────────────────

export function athletesIn(s: Data, departmentId: string) {
  return s.athletes.filter((a) => a.departmentId === departmentId);
}

export function getAthlete(s: Data, id: string) {
  return s.athletes.find((a) => a.id === id);
}

/** Finds a workout plus its owner and its number in that athlete's list (#1 = newest). */
export function findWorkout(s: Data, workoutId: string) {
  for (const athlete of s.athletes) {
    const i = athlete.workouts.findIndex((w) => w.id === workoutId);
    if (i >= 0) return { athlete, workout: athlete.workouts[i], number: i + 1 };
  }
  return null;
}

export function feedbackFor(s: Data, athleteId: string) {
  return s.feedback.filter((f) => f.athleteId === athleteId).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Signs an athlete in. If the name matches someone on the roster (e.g. jadan.baugh@ufl.edu
 * → Jadan Baugh) they get that athlete's dashboard; otherwise a new, empty athlete is added.
 */
export function signInAthlete(name: string, departmentId: string) {
  const s = useStore.getState();
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  const match = athletesIn(s, departmentId).find((a) => a.name.toLowerCase().replace(/[^a-z]/g, '') === key);
  if (match) return match.id;
  const id = `${departmentId}-user-${key || 'athlete'}`;
  s.ensureAthlete({ id, name, departmentId, detail: 'Athlete', workouts: [] });
  return id;
}

export type Role = 'student' | 'coach' | 'trainer';

// Who is signed in, set on the sign-in screen.
export const session = {
  role: 'student' as Role,
  name: '',
  departmentId: 'm-football',
  athleteId: '',
};

export const isStaff = () => session.role !== 'student';
