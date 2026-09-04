/**
 * Fasting intelligence v1 — heuristics + labels (no trained model yet).
 */

export type LastMealMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FastBreakReason = "planned" | "hunger" | "workout" | "social" | "other";

export type FastHistoryRow = {
  startedAt: string;
  endedAt?: string;
  durationHours?: number;
  status: string;
  targetHours?: number;
  tzOffsetMinutes?: number;
  endTzOffsetMinutes?: number;
  endedLocalDay?: string;
  hunger?: number;
  energy?: number;
  breakReason?: FastBreakReason;
  lastMealAt?: string;
  lastMealMacros?: LastMealMacros;
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Local minutes-from-midnight for an ISO instant with optional fixed offset. */
export function localMinutesOfDay(iso: string, offsetMinutes?: number): number | null {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  if (typeof offsetMinutes === "number" && Number.isFinite(offsetMinutes)) {
    const shifted = new Date(ms + offsetMinutes * 60_000);
    return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  }
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

export function formatLocalTimeLabel(minutes: number): string {
  const h = Math.floor(((minutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const m = ((minutes % 60) + 60) % 60;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

export function suggestedTargetHours(history: FastHistoryRow[]): number {
  const completed = history
    .filter((s) => s.status === "completed" && Number(s.durationHours ?? 0) >= 1)
    .map((s) => Number(s.durationHours))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 72);
  const med = median(completed.slice(0, 20));
  if (med == null) return 16;
  // Round to nearest 0.5h, clamp 12–24 for suggestions (user can still pick other targets).
  const rounded = Math.round(med * 2) / 2;
  return Math.min(24, Math.max(12, rounded));
}

export function suggestedEndWindow(history: FastHistoryRow[]): {
  fromLabel: string;
  toLabel: string;
  sampleSize: number;
} | null {
  const mins: number[] = [];
  for (const s of history) {
    if (s.status !== "completed" || !s.endedAt) continue;
    if (Number(s.durationHours ?? 0) < 1) continue;
    const offset =
      typeof s.endTzOffsetMinutes === "number"
        ? s.endTzOffsetMinutes
        : typeof s.tzOffsetMinutes === "number"
          ? s.tzOffsetMinutes
          : undefined;
    const m = localMinutesOfDay(s.endedAt, offset);
    if (m != null) mins.push(m);
  }
  if (mins.length < 2) return null;
  const sample = mins.slice(0, 30);
  const med = median(sample);
  if (med == null) return null;
  // ±45 minutes around median end time
  const lo = med - 45;
  const hi = med + 45;
  return {
    fromLabel: formatLocalTimeLabel(lo),
    toLabel: formatLocalTimeLabel(hi),
    sampleSize: sample.length,
  };
}

export function energyWorkoutTip(opts: {
  elapsedHours: number;
  lastMealMacros?: LastMealMacros | null;
  hoursSinceMeal?: number | null;
}): string | null {
  const { elapsedHours, lastMealMacros, hoursSinceMeal } = opts;
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0) return null;

  const cal = Number(lastMealMacros?.calories ?? 0);
  const carbs = Number(lastMealMacros?.carbs ?? 0);
  const carbRatio = cal > 0 ? carbs * 4 / cal : 0;

  if (hoursSinceMeal != null && hoursSinceMeal < 2) {
    return "You ate recently — easy movement is fine; save heavy lifts for later in the fast.";
  }
  if (carbRatio >= 0.45 && elapsedHours < 10) {
    return "Last meal was carb-heavy. For a hard lift, waiting closer to 10–14h into the fast often feels better.";
  }
  if (elapsedHours >= 12 && elapsedHours < 18) {
    return "You’re in a common fat-burn window — many people feel steady energy for training here.";
  }
  if (elapsedHours >= 18) {
    return "Long fast — keep intensity honest. Strength work is fine if you feel solid; skip ego loads.";
  }
  if (elapsedHours >= 6) {
    return "Mid-fast: light to moderate training usually sits well. Listen to energy, not the clock alone.";
  }
  return "Early in the fast — hydrate and keep sessions short until you’ve got a few hours in.";
}

export function refeedMacroTip(nextKind: "gym" | "home" | "rest" | null | undefined): string {
  if (nextKind === "gym" || nextKind === "home") {
    return "Breaking before training: lean protein + some carbs (rice, fruit, potatoes) — go easier on heavy fats until after the session.";
  }
  if (nextKind === "rest") {
    return "Rest day refeed: protein-forward with fiber and veggies; you don’t need a big carb spike.";
  }
  return "Break gently: protein + veggies first, then carbs if you’re still hungry.";
}

export function crashRiskTip(opts: {
  lastMealMacros?: LastMealMacros | null;
  hoursUntilWorkout?: number | null;
}): string | null {
  const cal = Number(opts.lastMealMacros?.calories ?? 0);
  const carbs = Number(opts.lastMealMacros?.carbs ?? 0);
  const sugar = undefined; // not always on meal
  void sugar;
  const carbRatio = cal > 0 ? (carbs * 4) / cal : 0;
  const hours = opts.hoursUntilWorkout;
  if (hours == null || hours > 4 || hours < 0) return null;
  if (carbRatio >= 0.55 && carbs >= 60) {
    return "High-carb meal close to a workout — watch for a sluggish dip. Pair with protein or wait a bit longer before hard sets.";
  }
  return null;
}
