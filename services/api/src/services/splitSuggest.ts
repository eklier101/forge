import type { ExerciseLike } from "./planner.js";

export type SplitOption = {
  id: string;
  days: number;
  label: string;
  focuses: string[];
};

export const SPLIT_CATALOG: SplitOption[] = [
  { id: "full_body_1", days: 1, label: "Full Body", focuses: ["full"] },
  { id: "full_body_2", days: 2, label: "Full Body ×2", focuses: ["full", "full"] },
  { id: "upper_lower_2", days: 2, label: "Upper / Lower", focuses: ["upper", "lower"] },
  { id: "full_body_3", days: 3, label: "Full Body ×3", focuses: ["full", "full", "full"] },
  { id: "ppl_3", days: 3, label: "Push / Pull / Legs", focuses: ["push", "pull", "legs"] },
  { id: "upper_lower_arms_3", days: 3, label: "Upper / Lower / Arms", focuses: ["upper", "lower", "arms"] },
  { id: "upper_lower_4", days: 4, label: "Upper / Lower", focuses: ["upper", "lower", "upper", "lower"] },
  { id: "ppl_full_4", days: 4, label: "PPL + Full", focuses: ["push", "pull", "legs", "full"] },
  { id: "bro_4", days: 4, label: "Chest / Back / Legs / Shoulders", focuses: ["chest", "back", "legs", "shoulders"] },
  { id: "bro_5", days: 5, label: "Bro Split", focuses: ["chest", "back", "shoulders", "legs", "arms"] },
  { id: "ul_ppl_5", days: 5, label: "UL + PPL", focuses: ["upper", "lower", "push", "pull", "legs"] },
  {
    id: "ppl_delts_5",
    days: 5,
    label: "PPL + Delts / Arms",
    focuses: ["push", "pull", "legs", "shoulders", "arms"],
  },
  { id: "ppl_6", days: 6, label: "PPL ×2", focuses: ["push", "pull", "legs", "push", "pull", "legs"] },
  {
    id: "bro_6",
    days: 6,
    label: "Bro + Core day",
    focuses: ["chest", "back", "shoulders", "legs", "arms", "full"],
  },
  {
    id: "athlete_7",
    days: 7,
    label: "Daily mix",
    focuses: ["push", "pull", "legs", "upper", "lower", "arms", "full"],
  },
];

const PUSH = new Set(["chest", "shoulders", "triceps"]);
const PULL = new Set(["back", "biceps"]);
const LEGS = new Set(["legs", "hamstrings", "glutes", "calves"]);
const ARMS = new Set(["biceps", "triceps", "shoulders"]);

function hashPick(seed: string, len: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, len);
}

/**
 * Pick a split from gym-day count + favorite muscle bias.
 * Rotates among good options so weeks don't always look identical.
 */
export function suggestSplitId(
  gymDaysPerWeek: number,
  catalog: ExerciseLike[],
  favoriteIds: string[],
  rotateSeed?: string,
): string {
  const n = Math.min(7, Math.max(1, gymDaysPerWeek));
  const candidates = SPLIT_CATALOG.filter((s) => s.days === n);
  const pool = candidates.length
    ? candidates
    : SPLIT_CATALOG.filter((s) => s.days === Math.min(6, n) || s.days === Math.max(1, n - 1));
  if (!pool.length) return "ppl_3";

  const favs = catalog.filter((e) => favoriteIds.includes(e.id));
  let push = 0;
  let pull = 0;
  let legs = 0;
  let arms = 0;
  for (const e of favs) {
    if (PUSH.has(e.muscleGroup)) push += 1;
    else if (PULL.has(e.muscleGroup)) pull += 1;
    else if (LEGS.has(e.muscleGroup)) legs += 1;
    if (ARMS.has(e.muscleGroup)) arms += 1;
  }

  const scored = pool.map((s) => {
    let score = 0;
    const focuses = new Set(s.focuses);
    if (push >= pull && push >= legs && focuses.has("push")) score += 3;
    if (pull >= push && pull >= legs && focuses.has("pull")) score += 3;
    if (legs > push && legs > pull && (focuses.has("legs") || focuses.has("lower"))) score += 3;
    if (arms >= 2 && (focuses.has("arms") || focuses.has("shoulders"))) score += 2;
    if (focuses.has("upper") && focuses.has("lower")) score += 1;
    if (s.id.includes("ppl")) score += 1;
    if (s.id.includes("bro") && favs.length >= 4) score += 1;
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  const top = scored.filter((x) => x.score >= topScore - 1).map((x) => x.s);
  const seed = rotateSeed ?? `${n}:${favoriteIds.slice(0, 5).join(",")}:${new Date().getUTCDay()}`;
  return top[hashPick(seed, top.length)]?.id ?? pool[0].id;
}

export function defaultWeekdaysForCount(n: number): number[] {
  const map: Record<number, number[]> = {
    1: [3],
    2: [2, 5],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return map[Math.min(7, Math.max(1, n))] ?? [1, 3, 5];
}

export function splitFocuses(splitId: string): string[] {
  return SPLIT_CATALOG.find((s) => s.id === splitId)?.focuses ?? ["push", "pull", "legs"];
}
