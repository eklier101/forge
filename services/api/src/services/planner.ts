export type PreferenceLike = {
  gymDaysPerWeek: number;
  gymWeekdays: unknown;
  splitId: string;
  homeWorkoutsEnabled: boolean;
  progressionFocus: string;
  favoriteExerciseIds: unknown;
  dislikedExerciseIds: unknown;
  ownedEquipment?: unknown;
  restTimerSeconds: number;
  focusMuscleIds?: unknown;
  muscleRecovery?: Record<string, unknown>;
  lastDifficulties?: Record<string, string>;
  sex?: string | null;
} | null | undefined;

export type ExerciseLike = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  location: string;
};

export type PlannedExercise = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  suggestedWeight?: number;
  restSeconds: number;
};

export type DayPlan = {
  date: string;
  weekday: number;
  kind: "gym" | "home" | "rest";
  focus: string;
  exercises: PlannedExercise[];
};

const SPLIT_FOCUS: Record<string, string[]> = {
  full_body_3: ["full", "full", "full"],
  upper_lower_4: ["upper", "lower", "upper", "lower"],
  ppl_3: ["push", "pull", "legs"],
  ppl_6: ["push", "pull", "legs", "push", "pull", "legs"],
  bro_5: ["chest", "back", "shoulders", "legs", "arms"],
};

const FOCUS_MUSCLES: Record<string, string[]> = {
  full: ["chest", "back", "legs", "shoulders", "core"],
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["legs", "hamstrings", "glutes", "calves", "core"],
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps"],
  legs: ["legs", "hamstrings", "glutes", "calves"],
  chest: ["chest", "triceps"],
  back: ["back", "biceps"],
  shoulders: ["shoulders", "triceps"],
  arms: ["biceps", "triceps"],
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Deterministic PRNG so regenerating with a new seed changes picks. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weekStartSunday(from = new Date()): Date {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function weekDates(from = new Date()): string[] {
  const start = weekStartSunday(from);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return isoDate(d);
  });
}

function buildPool(
  catalog: ExerciseLike[],
  location: "gym" | "home",
  focus: string,
  disliked: string[],
  ownedEquipment: string[],
  excludeIds: string[] = [],
): ExerciseLike[] {
  const muscles = FOCUS_MUSCLES[focus] ?? ["full"];
  const owned = new Set(ownedEquipment.length ? ownedEquipment : ["bodyweight"]);
  const excluded = new Set(excludeIds);
  return catalog.filter(
    (e) =>
      !disliked.includes(e.id) &&
      !excluded.has(e.id) &&
      owned.has(e.equipment) &&
      (e.location === location || e.location === "both") &&
      (focus === "full" || focus === "home" || muscles.includes(e.muscleGroup) || e.muscleGroup === "full"),
  );
}

function rankPool(pool: ExerciseLike[], favorites: string[], rand: () => number): ExerciseLike[] {
  const fav = pool.filter((e) => favorites.includes(e.id));
  const rest = pool.filter((e) => !favorites.includes(e.id));
  shuffleInPlace(fav, rand);
  shuffleInPlace(rest, rand);
  // Favorites first (still shuffled among themselves), then the rest
  return [...fav, ...rest];
}

function toPlanned(
  chosen: ExerciseLike[],
  location: "gym" | "home",
  restSeconds: number,
  progressionFocus: string,
  lastWeights: Record<string, number>,
): PlannedExercise[] {
  const reps = progressionFocus === "reps" ? 12 : progressionFocus === "weight" ? 6 : 8;
  const sets = location === "home" ? 3 : 4;
  return chosen.map((e) => {
    const last = lastWeights[e.id];
    let suggestedWeight: number | undefined;
    if (last != null && last > 0) {
      suggestedWeight =
        progressionFocus === "weight" ? Math.round(last + (last >= 100 ? 5 : 2.5)) : last;
    }
    return {
      exerciseId: e.id,
      name: e.name,
      sets,
      reps,
      restSeconds,
      ...(suggestedWeight != null ? { suggestedWeight } : {}),
    };
  });
}

function pickExercises(
  catalog: ExerciseLike[],
  location: "gym" | "home",
  focus: string,
  favorites: string[],
  disliked: string[],
  ownedEquipment: string[],
  count: number,
  restSeconds: number,
  progressionFocus: string,
  lastWeights: Record<string, number>,
  seed: string,
): PlannedExercise[] {
  const rand = mulberry32(hashSeed(seed));
  const pool = rankPool(buildPool(catalog, location, focus, disliked, ownedEquipment), favorites, rand);
  return toPlanned(pool.slice(0, count), location, restSeconds, progressionFocus, lastWeights);
}

