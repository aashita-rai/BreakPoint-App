import { create } from 'zustand';

import { templateReport } from '@/lib/fatigue';
import { ruleInsights } from '@/lib/insights';
import type { CheckIn, PainLocation, Workout } from '@/lib/squat-types';
import { rng, simulateResult } from '@/services/simulate';

// App state (zustand), shared by the athlete, coach and trainer views. In memory only:
// resets when the app restarts. Team-view athletes and their sets are SIMULATED and
// labelled as such in the UI (README §11).

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

// ── Rosters ────────────────────────────────────────────────────────────────

// Real names from the 2026 Florida Gators football roster (positions as listed publicly).
// Their squat data is simulated, not real measurements.
const FOOTBALL_ROSTER: [string, string][] = [
  ['Aaron Philo', 'QB'],
  ['Tramell Jones Jr.', 'QB'],
  ['Aaron Williams', 'QB'],
  ['Will Griffin', 'QB'],
  ['Aidan Warner', 'QB'],
  ['Jadan Baugh', 'RB'],
  ['Duke Clark', 'RB'],
  ['Evan Pryor', 'RB'],
  ['London Montgomery', 'RB'],
  ['Anthony Rubio', 'RB'],
  ['Byron Louis', 'RB'],
  ['Brian Case', 'RB'],
  ['Vernell Brown III', 'WR'],
  ['Eric Singleton Jr.', 'WR'],
  ['Bailey Stockton', 'WR'],
  ['TJ Abrams', 'WR'],
  ['Micah Mays Jr.', 'WR'],
  ['Dallas Wilson', 'WR'],
  ['Davian Groce', 'WR'],
  ['Jaylen Lloyd', 'WR'],
  ['Amir Jackson', 'TE'],
  ['Luke Harpring', 'TE'],
  ['Lacota Dippre', 'TE'],
  ['Jayden Woods', 'JACK'],
  ['Bryce Thornton', 'S'],
  ['Lagonza Hayward', 'S'],
  ['Brandon Rabasco', 'K'],
  ['Liam Padron', 'K'],
  ['Alec Clark', 'P'],
  ['Carter Milliron', 'LS'],
];

// Made-up names for the other sports' simulated rosters.
const FIRST_M = ['Marcus', 'Tyler', 'Andre', 'Jordan', 'Caleb', 'Mason', 'Isaiah', 'Ethan', 'Noah', 'Diego', 'Owen', 'Xavier', 'Liam', 'Elijah', 'Gavin', 'Miles', 'Julian', 'Cole', 'Devin', 'Lucas'];
const FIRST_W = ['Ava', 'Maya', 'Sofia', 'Jasmine', 'Chloe', 'Leah', 'Brooke', 'Kayla', 'Nia', 'Elena', 'Riley', 'Zoe', 'Hannah', 'Gabriela', 'Taylor', 'Morgan', 'Alexis', 'Paige', 'Imani', 'Lauren'];
const LAST = ['Carter', 'Brooks', 'Rivera', 'Thompson', 'Nguyen', 'Patel', 'Morales', 'Bennett', 'Hayes', 'Coleman', 'Reed', 'Ortiz', 'Foster', 'Jenkins', 'Price', 'Sullivan', 'Ramirez', 'Washington', 'Kim', 'Delgado', 'Fletcher', 'Owens'];
const CLASS_YEARS = ['Fr.', 'So.', 'Jr.', 'Sr.', 'Gr.'];

const WORKOUT_TITLES = [
  'Bodyweight Squat Max Reps',
  'Bodyweight Squat Endurance Set',
  'Bodyweight Squat Tempo Set',
  'Bodyweight Squat Conditioning',
  'Bodyweight Squat Test',
];

