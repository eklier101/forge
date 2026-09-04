/** Shared server-side target suggestion (mirrors mobile nutritionTargets). */

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
  weightKg?: number | null;
  bodyTypeCurrent?: string | null;
  bodyTypeGoal?: string | null;
  gymDaysPerWeek?: number;
  ageYears?: number;
};

function estimateWeightKg(heightCm: number, bodyType: string | null | undefined): number {
  const m = heightCm / 100;
  const bmi = BMI_FOR_TYPE[bodyType ?? "average"] ?? 24;
  return bmi * m * m;
}

export function suggestNutritionTargets(input: TargetInput): MacroTargets | null {
  const heightCm = Number(input.heightCm);
  if (!heightCm || heightCm < 100 || heightCm > 250) return null;

  const current = input.bodyTypeCurrent ?? "average";
  const goal = input.bodyTypeGoal ?? current;
  const age = input.ageYears && input.ageYears > 14 ? input.ageYears : 30;

  const weightKg =
    input.weightKg != null && input.weightKg > 30
      ? input.weightKg
      : estimateWeightKg(heightCm, current);

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const gymDays = Math.min(7, Math.max(0, Number(input.gymDaysPerWeek) || 3));
  const activity = 1.2 + gymDays * 0.075;
  const tdee = bmr * activity;

  const fatDelta = (FATNESS[current] ?? 3) - (FATNESS[goal] ?? 3);
  const muscleDelta = (MUSCLE[goal] ?? 2) - (MUSCLE[current] ?? 2);

  let calAdj = 0;
  if (fatDelta > 0) calAdj -= Math.min(500, 150 + fatDelta * 100);
  else if (fatDelta < 0) calAdj += Math.min(400, 100 + Math.abs(fatDelta) * 80);
  if (muscleDelta > 0 && fatDelta <= 0) calAdj += 150;
  if (muscleDelta > 0 && fatDelta > 0) calAdj += 50;

  const calories = Math.round((tdee + calAdj) / 50) * 50;
  const clampedCal = Math.min(4500, Math.max(1400, calories));

  let proteinPerKg = 1.6;
  if (fatDelta > 0) proteinPerKg = 2.0;
  if (muscleDelta > 0) proteinPerKg = Math.max(proteinPerKg, 1.9);
  if (goal === "muscular") proteinPerKg = Math.max(proteinPerKg, 2.0);
  const protein = Math.round(weightKg * proteinPerKg);

  const fatPct = fatDelta > 0 ? 0.25 : 0.28;
  const fat = Math.round((clampedCal * fatPct) / 9);
  const carbCals = Math.max(0, clampedCal - protein * 4 - fat * 9);
  const carbs = Math.round(carbCals / 4);

  const fiber = Math.max(25, Math.round((clampedCal / 1000) * 14));
  const sugar = Math.min(50, Math.max(25, Math.round((clampedCal * 0.1) / 4)));
  const sodium = 2300;

  return {
    calories: clampedCal,
    protein,
    carbs,
    fat,
    fiber,
    sugar,
    sodium,
  };
}
