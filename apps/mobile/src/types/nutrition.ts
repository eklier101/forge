export type NutritionMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
};

export type NutritionTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
};

export type NutritionMeal = NutritionMacros & {
  id: string;
  date: string;
  loggedAt: string;
  source: string;
  name: string;
  portion?: number;
  recipeId?: string;
  presetId?: string;
  notes?: string;
};

export type NutritionPreset = NutritionMacros & {
  id: string;
  name: string;
  notes?: string;
};

export type NutritionRecipe = NutritionMacros & {
  id: string;
  name: string;
  servingsBase: number;
  servingUnit: "serving" | "g";
  ingredients?: string[];
  notes?: string;
};

export type NutritionToday = {
  date: string;
  meals: NutritionMeal[];
  totals: NutritionMacros;
  targets: NutritionTargets;
};

export type NutritionEstimate = NutritionMacros & {
  name: string;
  confidence?: number;
  source: "ai" | "fallback";
  error?: string;
};