export type Athlete = {
  id: string;
  name: string;
  departmentId: string;
  /** Football position, or class year for other sports. */
  detail: string;
  /** Newest first. Workout #1 is workouts[0]. */
  workouts: Workout[];
  simulated: boolean;
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

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

function sampleCheckIn(w: Workout, rand: () => number): CheckIn {
  const expected = Math.max(1, Math.min(10, w.result.overall_rfi / 10));
  const roll = rand();
  // Most athletes report honestly; some under-report (the case the app is built for).
  const rpe = Math.round(Math.max(1, Math.min(10, roll < 0.3 ? expected - 4 : roll < 0.4 ? expected + 3 : expected + (rand() - 0.5) * 2)));
  const pain = rand() < 0.15;
  const where: PainLocation[] = pain ? [(['knee', 'hip', 'back', 'ankle'] as const)[Math.floor(rand() * 4)]] : [];
  const phrases =
    rpe <= 3
      ? ['Went well, felt easy.', 'Felt good, could have done more.', 'Solid set, not tired.']
      : rpe <= 6
        ? ['Decent set, legs got a bit heavy.', 'Okay, last few reps were harder.', 'Felt fine overall.']
        : ['That was rough, legs were dead at the end.', 'Really tired today.', 'Hard set, struggled near the end.'];
  return { rpe, pain, pain_locations: where, notes: phrases[Math.floor(rand() * phrases.length)], date: w.date };
}

function sampleWorkouts(athleteId: string, name: string, seed: number): Workout[] {
  const rand = rng(seed);
  const count = 3 + Math.floor(rand() * 4);
  return Array.from({ length: count }, (_, k) => {
    const w: Workout = {
      id: `${athleteId}-w${count - k}`,
      title: WORKOUT_TITLES[Math.floor(rand() * WORKOUT_TITLES.length)],
      date: daysAgo(1 + k * 2 + Math.floor(rand() * 2)),
      result: simulateResult(Math.round(45 + rand() * 35), seed * 31 + k),
      simulated: true,
    };
    if (rand() < 0.7) {
      w.checkIn = sampleCheckIn(w, rand);
      w.report = templateReport(w.result, w.checkIn, name);
      w.insights = ruleInsights(w.result, w.checkIn, name);
    }
    return w;
  });
}

function buildRoster(dept: Department): Athlete[] {
  const rand = rng(hash(dept.id));
  const used = new Set<string>();
  const people: [string, string][] =
    dept.id === 'm-football'
      ? FOOTBALL_ROSTER
      : Array.from({ length: dept.rosterSize }, () => {
          const firsts = dept.gender === "Men's" ? FIRST_M : FIRST_W;
          let name = '';
          do {
            name = `${firsts[Math.floor(rand() * firsts.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
          } while (used.has(name));
          used.add(name);
          return [name, CLASS_YEARS[Math.floor(rand() * CLASS_YEARS.length)]];
        });

  return people.map(([name, detail]) => {
    const id = `${dept.id}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    return { id, name, departmentId: dept.id, detail, workouts: sampleWorkouts(id, name, hash(id)), simulated: true };
  });
}

function sampleFeedback(athletes: Athlete[]): Feedback[] {
  return athletes
    .filter((_, i) => i % 3 === 0)
    .map((a) => {
      const w = a.workouts[0];
      const { breakdown_rep, overall_rfi } = w.result;
      const message = breakdown_rep
        ? `Your fatigue index passed the line at rep ${breakdown_rep}. Stop the set when your depth starts slipping, and tell us if you're feeling run down.`
        : `Fatigue index stayed low (RFI ${overall_rfi}) for the whole set. Nice control.`;
      return {
        id: `f-${w.id}`,
        athleteId: a.id,
        workoutId: w.id,
        coach: 'Coaching Staff',
        date: w.date,
        message,
        source: 'typed' as const,
      };
    });
}

// ── Store ──────────────────────────────────────────────────────────────────

type Data = { athletes: Athlete[]; feedback: Feedback[] };

type Store = Data & {
  addWorkout: (athleteId: string, w: Workout) => void;
  updateWorkout: (workoutId: string, patch: Partial<Workout>) => void;
  addFeedback: (f: Omit<Feedback, 'id' | 'date'>) => void;
  ensureAthlete: (a: Athlete) => void;
};

const initialAthletes = DEPARTMENTS.flatMap(buildRoster);

export const useStore = create<Store>()((set) => ({
  athletes: initialAthletes,
  feedback: sampleFeedback(initialAthletes),
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
  s.ensureAthlete({ id, name, departmentId, detail: 'Athlete', workouts: [], simulated: false });
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