export type GenerateOptions = {
  seed?: string;
  lastWeights?: Record<string, number>;
};

export function generateWeekPlan(
  prefs: PreferenceLike,
  catalog: ExerciseLike[],
  options: GenerateOptions = {},
): DayPlan[] {
  const gymWeekdays = asNumberArray(prefs?.gymWeekdays).length
    ? asNumberArray(prefs?.gymWeekdays)
    : [1, 3, 5];
  const favorites = asStringArray(prefs?.favoriteExerciseIds);
  const disliked = asStringArray(prefs?.dislikedExerciseIds);
  const ownedEquipment = asStringArray(prefs?.ownedEquipment);
  const homeEnabled = prefs?.homeWorkoutsEnabled ?? true;
  const restSeconds = prefs?.restTimerSeconds ?? 90;
  const progressionFocus = prefs?.progressionFocus ?? "balanced";
  const splitId = prefs?.splitId ?? "full_body_3";
  const focuses = SPLIT_FOCUS[splitId] ?? SPLIT_FOCUS.full_body_3;
  const lastWeights = options.lastWeights ?? {};
  const seedBase = options.seed ?? isoDate(weekStartSunday());

  const start = weekStartSunday();
  const days: DayPlan[] = [];
  let gymIndex = 0;

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const weekday = date.getDay();
    const dateStr = isoDate(date);
    const isGym = gymWeekdays.includes(weekday);

    if (isGym) {
      const focus = focuses[gymIndex % focuses.length] ?? "full";
      gymIndex += 1;
      days.push({
        date: dateStr,
        weekday,
        kind: "gym",
        focus,
        exercises: pickExercises(
          catalog,
          "gym",
          focus,
          favorites,
          disliked,
          ownedEquipment,
          5,
          restSeconds,
          progressionFocus,
          lastWeights,
          `${seedBase}:${dateStr}:gym:${focus}`,
        ),
      });
    } else if (homeEnabled) {
      days.push({
        date: dateStr,
        weekday,
        kind: "home",
        focus: "home",
        exercises: pickExercises(
          catalog,
          "home",
          "full",
          favorites,
          disliked,
          ownedEquipment,
          4,
          60,
          progressionFocus,
          lastWeights,
          `${seedBase}:${dateStr}:home`,
        ),
      });
    } else {
      days.push({
        date: dateStr,
        weekday,
        kind: "rest",
        focus: "rest",
        exercises: [],
      });
    }
  }

  return days;
}

/** Candidates to swap in for an exercise on a given day. */
export function listSwapAlternatives(
  day: DayPlan,
  exerciseId: string,
  prefs: PreferenceLike,
  catalog: ExerciseLike[],
): ExerciseLike[] {
  const target = day.exercises.find((e) => e.exerciseId === exerciseId);
  if (!target) return [];
  const location = day.kind === "home" ? "home" : "gym";
  const disliked = asStringArray(prefs?.dislikedExerciseIds);
  const ownedEquipment = asStringArray(prefs?.ownedEquipment);
  const favorites = asStringArray(prefs?.favoriteExerciseIds);
  const used = day.exercises.map((e) => e.exerciseId);
  const pool = buildPool(catalog, location, day.focus, disliked, ownedEquipment, used);
  const rand = mulberry32(hashSeed(`${day.date}:${exerciseId}:alts`));
  return rankPool(pool, favorites, rand);
}

export function swapExercise(
  day: DayPlan,
  exerciseId: string,
  prefs: PreferenceLike,
  catalog: ExerciseLike[],
  lastWeights: Record<string, number>,
  replacementId?: string,
): DayPlan | null {
  const idx = day.exercises.findIndex((e) => e.exerciseId === exerciseId);
  if (idx < 0) return null;

  const alts = listSwapAlternatives(day, exerciseId, prefs, catalog);
  if (!alts.length) return null;

  const pick = replacementId ? alts.find((a) => a.id === replacementId) ?? alts[0] : alts[0];
  const progressionFocus = prefs?.progressionFocus ?? "balanced";
  const location = day.kind === "home" ? "home" : "gym";
  const restSeconds = day.exercises[idx].restSeconds;
  const [planned] = toPlanned([pick], location, restSeconds, progressionFocus, lastWeights);

  const exercises = [...day.exercises];
  exercises[idx] = planned;
  return { ...day, exercises };
}

export async function enhancePlan(plan: DayPlan[]): Promise<DayPlan[]> {
  const { getAppSettings } = await import("./settings.js");
  const settings = await getAppSettings();
  if (!settings.aiEnabled) {
    return plan;
  }

  const url = settings.ollamaUrl ?? "http://127.0.0.1:11434";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return plan;
    return plan;
  } catch {
    return plan;
  }
}
