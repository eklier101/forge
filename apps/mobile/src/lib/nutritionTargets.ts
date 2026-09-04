import { lbToKg } from "./bodyProfile";
import { trainingGoal as resolveGoal, type TrainingGoalId } from "./trainingGoals";

/** Rough fat / muscle axes for current → goal calorie direction. */
const FATNESS: Record<string, number> = {
  slim: 1,
  athletic: 2,
  muscular: 2,
  average: 3,
  soft: 4,
  heavy: 5,
};

const MUSCLE: Record<string, number> = {
  slim: 1,
  average: 2,
  soft: 2,
  heavy: 2,
  athletic: 4,
  muscular: 5,
};

/** Estimated BMI when weight isn't synced yet. */
const BMI_FOR_TYPE: Record<string, number> = {
  slim: 19.5,
  average: 24,
  soft: 27.5,
  heavy: 32,
  athletic: 23,
  muscular: 26.5,
};

export type MacroTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
};

export type TargetInput = {
  heightCm: number;
  weightLb?: number | null;
  bodyTypeCurrent?: string | null;
  bodyTypeGoal?: string | null;
  gymDaysPerWeek?: number;
  ageYears?: number;
  sex?: "male" | "female" | null;
  trainingGoal?: TrainingGoalId | string | null;
};

function estimateWeightKg(heightCm: number, bodyType: string | null | undefined): number {
  const m = heightCm / 100;
  const bmi = BMI_FOR_TYPE[bodyType ?? "average"] ?? 24;
  return bmi * m * m;
}

/**
 * Suggest daily targets from height, weight, physique, and training goal.
 * Uses Mifflin–St Jeor + goal surplus/deficit.
 */
export function suggestNutritionTargets(input: TargetInput): MacroTargets | null {
  const heightCm = Number(input.heightCm);
  if (!heightCm || heightCm < 100 || heightCm > 250) return null;

  const current = input.bodyTypeCurrent ?? "average";
  const goal = input.bodyTypeGoal ?? current;
  const age = input.ageYears && input.ageYears > 14 ? input.ageYears : 30;

  let weightKg: number;
  if (input.weightLb != null && input.weightLb > 50) {
    weightKg = lbToKg(input.weightLb);
  } else {
    weightKg = estimateWeightKg(heightCm, current);
  }
  const weightLb = weightKg * 2.20462;

  const sexAdj = input.sex === "female" ? -161 : 5;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexAdj;
  const gymDays = Math.min(7, Math.max(0, Number(input.gymDaysPerWeek) || 3));
  const activity = 1.2 + gymDays * 0.075;
  const tdee = bmr * activity;

  const tg = resolveGoal(input.trainingGoal);
  let calAdj = tg.calorieDelta;

  if (!input.trainingGoal) {
    const fatDelta = (FATNESS[current] ?? 3) - (FATNESS[goal] ?? 3);
    const muscleDelta = (MUSCLE[goal] ?? 2) - (MUSCLE[current] ?? 2);
    calAdj = 0;
    if (fatDelta > 0) calAdj -= Math.min(500, 150 + fatDelta * 100);
    else if (fatDelta < 0) calAdj += Math.min(400, 100 + Math.abs(fatDelta) * 80);
    if (muscleDelta > 0 && fatDelta <= 0) calAdj += 150;
    if (muscleDelta > 0 && fatDelta > 0) calAdj += 50;
  }

  const calories = Math.round((tdee + calAdj) / 50) * 50;
  const clampedCal = Math.min(4500, Math.max(1400, calories));

  const protein = Math.round(weightLb * tg.proteinPerLb);
  const fatPct = tg.id === "shred" || tg.id === "cut" ? 0.25 : 0.28;
  const fat = Math.round((clampedCal * fatPct) / 9);
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const remain = Math.max(0, clampedCal - proteinCals - fatCals);
  const carbs = Math.round((remain * tg.carbBias) / 4);
  const used = proteinCals + fatCals + carbs * 4;
  const fatAdj = used < clampedCal - 20 ? Math.round((clampedCal - used) / 9) : 0;

  const fiber = Math.max(25, Math.round((clampedCal / 1000) * 14));
  const sugar = Math.min(50, Math.max(20, Math.round((clampedCal * 0.08) / 4)));

  return {
    calories: clampedCal,
    protein,
    carbs,
    fat: fat + fatAdj,
    fiber,
    sugar,
    sodium: 2300,
  };
}
